// src/modules/interviews/interviews.repository.js
// SQL only for interviews, their history, and scorecards.

const { query } = require('../../db/pool');

// ---------- applications ----------
async function lockApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", ap.application_number AS "applicationNumber",
            ap.fee_amount_minor::float8 AS "feeAmountMinor"
       FROM applications ap WHERE ap.id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows[0] || null;
}

async function findApplicationBasics(applicationId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", c.name AS "campusName",
            ap.application_number AS "applicationNumber", ap.program,
            cat.name AS "categoryName", ap.interview_availability AS "availabilityNote",
            a.first_name AS "firstName", a.surname, a.parent_user_id AS "parentUserId"
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       JOIN campuses c ON c.id = ap.campus_id
       LEFT JOIN admission_categories cat ON cat.id = ap.category_id
      WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

// ---------- people ----------
// An interviewer must be active, have the interviewer role, and be assigned to the application's campus
async function findInterviewerForCampus(userId, campusId, db) {
  const { rows } = await db.query(
    `SELECT u.id FROM users u
      WHERE u.id = $1 AND u.role = 'interviewer' AND u.is_active
        AND EXISTS (SELECT 1 FROM user_campus_scopes s WHERE s.user_id = u.id AND s.campus_id = $2)`,
    [userId, campusId]
  );
  return rows[0] || null;
}

async function listInterviewers(campusScope) {
  const params = [];
  let scopeSql = '';
  if (campusScope) { params.push(campusScope); scopeSql = 'AND s.campus_id = ANY($1::uuid[])'; }
  const { rows } = await query(
    `SELECT u.id, trim(u.first_name || ' ' || u.last_name) AS name, u.email,
            array_agg(DISTINCT c.name ORDER BY c.name) AS campuses
       FROM users u
       JOIN user_campus_scopes s ON s.user_id = u.id
       JOIN campuses c ON c.id = s.campus_id
      WHERE u.role = 'interviewer' AND u.is_active ${scopeSql}
      GROUP BY u.id ORDER BY name`,
    params
  );
  return rows;
}

// ---------- interviews ----------
const SELECT_INTERVIEW = `
  SELECT i.id, i.application_id AS "applicationId", ap.application_number AS "applicationNumber",
         ap.campus_id AS "campusId", c.name AS "campusName", ap.status AS "applicationStatus",
         a.first_name || ' ' || a.surname AS "candidate", cat.name AS "categoryName", ap.program,
         i.status, i.interviewer_id AS "interviewerId",
         trim(iu.first_name || ' ' || iu.last_name) AS "interviewerName", iu.email AS "interviewerEmail",
         i.starts_at AS "startsAt", i.ends_at AS "endsAt", i.duration_minutes AS "durationMinutes", i.timezone,
         i.platform, i.meeting_url AS "meetingUrl", i.location, i.instructions,
         sc.status AS "scorecardStatus"
    FROM interviews i
    JOIN applications ap ON ap.id = i.application_id
    JOIN applicants a ON a.id = ap.applicant_id
    JOIN campuses c ON c.id = ap.campus_id
    JOIN users iu ON iu.id = i.interviewer_id
    LEFT JOIN admission_categories cat ON cat.id = ap.category_id
    LEFT JOIN interview_scorecards sc ON sc.interview_id = i.id
`;

async function findInterviewByApplication(applicationId, db = { query }) {
  const { rows } = await db.query(`${SELECT_INTERVIEW} WHERE i.application_id = $1`, [applicationId]);
  return rows[0] || null;
}

async function lockInterviewByApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT id, status, interviewer_id AS "interviewerId", starts_at AS "startsAt", duration_minutes AS "durationMinutes",
            timezone, platform, meeting_url AS "meetingUrl", location, instructions
       FROM interviews WHERE application_id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows[0] || null;
}

