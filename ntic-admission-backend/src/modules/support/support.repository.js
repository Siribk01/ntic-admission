// src/modules/support/support.repository.js
const { query } = require('../../db/pool');

const REQ = `r.id, r.category, r.subject, r.status, r.application_id AS "applicationId", r.created_at AS "createdAt", r.updated_at AS "updatedAt", r.closed_at AS "closedAt"`;

async function lockParent(userId, client) {
  await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
}
async function countActive(userId, client) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM support_requests WHERE parent_user_id = $1 AND status <> 'closed'`, [userId]);
  return rows[0].n;
}
async function findOwnApplication(applicationId, userId, client) {
  const { rows } = await client.query(
    `SELECT a.id FROM applications a JOIN applicants ap ON ap.id = a.applicant_id WHERE a.id = $1 AND ap.parent_user_id = $2`, [applicationId, userId]);
  return rows[0] || null;
}
async function insertRequest(d, client) {
  const { rows } = await client.query(
    `INSERT INTO support_requests (parent_user_id, application_id, category, subject) VALUES ($1,$2,$3,$4)
     RETURNING id, category, subject, status, application_id AS "applicationId", created_at AS "createdAt"`,
    [d.parentUserId, d.applicationId || null, d.category, d.subject]);
  return rows[0];
}
async function insertMessage(requestId, authorId, fromStaff, body, client) {
  const { rows } = await client.query(
    `INSERT INTO support_messages (request_id, author_id, from_staff, body) VALUES ($1,$2,$3,$4) RETURNING id, from_staff AS "fromStaff", body, created_at AS "createdAt"`,
    [requestId, authorId, fromStaff, body]);
  return rows[0];
}
async function messageCount(requestId, client) {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM support_messages WHERE request_id = $1', [requestId]);
  return rows[0].n;
}
async function setStatus(id, status, client) {
  await client.query(`UPDATE support_requests SET status = $2, updated_at = now(), closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END WHERE id = $1`, [id, status]);
}
async function lockRequest(id, client) {
  const { rows } = await client.query(
    `SELECT r.id, r.status, r.subject, r.category, r.parent_user_id AS "parentUserId", r.application_id AS "applicationId", a.campus_id AS "campusId"
       FROM support_requests r LEFT JOIN applications a ON a.id = r.application_id WHERE r.id = $1 FOR UPDATE OF r`, [id]);
  return rows[0] || null;
}
async function findRequest(id) {
  const { rows } = await query(
    `SELECT ${REQ}, r.parent_user_id AS "parentUserId", a.campus_id AS "campusId", a.application_number AS "applicationNumber"
       FROM support_requests r LEFT JOIN applications a ON a.id = r.application_id WHERE r.id = $1`, [id]);
  return rows[0] || null;
}
async function messages(requestId, forStaff) {
  const { rows } = await query(
    `SELECT m.id, m.from_staff AS "fromStaff", m.body, m.created_at AS "createdAt"${forStaff ? `, CASE WHEN m.from_staff THEN COALESCE(NULLIF(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) END AS "staffName"` : ''}
       FROM support_messages m JOIN users u ON u.id = m.author_id WHERE m.request_id = $1 ORDER BY m.created_at, m.id`, [requestId]);
  return rows;
}
async function listForParent(userId) {
  const { rows } = await query(`SELECT ${REQ} FROM support_requests r WHERE r.parent_user_id = $1 ORDER BY r.updated_at DESC LIMIT 100`, [userId]);
  return rows;
}
// scope: null = everything; otherwise only requests tied to an application at one of these campuses
async function listForStaff({ status, limit }, scope, onlyCategory) {
  const { rows } = await query(
    `SELECT ${REQ}, a.application_number AS "applicationNumber", ca.name AS "campusName"
       FROM support_requests r LEFT JOIN applications a ON a.id = r.application_id LEFT JOIN campuses ca ON ca.id = a.campus_id
      WHERE r.status = $1 AND ($2::uuid[] IS NULL OR a.campus_id = ANY($2::uuid[])) AND ($3::text IS NULL OR r.category = $3)
      ORDER BY r.updated_at LIMIT $4`, [status, scope, onlyCategory, limit]);
  return rows;
}

module.exports = { lockParent, countActive, findOwnApplication, insertRequest, insertMessage, messageCount, setStatus, lockRequest, findRequest, messages, listForParent, listForStaff };
