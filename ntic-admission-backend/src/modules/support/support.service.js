// src/modules/support/support.service.js
// Support requests: a parent writes to the school, staff reply, the whole thread is kept.
//
// Parent: at most 5 requests open at once, 50 messages per thread; can only see their own.
// Staff: campus officers and central administrators see requests tied to an application at their campuses (administrators also see requests
// with no application); finance officers see only "payment" requests at their campuses. Anything else looks like it does not exist.
// The email to the parent says there is a reply but never repeats it.

const repo = require('./support.repository');
const { createSchema, replySchema, listSchema } = require('./support.validation');
const notifications = require('../notifications/notifications.service');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const { ROLES } = require('../../constants/roles');
const AppError = require('../../utils/AppError');

const MAX_ACTIVE = 5;
const MAX_MESSAGES = 50;
const audit = (context, action, id, metadata, client) =>
  auditService.record({ actor: context.actor, action, resourceType: 'support_request', resourceId: id, ip: context.ip, userAgent: context.userAgent, metadata }, { client });

// ---------------- parent ----------------

async function create(input, context) {
  const data = validate(createSchema, input);
  return withTransaction(async (client) => {
    await repo.lockParent(context.actor.id, client);
    if (data.applicationId && !(await repo.findOwnApplication(data.applicationId, context.actor.id, client))) throw AppError.notFound('Application not found');
    if ((await repo.countActive(context.actor.id, client)) >= MAX_ACTIVE) {
      throw new AppError(`You already have ${MAX_ACTIVE} open requests. Please wait for a reply or close one first`, 409, 'LIMIT_REACHED');
    }
    const request = await repo.insertRequest({ parentUserId: context.actor.id, applicationId: data.applicationId, category: data.category, subject: data.subject }, client);
    await repo.insertMessage(request.id, context.actor.id, false, data.message, client);
    await audit(context, 'support.create', request.id, { category: data.category }, client);
    return request;
  });
}

const listMine = (parent) => repo.listForParent(parent.id);

async function ownRequest(id, parent) {
  assertUuid(id, 'Request id');
  const r = await repo.findRequest(id);
  if (!r || r.parentUserId !== parent.id) throw AppError.notFound('Request not found');
  return r;
}
async function getMine(id, parent) {
  const r = await ownRequest(id, parent);
  const { parentUserId, campusId, ...shown } = r;
  return { ...shown, messages: await repo.messages(id, false) };
}

async function replyAsParent(id, input, context) {
  assertUuid(id, 'Request id');
  const { body } = validate(replySchema, input);
  return withTransaction(async (client) => {
    const r = await repo.lockRequest(id, client);
    if (!r || r.parentUserId !== context.actor.id) throw AppError.notFound('Request not found');
    if (r.status === 'closed') throw new AppError('This request is closed. Please start a new one', 409, 'INVALID_STATE');
    if ((await repo.messageCount(id, client)) >= MAX_MESSAGES) throw new AppError('This conversation is full. Please start a new request', 409, 'LIMIT_REACHED');
    const message = await repo.insertMessage(id, context.actor.id, false, body, client);
    await repo.setStatus(id, 'open', client);
    await audit(context, 'support.reply', id, { fromStaff: false }, client);
    return message;
  });
}

async function closeAsParent(id, context) {
  assertUuid(id, 'Request id');
  await withTransaction(async (client) => {
    const r = await repo.lockRequest(id, client);
    if (!r || r.parentUserId !== context.actor.id) throw AppError.notFound('Request not found');
    if (r.status === 'closed') throw new AppError('This request is already closed', 409, 'INVALID_STATE');
    await repo.setStatus(id, 'closed', client);
    await audit(context, 'support.close', id, { by: 'parent' }, client);
  });
  return { id, status: 'closed' };
}

// ---------------- staff ----------------

// null = may see everything, otherwise the campuses and (for finance) the one category
async function visibility(actor) {
  return { scope: await getCampusScope(actor), onlyCategory: actor.role === ROLES.FINANCE_OFFICER ? 'payment' : null };
}
// Can this staff member see this request?
function visible(r, { scope, onlyCategory }) {
  if (onlyCategory && r.category !== onlyCategory) return false;
  if (!scope) return true;
  return !!r.campusId && scope.includes(r.campusId);
}

async function listForStaff(query, actor) {
  const filters = validate(listSchema, query);
  const v = await visibility(actor);
  return repo.listForStaff(filters, v.scope, v.onlyCategory);
}
async function getForStaff(id, actor) {
  assertUuid(id, 'Request id');
  const r = await repo.findRequest(id);
  if (!r || !visible(r, await visibility(actor))) throw AppError.notFound('Request not found');
  const { parentUserId, campusId, ...shown } = r;
  return { ...shown, messages: await repo.messages(id, true) };
}

async function guardedLock(id, context, client) {
  assertUuid(id, 'Request id');
  const r = await repo.lockRequest(id, client);
  if (!r || !visible(r, await visibility(context.actor))) throw AppError.notFound('Request not found');
  return r;
}

async function replyAsStaff(id, input, context) {
  const { body } = validate(replySchema, input);
  return withTransaction(async (client) => {
    const r = await guardedLock(id, context, client);
    if (r.status === 'closed') throw new AppError('This request is closed', 409, 'INVALID_STATE');
    if ((await repo.messageCount(id, client)) >= MAX_MESSAGES) throw new AppError('This conversation is full. Close it and ask the parent to start a new one', 409, 'LIMIT_REACHED');
    const message = await repo.insertMessage(id, context.actor.id, true, body, client);
    await repo.setStatus(id, 'answered', client);
    await audit(context, 'support.reply', id, { fromStaff: true }, client);
    await notifications.queueForUser(client, r.parentUserId, 'support_reply', { requestSubject: r.subject });
    return message;
  });
}

async function closeAsStaff(id, context) {
  await withTransaction(async (client) => {
    const r = await guardedLock(id, context, client);
    if (r.status === 'closed') throw new AppError('This request is already closed', 409, 'INVALID_STATE');
    await repo.setStatus(id, 'closed', client);
    await audit(context, 'support.close', id, { by: 'staff' }, client);
  });
  return { id, status: 'closed' };
}

module.exports = { create, listMine, getMine, replyAsParent, closeAsParent, listForStaff, getForStaff, replyAsStaff, closeAsStaff };
