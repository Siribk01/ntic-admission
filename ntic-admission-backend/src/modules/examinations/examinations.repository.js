// src/modules/examinations/examinations.repository.js
// SQL only for exam slots, examinations and their history.

const { query } = require('../../db/pool');

const SELECT_SLOT = `
  SELECT s.id,
         s.cycle_id  AS "cycleId",
         s.campus_id AS "campusId",
         c.name      AS "campusName",
         s.starts_at AS "startsAt",
         s.duration_minutes AS "durationMinutes",
         s.mode, s.venue, s.capacity, s.status,
         (SELECT count(*)::int FROM examinations e WHERE e.slot_id = s.id AND e.status = 'scheduled') AS "bookedCount",
         s.created_at AS "createdAt"
    FROM exam_slots s
    JOIN campuses c ON c.id = s.campus_id
`;

// ---------- slots ----------
async function insertSlot(slot, client) {
  const { rows } = await client.query(
    `INSERT INTO exam_slots (cycle_id, campus_id, starts_at, duration_minutes, mode, venue, capacity, created_by)
     VALUES ($1,$2,$3,COALESCE($4,120),COALESCE($5,'in_person'),$6,$7,$8) RETURNING id`,
    [slot.cycleId, slot.campusId, slot.startsAt, slot.durationMinutes ?? null, slot.mode ?? null, slot.venue, slot.capacity, slot.createdBy]
  );
  return rows[0].id;
}

async function findSlotById(id, db = { query }) {
  const { rows } = await db.query(`${SELECT_SLOT} WHERE s.id = $1`, [id]);
  return rows[0] || null;
}

async function listSlots({ cycleId, campusId, status, upcoming, campusScope }) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (cycleId) add('s.cycle_id = ?', cycleId);
  if (campusId) add('s.campus_id = ?', campusId);
  if (status) add('s.status = ?', status);
  if (upcoming === 'true') where.push('s.starts_at > now()');
  if (campusScope) add('s.campus_id = ANY(?::uuid[])', campusScope);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_SLOT} ${clause} ORDER BY s.starts_at, c.name`, params);
  return rows;
}

// Open, upcoming slots with seats left, for a parent choosing a date (only at the campuses they may sit at)
async function listBookableSlots({ cycleId, campusIds }) {
  const { rows } = await query(
    `SELECT * FROM (${SELECT_SLOT} WHERE s.cycle_id = $1 AND s.campus_id = ANY($2::uuid[])
                      AND s.status = 'open' AND s.starts_at > now()) x
      WHERE x.capacity > x."bookedCount"
      ORDER BY x."startsAt"`,
    [cycleId, campusIds]
  );
  return rows.map(({ bookedCount, capacity, ...slot }) => ({ ...slot, seatsLeft: capacity - bookedCount }));
}

// Locks the given slot rows (in id order, always, so two requests can never wait on each other in a circle)
async function lockSlots(ids, client) {
  const { rows } = await client.query(
    `SELECT id, cycle_id AS "cycleId", campus_id AS "campusId", starts_at AS "startsAt",
            capacity, status
       FROM exam_slots WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids]
  );
  return rows;
}

async function countScheduled(slotId, client) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS total FROM examinations WHERE slot_id = $1 AND status = 'scheduled'`,
    [slotId]
  );
  return rows[0].total;
}

async function updateSlot(id, data, client) {
  const sets = [];
  const params = [id];
  for (const [field, column] of [['capacity', 'capacity'], ['venue', 'venue'], ['status', 'status']]) {
    if (data[field] !== undefined) { params.push(data[field]); sets.push(`${column} = $${params.length}`); }
  }
  await client.query(`UPDATE exam_slots SET ${sets.join(', ')} WHERE id = $1`, params);
}

// ---------- applications (read/lock what scheduling needs) ----------
async function lockApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", ap.cycle_id AS "cycleId",
            ap.preferred_exam_campus_id AS "preferredExamCampusId",
            a.parent_user_id AS "parentUserId",
            ap.fee_amount_minor::float8 AS "feeAmountMinor", ap.application_number AS "applicationNumber"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id
      WHERE ap.id = $1 FOR UPDATE OF ap`,
    [applicationId]
  );
  return rows[0] || null;
}

