// src/modules/results/results.repository.js
// SQL only for exam attendance and exam results.

const { query } = require('../../db/pool');

// ---------- locking (always in this order: applications, then exams, then results, each by id) ----------
async function lockApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT id, campus_id AS "campusId", application_number AS "applicationNumber"
       FROM applications WHERE id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows[0] || null;
}

async function lockApplications(ids, client) {
  if (!ids.length) return [];
  const { rows } = await client.query(
    `SELECT id, campus_id AS "campusId" FROM applications WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids]
  );
  return rows;
}

async function lockExamByApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT e.id, e.exam_number AS "examNumber", e.status, e.slot_id AS "slotId",
            s.starts_at AS "startsAt"
       FROM examinations e LEFT JOIN exam_slots s ON s.id = e.slot_id
      WHERE e.application_id = $1 FOR UPDATE OF e`,
    [applicationId]
  );
  return rows[0] || null;
}

async function lockExamsByIds(ids, client) {
  if (!ids.length) return [];
  const { rows } = await client.query(
    `SELECT e.id, e.application_id AS "applicationId", e.exam_number AS "examNumber", e.status, e.slot_id AS "slotId"
       FROM examinations e WHERE e.id = ANY($1::uuid[]) ORDER BY e.id FOR UPDATE OF e`,
    [ids]
  );
  return rows;
}

// ---------- slots and rosters ----------
async function findSlot(slotId, db = { query }) {
  const { rows } = await db.query(
    `SELECT s.id, s.campus_id AS "campusId", c.name AS "campusName", s.starts_at AS "startsAt",
            s.duration_minutes AS "durationMinutes", s.venue
       FROM exam_slots s JOIN campuses c ON c.id = s.campus_id WHERE s.id = $1`,
    [slotId]
  );
  return rows[0] || null;
}

async function listRoster(slotId) {
  const { rows } = await query(
    `SELECT e.id AS "examId", e.exam_number AS "examNumber", e.status,
            ap.id AS "applicationId", ap.application_number AS "applicationNumber",
            a.first_name AS "firstName", a.surname AS "surname",
            r.status AS "resultStatus"
       FROM examinations e
       JOIN applications ap ON ap.id = e.application_id
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN exam_results r ON r.examination_id = e.id
      WHERE e.slot_id = $1
      ORDER BY a.surname, a.first_name, e.exam_number`,
    [slotId]
  );
  return rows;
}

// Exams in a slot looked up by exam number (for bulk attendance)
async function findExamsInSlot(slotId, examNumbers, db) {
  const { rows } = await db.query(
    `SELECT e.id, e.application_id AS "applicationId", e.exam_number AS "examNumber", e.status
       FROM examinations e WHERE e.slot_id = $1 AND e.exam_number = ANY($2::text[])`,
    [slotId, examNumbers]
  );
  return rows;
}

async function setExamStatus(examId, status, client) {
  await client.query(`UPDATE examinations SET status = $2 WHERE id = $1`, [examId, status]);
}

async function addExamHistory(h, client) {
  await client.query(
    `INSERT INTO examination_history (examination_id, action, from_slot_id, to_slot_id, reason, actor_id)
     VALUES ($1,$2,$3,$3,$4,$5)`,
    [h.examId, h.action, h.slotId ?? null, h.reason ?? null, h.actorId]
  );
}

async function resultExistsForExam(examId, db) {
  const { rows } = await db.query(`SELECT 1 FROM exam_results WHERE examination_id = $1`, [examId]);
  return rows.length > 0;
}

