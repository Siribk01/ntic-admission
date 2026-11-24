// src/modules/payments/payments.repository.js
// SQL only for payments.

const { query } = require('../../db/pool');

const SELECT_PAYMENT = `
  SELECT p.id,
         p.application_id   AS "applicationId",
         ap.application_number AS "applicationNumber",
         p.receipt_number   AS "receiptNumber",
         p.amount_minor::float8 AS "amountMinor",
         p.currency,
         p.method,
         p.provider,
         p.bank_reference   AS "bankReference",
         p.status,
         p.paid_at          AS "paidAt",
         p.note,
         p.recorded_by      AS "recordedBy",
         p.reversed_at      AS "reversedAt",
         p.reversal_reason  AS "reversalReason",
         p.created_at       AS "createdAt"
    FROM payments p
    JOIN applications ap ON ap.id = p.application_id
`;

// Locks the application row so two payments recorded at once cannot both fit the same remaining balance
async function lockApplication({ applicationId, applicationNumber }, client) {
  const { rows } = await client.query(
    `SELECT id, status, campus_id AS "campusId", fee_amount_minor::float8 AS "feeAmountMinor",
            fee_currency AS "feeCurrency", application_number AS "applicationNumber"
       FROM applications
      WHERE ${applicationId ? 'id = $1' : 'application_number = $1'}
        FOR UPDATE`,
    [applicationId || applicationNumber]
  );
  return rows[0] || null;
}

async function sumSuccessful(applicationId, client) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount_minor), 0)::float8 AS total FROM payments WHERE application_id = $1 AND status = 'successful'`,
    [applicationId]
  );
  return rows[0].total;
}

async function insert(p, client) {
  const { rows } = await client.query(
    `INSERT INTO payments (application_id, amount_minor, currency, method, bank_reference, receipt_number, paid_at, recorded_by, note, provider, attempt_id)
     VALUES ($1, $2, $3, $4, $5,
             'NTIC-RCT-' || lpad(nextval('receipt_number_seq')::text, 6, '0'),
             COALESCE($6::timestamptz, now()), $7, $8, $9, $10)
     RETURNING id`,
    [p.applicationId, p.amountMinor, p.currency, p.method, p.bankReference ?? null, p.paidAt ?? null, p.recordedBy, p.note ?? null, p.provider ?? null, p.attemptId ?? null]
  );
  return rows[0].id;
}

async function findById(id, client) {
  const db = client || { query };
  const { rows } = await db.query(`${SELECT_PAYMENT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function lockById(id, client) {
  const { rows } = await client.query(
    `SELECT p.id, p.status, ap.campus_id AS "campusId"
       FROM payments p JOIN applications ap ON ap.id = p.application_id
      WHERE p.id = $1 FOR UPDATE OF p`,
    [id]
  );
  return rows[0] || null;
}

async function markReversed(id, userId, reason, client) {
  await client.query(
    `UPDATE payments SET status = 'reversed', reversed_at = now(), reversed_by = $2, reversal_reason = $3 WHERE id = $1`,
    [id, userId, reason]
  );
}

// Staff list. campusScope null = every campus, otherwise only those campuses.
async function listForStaff({ applicationId, campusScope, limit }) {
  const conditions = [];
  const params = [];
  if (applicationId) { params.push(applicationId); conditions.push(`p.application_id = $${params.length}`); }
  if (campusScope) { params.push(campusScope); conditions.push(`ap.campus_id = ANY($${params.length}::uuid[])`); }
  params.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_PAYMENT} ${where} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT $${params.length}`, params);
  return rows;
}

// A parent's own receipts (joins through the applicant to check ownership)
async function listForParent({ parentUserId, applicationId, limit }) {
  const params = [parentUserId];
  let extra = '';
  if (applicationId) { params.push(applicationId); extra = `AND p.application_id = $2`; }
  params.push(limit);
  const { rows } = await query(
    `${SELECT_PAYMENT}
      JOIN applicants a ON a.id = ap.applicant_id
     WHERE a.parent_user_id = $1 ${extra}
     ORDER BY p.paid_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

module.exports = { lockApplication, sumSuccessful, insert, findById, lockById, markReversed, listForStaff, listForParent };
