// src/modules/audit/audit.service.js
// Writing and reading the audit trail.
//
// NEVER put passwords, tokens, or password hashes in an event (including in metadata).

const repo = require('./audit.repository');
const { validate } = require('../../utils/validate');
const { listAuditLogsSchema } = require('./audit.validation');

// Turn the friendly event we are given into the exact shape the repository stores
function normalize(event) {
  const actor = event.actor || null;
  return {
    actorUserId: actor ? actor.id : null,
    actorEmail: (actor ? actor.email : event.actorEmail || null)?.slice(0, 254) ?? null,
    actorRole: actor ? actor.role : null,
    action: event.action,
    outcome: event.outcome || 'success',
    resourceType: event.resourceType || null,
    resourceId: event.resourceId ? String(event.resourceId) : null,
    ip: event.ip || null,
    userAgent: event.userAgent ? event.userAgent.slice(0, 255) : null,
    metadata: event.metadata || {},
  };
}

// Use inside a transaction for ADMIN ACTIONS: if the log cannot be written, the action is undone too.
async function record(event, { client } = {}) {
  await repo.insertEvent(normalize(event), client);
}

// Use for events like sign-in: a logging problem must not stop someone signing in.
async function recordSafely(event) {
  try {
    await record(event);
  } catch (err) {
    console.error(`Audit log write failed for "${event.action}":`, err.message);
  }
}

async function listLogs(rawQuery) {
  const filters = validate(listAuditLogsSchema, rawQuery);
  const rows = await repo.listEvents(filters);

  const hasMore = rows.length > filters.limit;
  const items = hasMore ? rows.slice(0, filters.limit) : rows;

  return {
    items,
    page: {
      limit: filters.limit,
      // Send this as ?beforeId=... to get the next (older) page. null means there are no more
      nextBeforeId: hasMore ? items[items.length - 1].id : null,
    },
  };
}

module.exports = { record, recordSafely, listLogs };