// src/modules/interviews/interviews.service.js
// Online interviews: scheduling, who may see what, outcomes, and scorecards.
//
// Lock order everywhere: application -> interview -> scorecard. Same order in every function, so nothing can deadlock.
// Who is who:
//   central_admin    everything, all campuses
//   campus_officer   schedules, cancels and marks outcomes for their own campuses; can read submitted scorecards there
//   reviewer         reads interviews and submitted scorecards for their own campuses
//   interviewer      sees ONLY interviews assigned to them (campus scope does not matter), and is the only one who writes a scorecard

const repo = require('./interviews.repository');
const paymentsRepo = require('../payments/payments.repository');
const auditService = require('../audit/audit.service');
const notifications = require('../notifications/notifications.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const {
  scheduleSchema, cancelSchema, outcomeSchema, listSchema,
  createCriterionSchema, updateCriterionSchema, saveScorecardSchema, reopenSchema,
} = require('./interviews.validation');

const inScope = (scope, campusId) => !scope || scope.includes(campusId);
const isInterviewer = (actor) => actor.role === ROLES.INTERVIEWER;
const isAdmin = (actor) => actor.role === ROLES.CENTRAL_ADMIN;
const invalidState = (message, code = 'INVALID_STATE') => new AppError(message, 409, code);
const auditEvent = (context, action, resourceType, resourceId, metadata) => ({
  actor: context.actor, action, resourceType, resourceId, ip: context.ip, userAgent: context.userAgent, metadata,
});
const ms = (value) => new Date(value).getTime();

// ===================== looking at interviews =====================

// What a staff member or interviewer may see of an interview. Anything they may not see is "not found".
async function loadVisible(applicationId, actor) {
  assertUuid(applicationId, 'Application id');
  const basics = await repo.findApplicationBasics(applicationId);
  if (!basics) throw AppError.notFound('Application not found');
  const interview = await repo.findInterviewByApplication(applicationId);
  if (isInterviewer(actor)) {
    if (!interview || interview.interviewerId !== actor.id) throw AppError.notFound('Interview not found');
  } else if (!inScope(await getCampusScope(actor), basics.campusId)) {
    throw AppError.notFound('Application not found');
  }
  return { basics, interview };
}

function presentInterview(i, { withHistory } = {}) {
  const { applicationStatus, scorecardStatus, interviewerName, interviewerEmail, interviewerId, ...rest } = i;
  return { ...rest, interviewer: { id: interviewerId, name: interviewerName, email: interviewerEmail }, scorecardStatus: scorecardStatus || 'not_started' };
}

function presentNone(basics) {
  return {
    status: 'not_scheduled', applicationId: basics.id, applicationNumber: basics.applicationNumber,
    candidate: `${basics.firstName} ${basics.surname}`, campusName: basics.campusName,
    categoryName: basics.categoryName, program: basics.program,
    availabilityNote: basics.availabilityNote, // the parent's preferred times: a request, not a booking (BR-005)
  };
}

async function getInterview(applicationId, actor) {
  const { basics, interview } = await loadVisible(applicationId, actor);
  if (!interview) return presentNone(basics);
  const out = { ...presentInterview(interview), availabilityNote: basics.availabilityNote };
  if (!isInterviewer(actor)) out.history = await repo.listHistory(interview.id);
  return out;
}

async function listInterviews(query, actor) {
  const f = validate(listSchema, query);
  const limit = Math.min(Number(f.limit) || 50, 200);
  const offset = Number(f.offset) || 0;
  // An interviewer sees their own list, whatever filters they send; everyone else is limited to their campuses
  const scoped = isInterviewer(actor)
    ? { interviewerId: actor.id, campusScope: null }
    : { interviewerId: f.interviewerId, campusScope: await getCampusScope(actor) };
  const { total, rows } = await repo.listInterviews({ ...f, ...scoped, limit, offset });
  return { total, limit, offset, items: rows.map((r) => presentInterview(r)) };
}

