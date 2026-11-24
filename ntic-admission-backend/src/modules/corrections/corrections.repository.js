// src/modules/corrections/corrections.repository.js
const { query } = require('../../db/pool');
const { FIELDS } = require('./corrections.validation');

const APP_SQL = `SELECT a.id, a.status, a.campus_id AS "campusId", ap.id AS "applicantId", ap.parent_user_id AS "parentUserId",
       ap.first_name AS "firstName", ap.middle_name AS "middleName", ap.surname, to_char(ap.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
       ap.gender, ap.contact_phone AS "contactPhone", ap.address_line AS "addressLine"
  FROM applications a JOIN applicants ap ON ap.id = a.applicant_id`;

async function findApplication(id, db = { query }) {
  const { rows } = await db.query(`${APP_SQL} WHERE a.id = $1`, [id]);
  return rows[0] || null;
}
async function lockApplicant(applicantId, client) {
  await client.query('SELECT 1 FROM applicants WHERE id = $1 FOR UPDATE', [applicantId]);
}
async function counts(applicationId, client) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'pending')::int AS pending FROM application_corrections WHERE application_id = $1`, [applicationId]);
  return rows[0];
}

const COLS = `c.id, c.application_id AS "applicationId", c.field, c.old_value AS "oldValue", c.new_value AS "newValue", c.reason, c.status,
              c.decision_note AS "decisionNote", c.decided_at AS "decidedAt", c.created_at AS "createdAt"`;

async function insert(d, client) {
  const { rows } = await client.query(
    `INSERT INTO application_corrections (application_id, field, old_value, new_value, reason, requested_by) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, application_id AS "applicationId", field, old_value AS "oldValue", new_value AS "newValue", reason, status, created_at AS "createdAt"`,
    [d.applicationId, d.field, d.oldValue, d.newValue, d.reason, d.requestedBy]);
  return rows[0];
}
async function listForApplication(applicationId) {
  const { rows } = await query(`SELECT ${COLS} FROM application_corrections c WHERE c.application_id = $1 ORDER BY c.created_at DESC`, [applicationId]);
  return rows;
}
// Locks the request and returns the application it belongs to
async function lockWithApplication(id, client) {
  const { rows } = await client.query(
    `SELECT c.id, c.application_id AS "applicationId", c.field, c.new_value AS "newValue", c.status, a.status AS "applicationStatus",
            a.campus_id AS "campusId", ap.id AS "applicantId", ap.parent_user_id AS "parentUserId"
       FROM application_corrections c JOIN applications a ON a.id = c.application_id JOIN applicants ap ON ap.id = a.applicant_id
      WHERE c.id = $1 FOR UPDATE OF c`, [id]);
  return rows[0] || null;
}
async function setDecision(id, status, userId, note, client) {
  await client.query(`UPDATE application_corrections SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, [id, status, userId, note || null]);
}
async function cancel(id, client) {
  await client.query(`UPDATE application_corrections SET status = 'cancelled' WHERE id = $1`, [id]);
}
async function applyToApplicant(applicantId, field, value, client) {
  // the column name comes from our own FIELDS list, never from the request
  await client.query(`UPDATE applicants SET ${FIELDS[field].column} = $2 WHERE id = $1`, [applicantId, value]);
}
async function listForStaff({ status, limit }, scope) {
  const { rows } = await query(
    `SELECT ${COLS}, a.application_number AS "applicationNumber", c.application_id AS "applicationId", ap.first_name || ' ' || ap.surname AS "applicantName",
            ca.name AS "campusName", a.status AS "applicationStatus"
       FROM application_corrections c JOIN applications a ON a.id = c.application_id JOIN applicants ap ON ap.id = a.applicant_id JOIN campuses ca ON ca.id = a.campus_id
      WHERE c.status = $1 AND ($2::uuid[] IS NULL OR a.campus_id = ANY($2::uuid[]))
      ORDER BY c.created_at LIMIT $3`, [status, scope, limit]);
  return rows;
}

module.exports = { findApplication, lockApplicant, counts, insert, listForApplication, lockWithApplication, setDecision, cancel, applyToApplicant, listForStaff };
