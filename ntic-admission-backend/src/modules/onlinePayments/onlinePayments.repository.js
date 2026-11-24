// src/modules/onlinePayments/onlinePayments.repository.js
// SQL for online payment attempts, the gateway message inbox, and parents' transfer claims.

const { query } = require('../../db/pool');

// ---------- the parent's application (locked) ----------
async function lockApplicationForParent(applicationId, parentUserId, client) {
  const { rows } = await client.query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", ap.application_number AS "applicationNumber",
            ap.fee_amount_minor::float8 AS "feeAmountMinor", ap.fee_currency AS "feeCurrency",
            u.email AS "parentEmail", a.first_name || ' ' || a.surname AS "candidate"
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       JOIN users u ON u.id = a.parent_user_id
      WHERE ap.id = $1 AND a.parent_user_id = $2
        FOR UPDATE OF ap`,
    [applicationId, parentUserId]
  );
  return rows[0] || null;
}

async function findApplicationOwner(applicationId, parentUserId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ap.id FROM applications ap JOIN applicants a ON a.id = ap.applicant_id WHERE ap.id = $1 AND a.parent_user_id = $2`,
    [applicationId, parentUserId]
  );
  return rows[0] || null;
}

// ---------- attempts ----------
const SELECT_ATTEMPT = `
  SELECT t.id, t.application_id AS "applicationId", ap.application_number AS "applicationNumber", ap.campus_id AS "campusId",
         t.provider, t.reference, t.amount_minor::float8 AS "amountMinor", t.currency, t.status, t.review_reason AS "reviewReason",
         t.authorization_url AS "authorizationUrl", t.initiated_by AS "initiatedBy", t.payment_id AS "paymentId",
         p.receipt_number AS "receiptNumber", t.gateway_status AS "gatewayStatus", t.paid_at AS "paidAt",
         t.created_at AS "createdAt", t.completed_at AS "completedAt"
    FROM payment_attempts t
    JOIN applications ap ON ap.id = t.application_id
    LEFT JOIN payments p ON p.id = t.payment_id
`;

async function insertAttempt(a, client) {
  const { rows } = await client.query(
    `INSERT INTO payment_attempts (application_id, provider, reference, amount_minor, currency, initiated_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [a.applicationId, a.provider, a.reference, a.amountMinor, a.currency, a.initiatedBy]
  );
  return rows[0].id;
}

async function findAttemptByReference(reference, db = { query }) {
  const { rows } = await db.query(`${SELECT_ATTEMPT} WHERE t.reference = $1`, [reference]);
  return rows[0] || null;
}

async function findAttemptById(id, db = { query }) {
  const { rows } = await db.query(`${SELECT_ATTEMPT} WHERE t.id = $1`, [id]);
  return rows[0] || null;
}

async function lockAttempt(id, client) {
  const { rows } = await client.query(`SELECT id, status FROM payment_attempts WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] || null;
}

// A recent open attempt for the same amount is shown again instead of starting a second one
async function findReusableAttempt({ applicationId, amountMinor, withinMinutes }, client) {
  const { rows } = await client.query(
    `SELECT reference, authorization_url AS "authorizationUrl", amount_minor::float8 AS "amountMinor", currency, provider
       FROM payment_attempts
      WHERE application_id = $1 AND amount_minor = $2 AND status = 'initiated' AND authorization_url IS NOT NULL
        AND created_at > now() - make_interval(mins => $3::int)
      ORDER BY created_at DESC LIMIT 1`,
    [applicationId, amountMinor, withinMinutes]
  );
  return rows[0] || null;
}

async function countAttemptsSince(applicationId, hours, client) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM payment_attempts WHERE application_id = $1 AND created_at > now() - make_interval(hours => $2::int)`,
    [applicationId, hours]
  );
  return rows[0].n;
}

async function setAuthorizationUrl(id, url, client) {
  await client.query(`UPDATE payment_attempts SET authorization_url = $2 WHERE id = $1`, [id, url]);
}

async function finishAttempt(id, f, client) {
  await client.query(
    `UPDATE payment_attempts
        SET status = $2, review_reason = $3, payment_id = COALESCE($4, payment_id), gateway_status = COALESCE($5, gateway_status),
            gateway_id = COALESCE($6, gateway_id), paid_at = COALESCE($7::timestamptz, paid_at),
            completed_at = CASE WHEN $2 IN ('successful','failed','abandoned') THEN now() ELSE completed_at END
      WHERE id = $1`,
    [id, f.status, f.reviewReason ?? null, f.paymentId ?? null, f.gatewayStatus ?? null, f.gatewayId ?? null, f.paidAt ?? null]
  );
}

async function listAttemptsForParent(applicationId) {
  const { rows } = await query(
    `${SELECT_ATTEMPT} WHERE t.application_id = $1 ORDER BY t.created_at DESC LIMIT 20`,
    [applicationId]
  );
  return rows;
}

async function listAttemptsForStaff({ status, campusScope, limit }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
  if (campusScope) { params.push(campusScope); where.push(`ap.campus_id = ANY($${params.length}::uuid[])`); }
  params.push(limit);
  const { rows } = await query(
    `${SELECT_ATTEMPT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

// For the reconcile job: payments that were started but never confirmed to us
async function findOpenAttempts(db, { olderThanMinutes, limit }) {
  const { rows } = await db.query(
    `SELECT id, reference, created_at AS "createdAt" FROM payment_attempts
      WHERE status = 'initiated' AND created_at < now() - make_interval(mins => $1::int)
      ORDER BY created_at LIMIT $2`,
    [olderThanMinutes, limit]
  );
  return rows;
}

async function countOpenAttempts(db, { olderThanMinutes }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM payment_attempts WHERE status = 'initiated' AND created_at < now() - make_interval(mins => $1::int)`,
    [olderThanMinutes]
  );
  return rows[0].n;
}

async function countNeedingReview(db) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM payment_attempts WHERE status = 'needs_review'`);
  return rows[0].n;
}

