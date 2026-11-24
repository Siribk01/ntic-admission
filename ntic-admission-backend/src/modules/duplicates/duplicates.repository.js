// src/modules/duplicates/duplicates.repository.js
const { query } = require('../../db/pool');

async function findCycle(cycleId) {
  const { rows } = cycleId
    ? await query(`SELECT id, academic_session AS "academicSession" FROM admission_cycles WHERE id = $1`, [cycleId])
    : await query(`SELECT id, academic_session AS "academicSession" FROM admission_cycles ORDER BY (status = 'active') DESC, opens_at DESC NULLS LAST LIMIT 1`);
  return rows[0] || null;
}

// Every submitted application of the cycle that is still a candidate for being a duplicate (withdrawn ones are not)
async function listCandidates(cycleId) {
  const { rows } = await query(
    `SELECT ap.id, ap.application_number AS "applicationNumber", ap.status, ap.campus_id AS "campusId", campus.name AS "campusName", ap.submitted_at AS "submittedAt",
            a.first_name AS "firstName", a.middle_name AS "middleName", a.surname, to_char(a.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
            a.contact_phone AS phone, pu.email AS "parentEmail"
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN users pu ON pu.id = a.parent_user_id
       LEFT JOIN campuses campus ON campus.id = ap.campus_id
      WHERE ap.cycle_id = $1 AND ap.status NOT IN ('draft', 'withdrawn')
      ORDER BY ap.submitted_at, ap.application_number`,
    [cycleId]
  );
  return rows;
}

async function listReviews(cycleId) {
  const { rows } = await query(
    `SELECT r.match_key AS key, r.rule, r.note, r.reviewed_at AS "reviewedAt", u.first_name AS "firstName", u.last_name AS "lastName", u.email
       FROM duplicate_reviews r LEFT JOIN users u ON u.id = r.reviewed_by WHERE r.cycle_id = $1`,
    [cycleId]
  );
  return rows;
}

async function insertReview({ key, cycleId, rule, note, userId }, client) {
  const { rows } = await client.query(
    `INSERT INTO duplicate_reviews (match_key, cycle_id, rule, note, reviewed_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (match_key) DO NOTHING RETURNING id`,
    [key, cycleId, rule, note, userId]
  );
  return rows[0] ? rows[0].id : null;
}

async function deleteReview(key, client) {
  const { rows } = await client.query('DELETE FROM duplicate_reviews WHERE match_key = $1 RETURNING id', [key]);
  return rows[0] ? rows[0].id : null;
}

async function findReviewId(key, client) {
  const { rows } = await client.query('SELECT id FROM duplicate_reviews WHERE match_key = $1', [key]);
  return rows[0] ? rows[0].id : null;
}

module.exports = { findCycle, listCandidates, listReviews, insertReview, deleteReview, findReviewId };