async function getFeeAndPaid(applicationId) {
  const { rows } = await query(
    `SELECT ap.fee_amount_minor::float8 AS fee,
            COALESCE((SELECT SUM(p.amount_minor) FROM payments p WHERE p.application_id = ap.id AND p.status = 'successful'), 0)::float8 AS paid
       FROM applications ap WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0];
}

async function findApplicationBasics(applicationId) {
  const { rows } = await query(
    `SELECT ap.id, ap.status, ap.cycle_id AS "cycleId", ap.campus_id AS "campusId", a.parent_user_id AS "parentUserId",
            to_char(ap.preferred_exam_date, 'YYYY-MM-DD') AS "preferredExamDate",
            ap.preferred_exam_time AS "preferredExamTime",
            ap.preferred_exam_campus_id AS "preferredExamCampusId"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

// ---------- examinations ----------
const SELECT_EXAM = `
  SELECT e.id,
         e.application_id AS "applicationId",
         ap.application_number AS "applicationNumber",
         e.exam_number AS "examNumber",
         e.status,
         CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
           'id', s.id, 'startsAt', s.starts_at, 'durationMinutes', s.duration_minutes,
           'mode', s.mode, 'venue', s.venue, 'campusId', s.campus_id, 'campusName', c.name) END AS slot,
         e.updated_at AS "updatedAt"
    FROM examinations e
    JOIN applications ap ON ap.id = e.application_id
    LEFT JOIN exam_slots s ON s.id = e.slot_id
    LEFT JOIN campuses c ON c.id = s.campus_id
`;

async function findExamByApplication(applicationId, db = { query }) {
  const { rows } = await db.query(`${SELECT_EXAM} WHERE e.application_id = $1`, [applicationId]);
  return rows[0] || null;
}

async function lockExamByApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT id, exam_number AS "examNumber", slot_id AS "slotId", status
       FROM examinations WHERE application_id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows[0] || null;
}

// Issues the next number for this campus and cycle, e.g. NTICKAN-2027-0001 (NTIC + campus code + year + counter).
// The counter row is locked by the INSERT ... ON CONFLICT, so two callers get different numbers.
async function issueExamNumber(campusId, cycleId, client) {
  const { rows: info } = await client.query(
    `SELECT c.code AS "campusCode", substring(cy.academic_session from 1 for 4) AS year
       FROM campuses c, admission_cycles cy WHERE c.id = $1 AND cy.id = $2`,
    [campusId, cycleId]
  );
  const { rows } = await client.query(
    `INSERT INTO number_counters (scope_key, last_value) VALUES ($1, 1)
     ON CONFLICT (scope_key) DO UPDATE SET last_value = number_counters.last_value + 1
     RETURNING last_value`,
    [`exam:${campusId}:${cycleId}`]
  );
  return `NTIC${info[0].campusCode}-${info[0].year}-${String(rows[0].last_value).padStart(4, '0')}`;
}

async function insertExam({ applicationId, examNumber, slotId }, client) {
  const { rows } = await client.query(
    `INSERT INTO examinations (application_id, exam_number, slot_id) VALUES ($1,$2,$3) RETURNING id`,
    [applicationId, examNumber, slotId]
  );
  return rows[0].id;
}

async function setExamSlot(examId, slotId, status, client) {
  await client.query(`UPDATE examinations SET slot_id = $2, status = $3 WHERE id = $1`, [examId, slotId, status]);
}

async function addHistory(h, client) {
  await client.query(
    `INSERT INTO examination_history (examination_id, action, from_slot_id, to_slot_id, reason, actor_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [h.examId, h.action, h.fromSlotId ?? null, h.toSlotId ?? null, h.reason ?? null, h.actorId]
  );
}

async function listHistory(examId) {
  const { rows } = await query(
    `SELECT h.action, h.reason, h.created_at AS "at",
            h.from_slot_id AS "fromSlotId", h.to_slot_id AS "toSlotId",
            u.email AS "by"
       FROM examination_history h JOIN users u ON u.id = h.actor_id
      WHERE h.examination_id = $1 ORDER BY h.id`,
    [examId]
  );
  return rows;
}

module.exports = {
  insertSlot, findSlotById, listSlots, listBookableSlots, lockSlots, countScheduled, updateSlot,
  lockApplication, findApplicationBasics, getFeeAndPaid,
  findExamByApplication, lockExamByApplication, issueExamNumber, insertExam, setExamSlot, addHistory, listHistory,
};
