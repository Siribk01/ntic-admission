// src/modules/audit/audit.repository.js
// SQL only for audit_logs. There is deliberately no update or delete function.

const { query } = require('../../db/pool');

// `client` is optional: pass a transaction client to save the log entry together with the action it describes
async function insertEvent(event, client) {
  const db = client || { query };
  await db.query(
    `INSERT INTO audit_logs
       (actor_user_id, actor_email, actor_role, action, outcome,
        resource_type, resource_id, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.actorUserId,
      event.actorEmail,
      event.actorRole,
      event.action,
      event.outcome,
      event.resourceType,
      event.resourceId,
      event.ip,
      event.userAgent,
      JSON.stringify(event.metadata),
    ]
  );
}

// Newest first. Fetches one extra row so the service can tell whether another page exists.
// NOTE: ORDER BY uses audit_logs.id (the real number column). The SELECT list also has a text column
// called "id", and a plain "ORDER BY id" would sort that text version ("9" after "12").
async function listEvents({ action, actorUserId, beforeId, limit }) {
  const conditions = [];
  const params = [];

  // Values always go in params ($1, $2 ...); only fixed text is placed in the SQL string
  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (actorUserId) {
    params.push(actorUserId);
    conditions.push(`actor_user_id = $${params.length}`);
  }
  if (beforeId) {
    params.push(beforeId);
    conditions.push(`id < $${params.length}`);
  }

  params.push(limit + 1);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT id::text AS id,
            occurred_at   AS "occurredAt",
            actor_user_id AS "actorUserId",
            actor_email   AS "actorEmail",
            actor_role    AS "actorRole",
            action,
            outcome,
            resource_type AS "resourceType",
            resource_id   AS "resourceId",
            ip_address    AS "ipAddress",
            user_agent    AS "userAgent",
            metadata
       FROM audit_logs
       ${where}
      ORDER BY audit_logs.id DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

module.exports = { insertEvent, listEvents };