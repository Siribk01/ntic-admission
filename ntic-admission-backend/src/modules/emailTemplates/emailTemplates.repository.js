// src/modules/emailTemplates/emailTemplates.repository.js
const { query } = require('../../db/pool');

const COLS = `id, template_key AS "key", subject, body, enabled, version, updated_at AS "updatedAt"`;

async function list(db = { query }) {
  const { rows } = await db.query(`SELECT ${COLS} FROM email_template_overrides`);
  return rows;
}
async function find(key, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLS} FROM email_template_overrides WHERE template_key = $1`, [key]);
  return rows[0] || null;
}
// Used when an email is queued: only an ENABLED override matters
async function findActive(key, db = { query }) {
  const { rows } = await db.query(`SELECT subject, body FROM email_template_overrides WHERE template_key = $1 AND enabled`, [key]);
  return rows[0] || null;
}
async function lock(key, client) {
  const { rows } = await client.query(`SELECT ${COLS} FROM email_template_overrides WHERE template_key = $1 FOR UPDATE`, [key]);
  return rows[0] || null;
}
// null when somebody else created it first
async function insert(key, d, userId, client) {
  const { rows } = await client.query(
    `INSERT INTO email_template_overrides (template_key, subject, body, enabled, updated_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (template_key) DO NOTHING RETURNING ${COLS}`,
    [key, d.subject, d.body, d.enabled, userId]
  );
  return rows[0] || null;
}
async function update(id, d, userId, client) {
  const { rows } = await client.query(
    `UPDATE email_template_overrides SET subject = $2, body = $3, enabled = $4, version = version + 1, updated_by = $5, updated_at = now()
      WHERE id = $1 RETURNING ${COLS}`,
    [id, d.subject, d.body, d.enabled, userId]
  );
  return rows[0];
}
async function insertVersion(o, userId, client) {
  await client.query(
    `INSERT INTO email_template_override_versions (override_id, version, subject, body, enabled, saved_by) VALUES ($1, $2, $3, $4, $5, $6)`,
    [o.id, o.version, o.subject, o.body, o.enabled, userId]
  );
}
async function versions(id) {
  const { rows } = await query(
    `SELECT v.version, v.subject, v.body, v.enabled, v.saved_at AS "savedAt", u.email AS "savedBy"
       FROM email_template_override_versions v LEFT JOIN users u ON u.id = v.saved_by WHERE v.override_id = $1 ORDER BY v.version DESC LIMIT 50`,
    [id]
  );
  return rows;
}

module.exports = { list, find, findActive, lock, insert, update, insertVersion, versions };