async function listInterviewers(actor) {
  return repo.listInterviewers(await getCampusScope(actor));
}

// What a parent may see: the schedule, never the interviewer's details or any scores
async function getInterviewForParent(applicationId, parent) {
  assertUuid(applicationId, 'Application id');
  const basics = await repo.findApplicationBasics(applicationId);
  if (!basics || basics.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  const i = await repo.findInterviewByApplication(applicationId);
  if (!i || i.status === 'cancelled') {
    return {
      status: i ? 'cancelled' : 'not_scheduled',
      note: 'Your preferred interview times are only requests. If an interview is needed, NTIC will confirm the time with you.',
      availabilityNote: basics.availabilityNote,
    };
  }
  const { startsAt, endsAt, durationMinutes, timezone, platform, meetingUrl, location, instructions, status } = i;
  const open = status === 'scheduled';
  return { status, startsAt, endsAt, durationMinutes, timezone, platform, meetingUrl: open ? meetingUrl : null, location: open ? location : null, instructions: open ? instructions : null };
}

// ===================== scheduling =====================

const sameDetails = (existing, d) =>
  ms(existing.startsAt) === ms(d.startsAt) && existing.interviewerId === d.interviewerId &&
  existing.durationMinutes === d.durationMinutes && existing.timezone === d.timezone && existing.platform === d.platform &&
  (existing.meetingUrl || null) === (d.meetingUrl || null) && (existing.location || null) === (d.location || null) &&
  (existing.instructions || null) === (d.instructions || null);

// Schedules the interview, or moves it. Staff only.
async function scheduleInterview(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const data = validate(scheduleSchema, input);
  const details = {
    interviewerId: data.interviewerId, startsAt: data.startsAt, durationMinutes: data.durationMinutes ?? 30,
    timezone: data.timezone || 'Africa/Lagos', platform: data.platform, meetingUrl: data.meetingUrl, location: data.location, instructions: data.instructions,
  };
  const scope = await getCampusScope(context.actor);

  try {
    await withTransaction(async (client) => {
      const application = await repo.lockApplication(applicationId, client);
      if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');
      if (!LIVE_STATUSES.includes(application.status)) throw invalidState('Only submitted applications can be scheduled for an interview');
      const paid = await paymentsRepo.sumSuccessful(application.id, client);
      if (paid < application.feeAmountMinor) throw new AppError('The application fee must be paid before an interview can be scheduled', 409, 'PAYMENT_REQUIRED');

      if (!(await repo.findInterviewerForCampus(details.interviewerId, application.campusId, client))) {
        throw AppError.validation([{ field: 'interviewerId', message: 'This person is not an active interviewer for the application\'s campus' }]);
      }

      const existing = await repo.lockInterviewByApplication(applicationId, client);
      let interviewId;
      let action = 'scheduled';
      if (!existing) {
        interviewId = await repo.insertInterview({ applicationId, ...details, createdBy: context.actor.id }, client);
      } else {
        interviewId = existing.id;
        if (existing.status === 'completed') throw invalidState('This interview has already taken place');
        if (existing.status === 'scheduled') {
          if (sameDetails(existing, details)) throw invalidState('Nothing has changed: the interview already has these details');
          if (!data.reason) throw AppError.validation([{ field: 'reason', message: 'A reason is required to reschedule' }]);
          action = 'rescheduled';
        }
        await repo.updateInterview(interviewId, details, client);
      }

      await repo.addHistory({
        interviewId, action, fromStartsAt: existing ? existing.startsAt : null, toStartsAt: details.startsAt,
        fromInterviewerId: existing ? existing.interviewerId : null, toInterviewerId: details.interviewerId,
        reason: data.reason, actorId: context.actor.id,
      }, client);
      await notifications.queueForApplication(client, applicationId, action === 'rescheduled' ? 'interview_rescheduled' : 'interview_scheduled', {
        startsAt: details.startsAt, timezone: details.timezone, durationMinutes: details.durationMinutes,
        platform: details.platform, meetingUrl: details.meetingUrl, location: details.location, instructions: details.instructions,
      });
      await auditService.record(auditEvent(context, `interview.${action === 'rescheduled' ? 'reschedule' : 'schedule'}`, 'interview', interviewId, {
        applicationNumber: application.applicationNumber, interviewerId: details.interviewerId, startsAt: details.startsAt, reason: data.reason,
      }), { client });
    });
  } catch (err) {
    // 23P01 = the database refused an overlapping booking for this interviewer
    if (err.code === '23P01') throw new AppError('This interviewer already has an interview at that time', 409, 'INTERVIEWER_BUSY');
    throw err;
  }
  return getInterview(applicationId, context.actor);
}

async function cancelInterview(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const { reason } = validate(cancelSchema, input);
  const scope = await getCampusScope(context.actor);

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');
    const interview = await repo.lockInterviewByApplication(applicationId, client);
    if (!interview || interview.status !== 'scheduled') throw invalidState('There is no scheduled interview to cancel');

    await repo.setInterviewStatus(interview.id, 'cancelled', client);
    await repo.addHistory({ interviewId: interview.id, action: 'cancelled', fromStartsAt: interview.startsAt, fromInterviewerId: interview.interviewerId, reason, actorId: context.actor.id }, client);
    await notifications.queueForApplication(client, applicationId, 'interview_cancelled', {});
    await auditService.record(auditEvent(context, 'interview.cancel', 'interview', interview.id, { applicationNumber: application.applicationNumber, reason }), { client });
  });
  return getInterview(applicationId, context.actor);
}