// ---------- applications / exams for staff lookups ----------
async function findApplicationBasics(applicationId) {
  const { rows } = await query(
    `SELECT ap.id, ap.campus_id AS "campusId", ap.application_number AS "applicationNumber",
            a.first_name AS "firstName", a.surname AS "surname"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

// For CSV import: exams by exam number, with the application's campus
async function findExamsByNumbers(examNumbers, db) {
  const { rows } = await db.query(
    `SELECT e.id, e.application_id AS "applicationId", e.exam_number AS "examNumber", e.status,
            ap.campus_id AS "campusId"
       FROM examinations e JOIN applications ap ON ap.id = e.application_id
      WHERE e.exam_number = ANY($1::text[])`,
    [examNumbers]
  );
  return rows;
}

// ---------- results ----------
const SELECT_RESULT = `
  SELECT r.id, r.examination_id AS "examinationId", r.status, r.remarks,
         r.entered_by AS "enteredById", eu.email AS "enteredBy", r.entered_at AS "enteredAt",
         r.reviewed_by AS "reviewedById", ru.email AS "reviewedBy", r.reviewed_at AS "reviewedAt"
    FROM exam_results r
    JOIN users eu ON eu.id = r.entered_by
    LEFT JOIN users ru ON ru.id = r.reviewed_by
`;

async function findResultByExam(examId, db = { query }) {
  const { rows } = await db.query(`${SELECT_RESULT} WHERE r.examination_id = $1`, [examId]);
  return rows[0] || null;
}

async function lockResultByExam(examId, client) {
  const { rows } = await client.query(
    `SELECT id, status, remarks, entered_by AS "enteredById" FROM exam_results WHERE examination_id = $1 FOR UPDATE`,
    [examId]
  );
  return rows[0] || null;
}

async function listScores(resultId, db = { query }) {
  const { rows } = await db.query(
    `SELECT subject, score::float8 AS score, max_score::float8 AS "maxScore"
       FROM exam_result_scores WHERE result_id = $1 ORDER BY subject`,
    [resultId]
  );
  return rows;
}

async function insertResult({ examId, remarks, actorId }, client) {
  const { rows } = await client.query(
    `INSERT INTO exam_results (examination_id, remarks, entered_by) VALUES ($1,$2,$3) RETURNING id`,
    [examId, remarks ?? null, actorId]
  );
  return rows[0].id;
}

// A new set of marks: back to draft, attributed to whoever made the change
async function resetToDraft({ resultId, remarks, actorId }, client) {
  await client.query(
    `UPDATE exam_results
        SET status = 'draft', remarks = $2, entered_by = $3, entered_at = now(), reviewed_by = NULL, reviewed_at = NULL
      WHERE id = $1`,
    [resultId, remarks ?? null, actorId]
  );
}

async function replaceScores(resultId, scores, client) {
  await client.query(`DELETE FROM exam_result_scores WHERE result_id = $1`, [resultId]);
  for (const s of scores) {
    await client.query(
      `INSERT INTO exam_result_scores (result_id, subject, score, max_score) VALUES ($1,$2,$3,$4)`,
      [resultId, s.subject, s.score, s.maxScore]
    );
  }
}

async function markReviewed({ resultId, reviewerId }, client) {
  await client.query(
    `UPDATE exam_results SET status = 'reviewed', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
    [resultId, reviewerId]
  );
}

async function addResultHistory({ resultId, action, snapshot, reason, actorId }, client) {
  await client.query(
    `INSERT INTO exam_result_history (result_id, action, snapshot, reason, actor_id) VALUES ($1,$2,$3::jsonb,$4,$5)`,
    [resultId, action, JSON.stringify(snapshot), reason ?? null, actorId]
  );
}

async function listResultHistory(resultId) {
  const { rows } = await query(
    `SELECT h.action, h.reason, h.snapshot, h.created_at AS "at", u.email AS "by"
       FROM exam_result_history h JOIN users u ON u.id = h.actor_id
      WHERE h.result_id = $1 ORDER BY h.id`,
    [resultId]
  );
  return rows;
}

module.exports = {
  lockApplication, lockApplications, lockExamByApplication, lockExamsByIds,
  findSlot, listRoster, findExamsInSlot, setExamStatus, addExamHistory, resultExistsForExam,
  findApplicationBasics, findExamsByNumbers,
  findResultByExam, lockResultByExam, listScores, insertResult, resetToDraft, replaceScores, markReviewed,
  addResultHistory, listResultHistory,
};
