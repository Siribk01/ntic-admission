// src/modules/jobs/jobs.repository.js
// SQL for the background jobs: "what is due?" questions, plus the small tables that make the jobs safe to repeat.
//
// Every "find" function takes a db (the pool for a first look, or a transaction client for the re-check done under
// the application's lock) and an optional applicationId to look at just one application.

const { query } = require('../../db/pool');

// Dates are Lagos dates, like the offer deadline already is. A deadline of 24 November means "through the end of
// 24 November, Lagos time", so a parent is never cut off in the middle of the last day.
const LAGOS_TODAY = `(now() AT TIME ZONE 'Africa/Lagos')::date`;

// The payment clock. It starts when the application first entered "submitted", and starts again if an administrator
// reopens an expired application, because that puts it back into "submitted".
const PAYMENT_CLOCK = `
  CROSS JOIN LATERAL (
    SELECT COALESCE(max(h.created_at), ap.submitted_at) AS at, max(h.id) AS id
      FROM application_status_history h
     WHERE h.application_id = ap.id AND h.to_status = 'submitted') clock`;
const deadlineSql = (daysParam) => `((clock.at AT TIME ZONE 'Africa/Lagos')::date + ${daysParam}::int)`;

const NOTHING_PAID = `NOT EXISTS (SELECT 1 FROM payments p WHERE p.application_id = ap.id AND p.status = 'successful')`;
// A parent may be in the middle of paying online (or paid and we have not heard yet). Do not close the application under them:
// the reconcile job settles those first, and a payment that still cannot be credited goes to staff for review.
const NO_OPEN_ONLINE_PAYMENT = `NOT EXISTS (SELECT 1 FROM payment_attempts t WHERE t.application_id = ap.id
  AND (t.status = 'needs_review' OR (t.status = 'initiated' AND t.created_at > now() - interval '3 days')))`;
const reminderNotSentYet = (kind, refSql) =>
  `NOT EXISTS (SELECT 1 FROM reminder_log r WHERE r.application_id = ap.id AND r.kind = '${kind}' AND r.ref = ${refSql})`;

// Small helper: builds the optional "just this application" filter
function withOptionalId(params, applicationId) {
  if (!applicationId) return '';
  params.push(applicationId);
  return `AND ap.id = $${params.length}`;
}

// ---------- locking ----------
async function lockApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT id, status, campus_id AS "campusId", application_number AS "applicationNumber"
       FROM applications WHERE id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows[0] || null;
}

// ---------- unpaid applications ----------
// Submitted, nothing paid at all, deadline passed, and no exam seat held. (An application with a payment is left for
// finance to decide, and an exam cannot be booked before the fee is paid, so in practice there is no seat to release.)
async function findExpirable(db, { days, applicationId, limit = 200 }) {
  const params = [days, limit];
  const only = withOptionalId(params, applicationId);
  const { rows } = await db.query(
    `SELECT ap.id, to_char(${deadlineSql('$1')}, 'YYYY-MM-DD') AS deadline
       FROM applications ap ${PAYMENT_CLOCK}
      WHERE ap.status = 'submitted'
        AND ${deadlineSql('$1')} < ${LAGOS_TODAY}
        AND ${NOTHING_PAID}
        AND NOT EXISTS (SELECT 1 FROM examinations e WHERE e.application_id = ap.id AND e.status = 'scheduled')
        AND ${NO_OPEN_ONLINE_PAYMENT}
        ${only}
      ORDER BY clock.at, ap.id
      LIMIT $2`,
    params
  );
  return rows;
}

// Unpaid, still before the deadline, but inside the warning window
async function findPaymentWarnings(db, { days, warningDays, applicationId, limit = 200 }) {
  const params = [days, warningDays, limit];
  const only = withOptionalId(params, applicationId);
  const { rows } = await db.query(
    `SELECT ap.id, to_char(${deadlineSql('$1')}, 'YYYY-MM-DD') AS deadline, COALESCE(clock.id, 0)::text AS ref
       FROM applications ap ${PAYMENT_CLOCK}
      WHERE ap.status = 'submitted'
        AND ${deadlineSql('$1')} >= ${LAGOS_TODAY}
        AND ${LAGOS_TODAY} >= ${deadlineSql('$1')} - $2::int
        AND ${NOTHING_PAID}
        AND ${reminderNotSentYet('unpaid_expiry_warning', 'COALESCE(clock.id, 0)::text')}
        ${only}
      ORDER BY clock.at, ap.id
      LIMIT $3`,
    params
  );
  return rows;
}

// The last day a parent can pay, for the parent's status page. Null when there is nothing to show.
async function findPaymentDeadline(applicationId, days, db = { query }) {
  const { rows } = await db.query(
    `SELECT to_char(${deadlineSql('$2')}, 'YYYY-MM-DD') AS deadline
       FROM applications ap ${PAYMENT_CLOCK}
      WHERE ap.id = $1 AND ap.status = 'submitted' AND ${NOTHING_PAID}`,
    [applicationId, days]
  );
  return rows[0] ? rows[0].deadline : null;
}