// Marks whether the candidate came. The staff who schedule, or the assigned interviewer, may do this once the time has come.
async function recordOutcome(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const data = validate(outcomeSchema, input);
  const actor = context.actor;
  const scope = isInterviewer(actor) ? null : await getCampusScope(actor);
  const target = data.attended ? 'completed' : 'absent';

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application) throw AppError.notFound('Application not found');
    if (!isInterviewer(actor) && !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');
    const interview = await repo.lockInterviewByApplication(applicationId, client);
    if (!interview || (isInterviewer(actor) && interview.interviewerId !== actor.id)) throw AppError.notFound('Interview not found');
    if (interview.status === 'cancelled') throw invalidState('This interview was cancelled');

    if (interview.status === 'scheduled') {
      if (ms(interview.startsAt) > Date.now()) throw invalidState('The interview has not started yet', 'INTERVIEW_NOT_STARTED');
    } else {
      if (interview.status === target) throw invalidState(`This interview is already marked as ${data.attended ? 'completed' : 'absent'}`);
      if (!data.reason) throw AppError.validation([{ field: 'reason', message: 'A reason is required to change an outcome that was already recorded' }]);
      if (target === 'absent' && (await repo.lockScorecard(interview.id, client))) {
        throw invalidState('A scorecard already exists for this interview, so it cannot be marked absent', 'SCORECARD_EXISTS');
      }
    }
    await repo.setInterviewStatus(interview.id, target, client);
    await repo.addHistory({ interviewId: interview.id, action: target, fromStartsAt: interview.startsAt, toStartsAt: interview.startsAt, reason: data.reason, actorId: actor.id }, client);
    await auditService.record(auditEvent(context, 'interview.outcome', 'interview', interview.id, { applicationNumber: application.applicationNumber, attended: data.attended, reason: data.reason }), { client });
  });
  return getInterview(applicationId, actor);
}

// ===================== scorecard criteria =====================

async function listCriteria(actor) {
  return repo.listCriteria({ includeInactive: isAdmin(actor) });
}

