// src/modules/duplicates/duplicates.service.js
// Finds applications that may be the same child applying twice, so staff can look at them. It never merges, deletes or blocks
// anything: a parent is never refused because of this, and staff decide.
//
// Two rules (applications in the same cycle, drafts and withdrawn ones ignored):
//   same_name_and_birth_date    same first name + surname + date of birth (accents, capitals, spaces and punctuation ignored)
//   same_birth_date_and_phone   same date of birth + same contact phone (catches a mistyped name). Twins can match; dismiss those.
//
// Who sees what: a central administrator sees every group. A campus officer sees a group only when at least two of its applications are
// in their campuses, and sees only those applications. Such a group is marked partial, and only a central administrator may dismiss it.

const crypto = require('crypto');
const repo = require('./duplicates.repository');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { getCampusScope } = require('../../utils/campusScope');
const AppError = require('../../utils/AppError');
const { listSchema, dismissSchema, restoreSchema } = require('./duplicates.validation');

const RULE_LABELS = {
  same_name_and_birth_date: 'Same name and date of birth',
  same_birth_date_and_phone: 'Same date of birth and phone number',
};

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const phoneKey = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-10) : ''; };
const fingerprint = (rule, ids) => crypto.createHash('sha1').update(`${rule}:${[...ids].sort().join(',')}`).digest('hex');

// All groups of two or more, over ALL campuses (the caller narrows them for what a user may see)
function findGroups(rows) {
  const groups = [];
  const seenSets = new Set();
  const add = (rule, buckets) => {
    for (const members of buckets.values()) {
      if (members.length < 2) continue;
      const ids = members.map((m) => m.id);
      const setKey = [...ids].sort().join(',');
      if (seenSets.has(setKey)) continue; // the same applications already reported under the first rule
      seenSets.add(setKey);
      groups.push({ key: fingerprint(rule, ids), rule, members });
    }
  };
  const bucket = (keyOf) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  };
  add('same_name_and_birth_date', bucket((r) => (norm(r.firstName) && norm(r.surname) && r.dateOfBirth ? `${norm(r.firstName)}|${norm(r.surname)}|${r.dateOfBirth}` : null)));
  add('same_birth_date_and_phone', bucket((r) => (phoneKey(r.phone) && r.dateOfBirth ? `${phoneKey(r.phone)}|${r.dateOfBirth}` : null)));
  return groups;
}

const presentMember = (m) => ({
  applicationId: m.id, applicationNumber: m.applicationNumber, status: m.status, campus: m.campusName,
  candidate: [m.firstName, m.middleName, m.surname].filter(Boolean).join(' '), dateOfBirth: m.dateOfBirth,
  parentEmail: m.parentEmail, phone: m.phone, submittedAt: m.submittedAt,
});

async function resolveCycle(cycleId) {
  const cycle = await repo.findCycle(cycleId);
  if (!cycle) throw AppError.notFound(cycleId ? 'Admission cycle not found' : 'There is no admission cycle yet');
  return cycle;
}

async function list(query, actor) {
  const f = validate(listSchema, query);
  const cycle = await resolveCycle(f.cycleId);
  const scope = await getCampusScope(actor);
  const reviews = new Map((await repo.listReviews(cycle.id)).map((r) => [r.key, r]));
  const out = [];
  for (const g of findGroups(await repo.listCandidates(cycle.id))) {
    const visible = scope ? g.members.filter((m) => scope.includes(m.campusId)) : g.members;
    if (visible.length < 2) continue;
    const review = reviews.get(g.key);
    if (review && f.includeDismissed !== 'true') continue;
    out.push({
      key: g.key, rule: g.rule, reason: RULE_LABELS[g.rule],
      partial: visible.length < g.members.length, otherCampusApplications: g.members.length - visible.length,
      applications: visible.map(presentMember),
      dismissed: review ? { note: review.note, by: [review.firstName, review.lastName].filter(Boolean).join(' ') || review.email, at: review.reviewedAt } : null,
    });
  }
  return { cycle, groups: out, count: out.length };
}

// Finds one current group by its key (over all campuses), and checks the actor may act on it
async function findActionableGroup(key, cycleId, actor) {
  const cycle = await resolveCycle(cycleId);
  const group = findGroups(await repo.listCandidates(cycle.id)).find((g) => g.key === key);
  if (!group) throw AppError.notFound('This group no longer exists. The applications may have changed. Reload the list');
  const scope = await getCampusScope(actor);
  if (scope) {
    const inScope = group.members.filter((m) => scope.includes(m.campusId));
    if (inScope.length < 2) throw AppError.notFound('This group no longer exists. The applications may have changed. Reload the list');
    if (inScope.length < group.members.length) {
      throw AppError.forbidden('This group includes applications from other campuses. Ask a central administrator to review it');
    }
  }
  return { cycle, group };
}

async function dismiss(input, context) {
  const data = validate(dismissSchema, input);
  const { cycle, group } = await findActionableGroup(data.key, data.cycleId, context.actor);
  const result = await withTransaction(async (client) => {
    const id = await repo.insertReview({ key: group.key, cycleId: cycle.id, rule: group.rule, note: data.note, userId: context.actor.id }, client);
    if (!id) return { id: await repo.findReviewId(group.key, client), already: true }; // dismissed a moment ago by someone else
    await auditService.record({
      actor: context.actor, action: 'duplicate.dismiss', resourceType: 'duplicate_review', resourceId: id, ip: context.ip, userAgent: context.userAgent,
      metadata: { rule: group.rule, applicationNumbers: group.members.map((m) => m.applicationNumber), note: data.note },
    }, { client });
    return { id, already: false };
  });
  return { dismissed: true, already: result.already };
}

async function restore(input, context) {
  const data = validate(restoreSchema, input);
  const { group } = await findActionableGroup(data.key, data.cycleId, context.actor);
  const restored = await withTransaction(async (client) => {
    const id = await repo.deleteReview(group.key, client);
    if (id) {
      await auditService.record({
        actor: context.actor, action: 'duplicate.restore', resourceType: 'duplicate_review', resourceId: id, ip: context.ip, userAgent: context.userAgent,
        metadata: { rule: group.rule, applicationNumbers: group.members.map((m) => m.applicationNumber) },
      }, { client });
    }
    return Boolean(id);
  });
  if (!restored) throw new AppError('This group was not dismissed', 409, 'INVALID_STATE');
  return { restored: true };
}

module.exports = { list, dismiss, restore, findGroups, norm };