// ---------- offers ----------
async function findExpirableOffers(db, { applicationId, limit = 200 }) {
  const params = [limit];
  const only = withOptionalId(params, applicationId);
  const { rows } = await db.query(
    `SELECT ap.id, d.id AS "decisionId", to_char(d.offer_deadline, 'YYYY-MM-DD') AS deadline
       FROM decisions d JOIN applications ap ON ap.id = d.application_id
      WHERE d.response = 'pending' AND ap.status = 'offered'
        AND d.offer_deadline < ${LAGOS_TODAY}
        ${only}
      ORDER BY d.offer_deadline, ap.id
      LIMIT $1`,
    params
  );
  return rows;
}

async function findOfferReminders(db, { reminderDays, applicationId, limit = 200 }) {
  const params = [reminderDays, limit];
  const only = withOptionalId(params, applicationId);
  const { rows } = await db.query(
    `SELECT ap.id, d.id::text AS ref, to_char(d.offer_deadline, 'YYYY-MM-DD') AS deadline
       FROM decisions d JOIN applications ap ON ap.id = d.application_id
      WHERE d.response = 'pending' AND ap.status = 'offered'
        AND d.offer_deadline >= ${LAGOS_TODAY}
        AND ${LAGOS_TODAY} >= d.offer_deadline - $1::int
        AND ${reminderNotSentYet('offer_reminder', 'd.id::text')}
        ${only}
      ORDER BY d.offer_deadline, ap.id
      LIMIT $2`,
    params
  );
  return rows;
}

// ---------- exams ----------
// "ref" is the newest entry in the exam's history, so moving the exam to another slot earns a new reminder
async function findExamReminders(db, { hours, liveStatuses, applicationId, limit = 200 }) {
  const params = [hours, liveStatuses, limit];
  const only = withOptionalId(params, applicationId);
  const { rows } = await db.query(
    `SELECT ap.id, COALESCE(hist.id, 0)::text AS ref, e.exam_number AS "examNumber",
            s.starts_at AS "startsAt", s.venue, c.name AS "campusName"
       FROM examinations e
       JOIN applications ap ON ap.id = e.application_id
       JOIN exam_slots s ON s.id = e.slot_id
       JOIN campuses c ON c.id = s.campus_id
       CROSS JOIN LATERAL (SELECT max(h.id) AS id FROM examination_history h WHERE h.examination_id = e.id) hist
      WHERE e.status = 'scheduled' AND ap.status = ANY($2::text[])
        AND s.starts_at > now() AND s.starts_at <= now() + make_interval(hours => $1::int)
        AND ${reminderNotSentYet('exam_reminder', 'COALESCE(hist.id, 0)::text')}
        ${only}
      ORDER BY s.starts_at, ap.id
      LIMIT $3`,
    params
  );
  return rows;
}

// ---------- interviews ----------
// "ref" is the newest entry in the interview's history, so moving the interview earns a new reminder
async function findInterviewReminders(db, { hours, liveStatuses, applicationId, limit = 200 }) {
  const params = [hours, liveStatuses, limit];
  const only = withOptionalId(params, applicationId);
  const { rows } = await db.query(
    `SELECT ap.id, COALESCE(hist.id, 0)::text AS ref, i.starts_at AS "startsAt", i.duration_minutes AS "durationMinutes",
            i.timezone, i.platform, i.meeting_url AS "meetingUrl", i.location, i.instructions
       FROM interviews i
       JOIN applications ap ON ap.id = i.application_id
       CROSS JOIN LATERAL (SELECT max(h.id) AS id FROM interview_history h WHERE h.interview_id = i.id) hist
      WHERE i.status = 'scheduled' AND ap.status = ANY($2::text[])
        AND i.starts_at > now() AND i.starts_at <= now() + make_interval(hours => $1::int)
        AND ${reminderNotSentYet('interview_reminder', 'COALESCE(hist.id, 0)::text')}
        ${only}
      ORDER BY i.starts_at, ap.id
      LIMIT $3`,
    params
  );
  return rows;
}

// ---------- once-only reminders ----------
// True if this call recorded the reminder (so the caller should send it). False if it was already recorded.
async function markReminderSent({ applicationId, kind, ref }, client) {
  const { rowCount } = await client.query(
    `INSERT INTO reminder_log (application_id, kind, ref) VALUES ($1,$2,$3) ON CONFLICT (application_id, kind, ref) DO NOTHING`,
    [applicationId, kind, ref]
  );
  return rowCount === 1;
}

// ---------- job state ----------
async function recordRun(job, { startedAt, processed, error }) {
  const { rows } = await query(
    `INSERT INTO job_state (job, runs, last_started_at, last_finished_at, last_processed, last_error)
     VALUES ($1, 1, $2, now(), $3, $4)
     ON CONFLICT (job) DO UPDATE SET runs = job_state.runs + 1, last_started_at = EXCLUDED.last_started_at,
       last_finished_at = now(), last_processed = EXCLUDED.last_processed, last_error = EXCLUDED.last_error
     RETURNING id`,
    [job, startedAt, processed, error ? String(error).slice(0, 300) : null]
  );
  return rows[0].id;
}

async function listState() {
  const { rows } = await query(
    `SELECT id, job, runs, last_started_at AS "lastStartedAt", last_finished_at AS "lastFinishedAt",
            last_processed AS "lastProcessed", last_error AS "lastError"
       FROM job_state ORDER BY job`
  );
  return rows;
}

module.exports = {
  lockApplication, findExpirable, findPaymentWarnings, findPaymentDeadline,
  findExpirableOffers, findOfferReminders, findExamReminders, findInterviewReminders,
  markReminderSent, recordRun, listState,
};