// ---------- the gateway message inbox ----------
// Returns the new row, or null if this message was already received
async function insertEvent(e, client = { query }) {
  const { rows } = await client.query(
    `INSERT INTO webhook_events (provider, event_id, event_type, reference, payload) VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
    [e.provider, e.eventId, e.type, e.reference, JSON.stringify(e.payload)]
  );
  return rows[0] || null;
}

async function findEvent(provider, eventId) {
  const { rows } = await query(`SELECT id, status, reference FROM webhook_events WHERE provider = $1 AND event_id = $2`, [provider, eventId]);
  return rows[0] || null;
}

async function markEvent(id, status, error) {
  await query(
    `UPDATE webhook_events SET status = $2, last_error = $3, tries = tries + 1, processed_at = CASE WHEN $2 IN ('processed','ignored') THEN now() ELSE processed_at END WHERE id = $1`,
    [id, status, error ? String(error).slice(0, 300) : null]
  );
}

async function findRetryableEvents(db, { olderThanMinutes, maxTries, limit }) {
  const { rows } = await db.query(
    `SELECT id, reference FROM webhook_events
      WHERE status IN ('received','failed') AND tries < $2 AND received_at < now() - make_interval(mins => $1::int)
      ORDER BY received_at LIMIT $3`,
    [olderThanMinutes, maxTries, limit]
  );
  return rows;
}

// ---------- transfer claims ----------
const SELECT_CLAIM = `
  SELECT c.id, c.application_id AS "applicationId", ap.application_number AS "applicationNumber", ap.campus_id AS "campusId",
         a.first_name || ' ' || a.surname AS "candidate", c.amount_minor::float8 AS "amountMinor", c.currency,
         c.bank_reference AS "bankReference", c.bank_name AS "bankName", c.paid_on::text AS "paidOn", c.note, c.status,
         c.rejection_reason AS "rejectionReason", c.reviewed_at AS "reviewedAt", c.payment_id AS "paymentId",
         p.receipt_number AS "receiptNumber", c.created_at AS "createdAt"
    FROM payment_claims c
    JOIN applications ap ON ap.id = c.application_id
    JOIN applicants a ON a.id = ap.applicant_id
    LEFT JOIN payments p ON p.id = c.payment_id
`;

async function insertClaim(c, client) {
  const { rows } = await client.query(
    `INSERT INTO payment_claims (application_id, amount_minor, currency, bank_reference, bank_name, paid_on, note, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8) RETURNING id`,
    [c.applicationId, c.amountMinor, c.currency, c.bankReference, c.bankName ?? null, c.paidOn, c.note ?? null, c.submittedBy]
  );
  return rows[0].id;
}

async function findClaim(id, db = { query }) {
  const { rows } = await db.query(`${SELECT_CLAIM} WHERE c.id = $1`, [id]);
  return rows[0] || null;
}

async function lockClaim(id, client) {
  const { rows } = await client.query(
    `SELECT id, status, amount_minor::float8 AS "amountMinor", bank_reference AS "bankReference", bank_name AS "bankName", paid_on::text AS "paidOn"
       FROM payment_claims WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

async function countPendingClaims(applicationId, client) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM payment_claims WHERE application_id = $1 AND status = 'pending'`, [applicationId]);
  return rows[0].n;
}

async function referenceAlreadyPaid(reference, client) {
  const { rows } = await client.query(`SELECT 1 FROM payments WHERE lower(bank_reference) = lower($1) AND status = 'successful'`, [reference]);
  return rows.length > 0;
}

async function confirmClaim({ id, reviewerId, paymentId }, client) {
  await client.query(`UPDATE payment_claims SET status = 'confirmed', reviewed_by = $2, reviewed_at = now(), payment_id = $3 WHERE id = $1`, [id, reviewerId, paymentId]);
}

async function rejectClaim({ id, reviewerId, reason }, client) {
  await client.query(`UPDATE payment_claims SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), rejection_reason = $3 WHERE id = $1`, [id, reviewerId, reason]);
}

async function listClaimsForParent(applicationId) {
  const { rows } = await query(`${SELECT_CLAIM} WHERE c.application_id = $1 ORDER BY c.created_at DESC LIMIT 20`, [applicationId]);
  return rows;
}

async function listClaimsForStaff({ status, campusScope, limit }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (campusScope) { params.push(campusScope); where.push(`ap.campus_id = ANY($${params.length}::uuid[])`); }
  params.push(limit);
  const { rows } = await query(
    `${SELECT_CLAIM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function findParentEmail(userId, db = { query }) {
  const { rows } = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
  return rows[0] ? rows[0].email : null;
}

module.exports = {
  lockApplicationForParent, findApplicationOwner,
  insertAttempt, findAttemptByReference, findAttemptById, lockAttempt, findReusableAttempt, countAttemptsSince,
  setAuthorizationUrl, finishAttempt, listAttemptsForParent, listAttemptsForStaff, findOpenAttempts, countOpenAttempts, countNeedingReview,
  insertEvent, findEvent, markEvent, findRetryableEvents,
  insertClaim, findClaim, lockClaim, countPendingClaims, referenceAlreadyPaid, confirmClaim, rejectClaim, listClaimsForParent, listClaimsForStaff,
  findParentEmail,
};
