// src/modules/corrections/corrections.service.js
// Post-submission corrections. A parent asks; staff decide; only an APPROVED request changes the child's profile.
//
// Rules: only while the application is live (submitted ... decision pending); one open request per field; at most 5 open and 20 in total
// per application; a date of birth can only be changed by a central administrator; staff only see their own campuses.
// The parent's email and the audit log name the field but never repeat the values.

const repo = require('./corrections.repository');
const { FIELDS, createSchema, parsedValue, approveSchema, rejectSchema, listSchema } = require('./corrections.validation');
const notifications = require('../notifications/notifications.service');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const { ROLES } = require('../../constants/roles');
const AppError = require('../../utils/AppError');

const MAX_PENDING = 5;
const MAX_TOTAL = 20;
const inScope = (scope, campusId) => !scope || scope.includes(campusId);
const audit = (context, action, id, metadata, client) =>
  auditService.record({ actor: context.actor, action, resourceType: 'application_correction', resourceId: id, ip: context.ip, userAgent: context.userAgent, metadata }, { client });

async function createForParent(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const data = validate(createSchema, input);
  const value = parsedValue(data.field, data.newValue);
  return withTransaction(async (client) => {
    const app = await repo.findApplication(applicationId, client);
    if (!app || app.parentUserId !== context.actor.id) throw AppError.notFound('Application not found');
    if (!LIVE_STATUSES.includes(app.status)) {
      throw new AppError(app.status === 'draft' ? 'This application is still a draft: edit the details directly' : 'Corrections can only be requested while the application is under consideration', 409, 'INVALID_STATE');
    }
    // serialise requests for the same child so two tabs cannot slip past the limits
    await repo.lockApplicant(app.applicantId, client);
    if (String(app[data.field] ?? '') === String(value ?? '')) throw AppError.validation([{ field: 'newValue', message: 'That is already the value on the application' }]);
    const c = await repo.counts(applicationId, client);
    if (c.pending >= MAX_PENDING) throw new AppError(`You already have ${MAX_PENDING} corrections waiting. Wait for a decision before asking for more`, 409, 'LIMIT_REACHED');
    if (c.total >= MAX_TOTAL) throw new AppError('The limit of corrections for this application has been reached. Please contact the school', 409, 'LIMIT_REACHED');
    let created;
    try {
      created = await repo.insert({ applicationId, field: data.field, oldValue: app[data.field] ?? null, newValue: value, reason: data.reason, requestedBy: context.actor.id }, client);
    } catch (err) {
      if (err.code === '23505') throw AppError.conflict(`A correction to the ${FIELDS[data.field].label} is already waiting for a decision`);
      throw err;
    }
    await audit(context, 'correction.request', created.id, { applicationId, field: data.field }, client);
    return created;
  });
}

async function listForParent(applicationId, parent) {
  assertUuid(applicationId, 'Application id');
  const app = await repo.findApplication(applicationId);
  if (!app || app.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  return repo.listForApplication(applicationId);
}

async function cancelForParent(applicationId, correctionId, context) {
  assertUuid(applicationId, 'Application id');
  assertUuid(correctionId, 'Correction id');
  await withTransaction(async (client) => {
    const c = await repo.lockWithApplication(correctionId, client);
    if (!c || c.applicationId !== applicationId || c.parentUserId !== context.actor.id) throw AppError.notFound('Correction not found');
    if (c.status !== 'pending') throw new AppError('Only a correction that is still waiting can be cancelled', 409, 'INVALID_STATE');
    await repo.cancel(correctionId, client);
    await audit(context, 'correction.cancel', correctionId, { applicationId, field: c.field }, client);
  });
  return { id: correctionId, status: 'cancelled' };
}

async function listForStaff(query, actor) {
  const filters = validate(listSchema, query);
  return repo.listForStaff(filters, await getCampusScope(actor));
}

async function loadForDecision(id, context, client) {
  assertUuid(id, 'Correction id');
  const c = await repo.lockWithApplication(id, client);
  // a request outside the officer's campuses looks like it does not exist
  if (!c || !inScope(await getCampusScope(context.actor), c.campusId)) throw AppError.notFound('Correction not found');
  if (c.status !== 'pending') throw new AppError(`This correction was already ${c.status}`, 409, 'INVALID_STATE');
  return c;
}

async function approve(id, input, context) {
  const { note } = validate(approveSchema, input);
  return withTransaction(async (client) => {
    const c = await loadForDecision(id, context, client);
    if (FIELDS[c.field].adminOnly && context.actor.role !== ROLES.CENTRAL_ADMIN) {
      throw AppError.forbidden(`Only a central administrator can approve a change to the ${FIELDS[c.field].label}`);
    }
    if (!LIVE_STATUSES.includes(c.applicationStatus)) throw new AppError('The application has moved on, so this correction can no longer be applied. Reject it instead', 409, 'INVALID_STATE');
    try {
      await repo.applyToApplicant(c.applicantId, c.field, c.newValue, client);
    } catch (err) {
      if (err.code === '23505') throw AppError.conflict('This change would make the child match another child already registered by the same parent. Reject it, or ask the parent to contact the school');
      throw err;
    }
    await repo.setDecision(id, 'approved', context.actor.id, note, client);
    await audit(context, 'correction.approve', id, { applicationId: c.applicationId, field: c.field }, client);
    await notifications.queueForApplication(client, c.applicationId, 'correction_approved', { fieldLabel: FIELDS[c.field].label, note: note || null });
    return { id, status: 'approved' };
  });
}

async function reject(id, input, context) {
  const { note } = validate(rejectSchema, input);
  return withTransaction(async (client) => {
    const c = await loadForDecision(id, context, client);
    await repo.setDecision(id, 'rejected', context.actor.id, note, client);
    await audit(context, 'correction.reject', id, { applicationId: c.applicationId, field: c.field }, client);
    await notifications.queueForApplication(client, c.applicationId, 'correction_rejected', { fieldLabel: FIELDS[c.field].label, note });
    return { id, status: 'rejected' };
  });
}

module.exports = { createForParent, listForParent, cancelForParent, listForStaff, approve, reject };