async function createCriterion(input, context) {
  const data = validate(createCriterionSchema, input);
  try {
    const id = await withTransaction(async (client) => {
      const criterionId = await repo.insertCriterion(data, client);
      await auditService.record(auditEvent(context, 'scorecard_criterion.create', 'scorecard_criterion', criterionId, { key: data.key, label: data.label }), { client });
      return criterionId;
    });
    return repo.findCriterion(id);
  } catch (err) {
    if (err.code === '23505') throw new AppError(`A criterion with the key "${data.key}" already exists`, 409, 'CONFLICT');
    throw err;
  }
}

async function updateCriterion(id, input, context) {
  assertUuid(id, 'Criterion id');
  const data = validate(updateCriterionSchema, input);
  await withTransaction(async (client) => {
    await repo.lockCriteriaTable(client); // two edits at once cannot both switch off "the last active" criterion
    const current = await repo.findCriterion(id, client);
    if (!current) throw AppError.notFound('Criterion not found');
    if (data.active === false && current.active && (await repo.countActiveCriteria(client)) <= 1) {
      throw invalidState('At least one criterion must stay active');
    }
    await repo.updateCriterion(id, data, client);
    await auditService.record(auditEvent(context, 'scorecard_criterion.update', 'scorecard_criterion', id, { key: current.key, changes: data }), { client });
  });
  return repo.findCriterion(id);
}

// ===================== scorecards =====================

const totalsOf = (scores) => {
  const score = scores.reduce((sum, s) => sum + s.score, 0);
  const maxScore = scores.reduce((sum, s) => sum + s.maxScore, 0);
  return { score, maxScore, percentage: maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : null };
};
const snapshotOf = (card, scores) => ({ recommendation: card.recommendation || null, notes: card.notes || null, scores: scores.map(({ criterion, label, score, maxScore, comment }) => ({ criterion, label, score, maxScore, comment: comment || null })) });

async function getScorecard(applicationId, actor) {
  const { interview } = await loadVisible(applicationId, actor);
  if (!interview) throw AppError.notFound('Interview not found');
  const mine = isInterviewer(actor); // already known to be the assigned one
  const canSeeDraft = mine || isAdmin(actor);
  const card = await repo.findScorecard(interview.id);

  const base = { interviewId: interview.id, interviewStatus: interview.status };
  // The form the interviewer fills in
  const criteria = mine && interview.status === 'completed' && (!card || card.status === 'draft') ? await repo.listCriteria({ includeInactive: false }) : undefined;
  if (!card) return { ...base, status: 'not_started', ...(criteria ? { criteria } : {}) };
  if (card.status === 'draft' && !canSeeDraft) return { ...base, status: 'not_submitted' };

  const scores = await repo.listScores(card.id);
  const out = { ...base, ...card, scores, totals: totalsOf(scores), ...(criteria ? { criteria } : {}) };
  if (isAdmin(actor)) out.history = await repo.listScorecardHistory(card.id);
  return out;
}

// Checks the person writing is the assigned interviewer and the interview was held. Returns the locked rows.
async function lockForWriting(applicationId, actor, client) {
  const application = await repo.lockApplication(applicationId, client);
  if (!application) throw AppError.notFound('Interview not found');
  const interview = await repo.lockInterviewByApplication(applicationId, client);
  if (!interview || interview.interviewerId !== actor.id) throw AppError.notFound('Interview not found');
  if (interview.status !== 'completed') {
    throw invalidState('A scorecard can only be written after the interview is marked as completed', 'NOT_COMPLETED');
  }
  return { application, interview };
}