async function listInterviews({ status, interviewerId, campusId, from, to, campusScope, limit, offset }) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (status) add('i.status = ?', status);
  if (interviewerId) add('i.interviewer_id = ?', interviewerId);
  if (campusId) add('ap.campus_id = ?', campusId);
  if (from) add(`i.starts_at >= (?::date)::timestamp AT TIME ZONE 'Africa/Lagos'`, from);
  if (to) add(`i.starts_at < ((?::date) + 1)::timestamp AT TIME ZONE 'Africa/Lagos'`, to);
  if (campusScope) add('ap.campus_id = ANY(?::uuid[])', campusScope);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: total } = await query(`SELECT count(*)::int AS n FROM interviews i JOIN applications ap ON ap.id = i.application_id ${clause}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT_INTERVIEW} ${clause} ORDER BY i.starts_at, i.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { total: total[0].n, rows };
}

async function insertInterview(i, client) {
  const { rows } = await client.query(
    `INSERT INTO interviews (application_id, interviewer_id, starts_at, duration_minutes, ends_at, timezone, platform, meeting_url, location, instructions, created_by)
     VALUES ($1,$2,$3::timestamptz,$4::int,$3::timestamptz + $4::int * interval '1 minute',$5,$6,$7,$8,$9,$10) RETURNING id`,
    [i.applicationId, i.interviewerId, i.startsAt, i.durationMinutes, i.timezone, i.platform, i.meetingUrl ?? null, i.location ?? null, i.instructions ?? null, i.createdBy]
  );
  return rows[0].id;
}

async function updateInterview(id, i, client) {
  await client.query(
    `UPDATE interviews
        SET interviewer_id = $2, status = 'scheduled', starts_at = $3::timestamptz, duration_minutes = $4::int,
            ends_at = $3::timestamptz + $4::int * interval '1 minute', timezone = $5, platform = $6, meeting_url = $7, location = $8, instructions = $9
      WHERE id = $1`,
    [id, i.interviewerId, i.startsAt, i.durationMinutes, i.timezone, i.platform, i.meetingUrl ?? null, i.location ?? null, i.instructions ?? null]
  );
}

async function setInterviewStatus(id, status, client) {
  await client.query(`UPDATE interviews SET status = $2 WHERE id = $1`, [id, status]);
}

async function addHistory(h, client) {
  await client.query(
    `INSERT INTO interview_history (interview_id, action, from_starts_at, to_starts_at, from_interviewer_id, to_interviewer_id, reason, actor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [h.interviewId, h.action, h.fromStartsAt ?? null, h.toStartsAt ?? null, h.fromInterviewerId ?? null, h.toInterviewerId ?? null, h.reason ?? null, h.actorId]
  );
}

async function listHistory(interviewId) {
  const { rows } = await query(
    `SELECT h.action, h.reason, h.created_at AS "at", h.from_starts_at AS "fromStartsAt", h.to_starts_at AS "toStartsAt",
            u.email AS "by"
       FROM interview_history h JOIN users u ON u.id = h.actor_id
      WHERE h.interview_id = $1 ORDER BY h.id`,
    [interviewId]
  );
  return rows;
}

// ---------- criteria ----------
async function listCriteria({ includeInactive }, db = { query }) {
  const { rows } = await db.query(
    `SELECT id, key, label, description, max_score AS "maxScore", position, is_active AS "active"
       FROM scorecard_criteria ${includeInactive ? '' : 'WHERE is_active'} ORDER BY position, key`
  );
  return rows;
}

