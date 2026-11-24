// src/modules/documents/documentTypes.admin.service.js
// The document checklist the application form asks for. Central administrators only.
//
// What a change does (and does not do):
//   - It changes what parents are ASKED for from now on: the checklist on the form and the check at "submit".
//   - It never touches files already uploaded, and never changes an application that was already submitted.
//   - A type is never deleted (uploaded files point at it). To stop asking for one, switch it off with isActive: false.

const repo = require('./documentTypes.admin.repository');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const AppError = require('../../utils/AppError');
const { createSchema, updateSchema } = require('./documentTypes.admin.validation');

const MAX_TYPES = 30;
const SNAPSHOT = (t) => ({ code: t.code, name: t.name, required: t.required, allowedMimes: t.allowedMimes, maxBytes: t.maxBytes, sortOrder: t.sortOrder, isActive: t.isActive });
const auditEvent = (context, action, id, metadata) => ({
  actor: context.actor, action, resourceType: 'document_type', resourceId: id, ip: context.ip, userAgent: context.userAgent, metadata,
});

async function listTypes() {
  return repo.list();
}

async function createType(input, context) {
  const data = validate(createSchema, input);
  let id;
  try {
    id = await withTransaction(async (client) => {
      await repo.lockTable(client);
      const { total, maxSort } = await repo.counts(client);
      if (total >= MAX_TYPES) throw new AppError(`There can be at most ${MAX_TYPES} document types. Switch off ones you no longer need and edit them instead`, 409, 'LIMIT_REACHED');
      const newId = await repo.insert({ ...data, sortOrder: data.sortOrder ?? maxSort + 1 }, client);
      await auditService.record(auditEvent(context, 'document_type.create', newId, { after: SNAPSHOT({ ...data, isActive: true, sortOrder: data.sortOrder ?? maxSort + 1 }) }), { client });
      return newId;
    });
  } catch (err) {
    if (err.code === '23505' && /code/.test(err.constraint || '')) throw AppError.conflict(`A document type with the code "${data.code}" already exists`);
    throw err;
  }
  return repo.findById(id);
}

async function updateType(id, input, context) {
  assertUuid(id, 'Document type id');
  const changes = validate(updateSchema, input);
  await withTransaction(async (client) => {
    const current = await repo.lockById(id, client);
    if (!current) throw AppError.notFound('Document type not found');
    const next = { ...current, ...changes };
    // The form must always have something to show a parent: refuse to switch off the last active type
    if (changes.isActive === false && current.isActive) {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM document_types WHERE is_active AND id <> $1', [id]);
      if (rows[0].n === 0) throw new AppError('You cannot switch off the last active document type', 409, 'LAST_ACTIVE');
    }
    await repo.update(id, next, client);
    await auditService.record(auditEvent(context, 'document_type.update', id, { before: SNAPSHOT(current), after: SNAPSHOT(next) }), { client });
  });
  return repo.findById(id);
}

module.exports = { listTypes, createType, updateType, MAX_TYPES };