async function saveScorecard(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const data = validate(saveScorecardSchema, input);

  await withTransaction(async (client) => {
    const { interview } = await lockForWriting(applicationId, context.actor, client);
    const card = await repo.lockScorecard(interview.id, client);
    if (card && card.status === 'submitted') throw invalidState('This scorecard has been submitted. Ask an administrator to reopen it if it needs a correction', 'SUBMITTED');

    const criteria = await repo.listCriteria({ includeInactive: false }, client);
    const byKey = new Map(criteria.map((c) => [c.key, c]));
    const problems = [];
    const lines = data.scores.map((s, i) => {
      const c = byKey.get(s.criterion);
      if (!c) { problems.push({ field: `scores.${i}.criterion`, message: `"${s.criterion}" is not a criterion on the scorecard` }); return null; }
      if (s.score > c.maxScore) problems.push({ field: `scores.${i}.score`, message: `${c.label}: the score cannot be more than ${c.maxScore}` });
      return { criterion: c.key, label: c.label, maxScore: c.maxScore, score: s.score, comment: s.comment };
    });
    if (problems.length) throw AppError.validation(problems);

    let cardId;
    if (card) {
      cardId = card.id;
      await repo.updateScorecardDraft({ id: cardId, recommendation: data.recommendation, notes: data.notes, writerId: context.actor.id }, client);
    } else {
      cardId = await repo.insertScorecard({ interviewId: interview.id, recommendation: data.recommendation, notes: data.notes, writerId: context.actor.id }, client);
    }
    await repo.replaceScores(cardId, lines, client);
  });
  return getScorecard(applicationId, context.actor);
}

async function submitScorecard(applicationId, context) {
  assertUuid(applicationId, 'Application id');

  await withTransaction(async (client) => {
    const { application, interview } = await lockForWriting(applicationId, context.actor, client);
    const card = await repo.lockScorecard(interview.id, client);
    if (!card) throw invalidState('There is no scorecard to submit yet. Save your scores first', 'NO_SCORECARD');
    if (card.status === 'submitted') throw invalidState('This scorecard has already been submitted', 'SUBMITTED');

    const scores = await repo.listScores(card.id, client);
    const criteria = await repo.listCriteria({ includeInactive: false }, client);
    const have = new Map(scores.map((s) => [s.criterion, s]));
    const problems = [];
    for (const c of criteria) {
      const s = have.get(c.key);
      if (!s) problems.push({ field: 'scores', message: `${c.label} has not been scored` });
      else if (s.maxScore !== c.maxScore) problems.push({ field: 'scores', message: `${c.label}: the scale changed to ${c.maxScore}. Save the scorecard again before submitting` });
    }
    if (!card.recommendation) problems.push({ field: 'recommendation', message: 'Choose a recommendation before submitting' });
    if (problems.length) throw AppError.validation(problems);

    await repo.markSubmitted(card.id, client);
    await repo.addScorecardHistory({ scorecardId: card.id, action: 'submitted', snapshot: snapshotOf(card, scores), actorId: context.actor.id }, client);
    await auditService.record(auditEvent(context, 'scorecard.submit', 'interview_scorecard', card.id, { applicationNumber: application.applicationNumber, recommendation: card.recommendation }), { client });
  });
  return getScorecard(applicationId, context.actor);
}

// An administrator lets the interviewer correct a submitted scorecard. The old version stays in the history.
async function reopenScorecard(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const { reason } = validate(reopenSchema, input);

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application) throw AppError.notFound('Interview not found');
    const interview = await repo.lockInterviewByApplication(applicationId, client);
    const card = interview && (await repo.lockScorecard(interview.id, client));
    if (!card) throw AppError.notFound('Scorecard not found');
    if (card.status !== 'submitted') throw invalidState('This scorecard has not been submitted, so there is nothing to reopen');

    const scores = await repo.listScores(card.id, client);
    await repo.reopenScorecard(card.id, client);
    await repo.addScorecardHistory({ scorecardId: card.id, action: 'reopened', snapshot: snapshotOf(card, scores), reason, actorId: context.actor.id }, client);
    await auditService.record(auditEvent(context, 'scorecard.reopen', 'interview_scorecard', card.id, { applicationNumber: application.applicationNumber, reason }), { client });
  });
  return getScorecard(applicationId, context.actor);
}

module.exports = {
  getInterview, listInterviews, listInterviewers, getInterviewForParent,
  scheduleInterview, cancelInterview, recordOutcome,
  listCriteria, createCriterion, updateCriterion,
  getScorecard, saveScorecard, submitScorecard, reopenScorecard,
};