async function findCriterion(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT id, key, label, description, max_score AS "maxScore", position, is_active AS "active" FROM scorecard_criteria WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function insertCriterion(c, client) {
  const { rows } = await client.query(
    `INSERT INTO scorecard_criteria (key, label, description, max_score, position)
     VALUES ($1,$2,$3,COALESCE($4,5),COALESCE($5,(SELECT COALESCE(max(position),0)+1 FROM scorecard_criteria))) RETURNING id`,
    [c.key, c.label, c.description ?? null, c.maxScore ?? null, c.position ?? null]
  );
  return rows[0].id;
}

async function updateCriterion(id, data, client) {
  const sets = [];
  const params = [id];
  for (const [field, column] of [['label', 'label'], ['description', 'description'], ['maxScore', 'max_score'], ['position', 'position'], ['active', 'is_active']]) {
    if (data[field] !== undefined) { params.push(data[field]); sets.push(`${column} = $${params.length}`); }
  }
  await client.query(`UPDATE scorecard_criteria SET ${sets.join(', ')} WHERE id = $1`, params);
}

async function lockCriteriaTable(client) {
  await client.query(`LOCK TABLE scorecard_criteria IN SHARE ROW EXCLUSIVE MODE`);
}

async function countActiveCriteria(client) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM scorecard_criteria WHERE is_active`);
  return rows[0].n;
}

// ---------- scorecards ----------
async function findScorecard(interviewId, db = { query }) {
  const { rows } = await db.query(
    `SELECT s.id, s.status, s.recommendation, s.notes, s.submitted_at AS "submittedAt", s.updated_at AS "updatedAt",
            trim(u.first_name || ' ' || u.last_name) AS "writtenBy"
       FROM interview_scorecards s JOIN users u ON u.id = s.written_by WHERE s.interview_id = $1`,
    [interviewId]
  );
  return rows[0] || null;
}

async function lockScorecard(interviewId, client) {
  const { rows } = await client.query(
    `SELECT id, status, recommendation, notes FROM interview_scorecards WHERE interview_id = $1 FOR UPDATE`,
    [interviewId]
  );
  return rows[0] || null;
}

async function listScores(scorecardId, db = { query }) {
  const { rows } = await db.query(
    `SELECT criterion_key AS criterion, label, score, max_score AS "maxScore", comment
       FROM interview_scorecard_scores WHERE scorecard_id = $1 ORDER BY label`,
    [scorecardId]
  );
  return rows;
}

async function insertScorecard({ interviewId, recommendation, notes, writerId }, client) {
  const { rows } = await client.query(
    `INSERT INTO interview_scorecards (interview_id, recommendation, notes, written_by) VALUES ($1,$2,$3,$4) RETURNING id`,
    [interviewId, recommendation ?? null, notes ?? null, writerId]
  );
  return rows[0].id;
}

async function updateScorecardDraft({ id, recommendation, notes, writerId }, client) {
  await client.query(`UPDATE interview_scorecards SET recommendation = $2, notes = $3, written_by = $4 WHERE id = $1`, [id, recommendation ?? null, notes ?? null, writerId]);
}

async function replaceScores(scorecardId, lines, client) {
  await client.query(`DELETE FROM interview_scorecard_scores WHERE scorecard_id = $1`, [scorecardId]);
  for (const l of lines) {
    await client.query(
      `INSERT INTO interview_scorecard_scores (scorecard_id, criterion_key, label, max_score, score, comment) VALUES ($1,$2,$3,$4,$5,$6)`,
      [scorecardId, l.criterion, l.label, l.maxScore, l.score, l.comment ?? null]
    );
  }
}

async function markSubmitted(id, client) {
  await client.query(`UPDATE interview_scorecards SET status = 'submitted', submitted_at = now() WHERE id = $1`, [id]);
}

async function reopenScorecard(id, client) {
  await client.query(`UPDATE interview_scorecards SET status = 'draft', submitted_at = NULL WHERE id = $1`, [id]);
}

async function addScorecardHistory({ scorecardId, action, snapshot, reason, actorId }, client) {
  await client.query(
    `INSERT INTO interview_scorecard_history (scorecard_id, action, snapshot, reason, actor_id) VALUES ($1,$2,$3::jsonb,$4,$5)`,
    [scorecardId, action, JSON.stringify(snapshot), reason ?? null, actorId]
  );
}

async function listScorecardHistory(scorecardId) {
  const { rows } = await query(
    `SELECT h.action, h.reason, h.snapshot, h.created_at AS "at", u.email AS "by"
       FROM interview_scorecard_history h JOIN users u ON u.id = h.actor_id WHERE h.scorecard_id = $1 ORDER BY h.id`,
    [scorecardId]
  );
  return rows;
}

module.exports = {
  lockApplication, findApplicationBasics, findInterviewerForCampus, listInterviewers,
  findInterviewByApplication, lockInterviewByApplication, listInterviews, insertInterview, updateInterview,
  setInterviewStatus, addHistory, listHistory,
  listCriteria, findCriterion, insertCriterion, updateCriterion, lockCriteriaTable, countActiveCriteria,
  findScorecard, lockScorecard, listScores, insertScorecard, updateScorecardDraft, replaceScores, markSubmitted,
  reopenScorecard, addScorecardHistory, listScorecardHistory,
};
