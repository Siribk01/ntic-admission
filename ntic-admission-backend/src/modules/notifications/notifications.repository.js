// src/modules/notifications/notifications.repository.js
const { query } = require('../../db/pool');

// Who to write to, and what the email needs to say about this application
async function findContext(applicationId, client) {
  const { rows } = await client.query(
    `SELECT u.email AS "recipientEmail",
            a.first_name AS "applicantName",
            ap.application_number AS "applicationNumber",
            ap.fee_amount_minor::float8 AS "feeAmountMinor",
            ap.fee_currency AS "feeCurrency"
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       JOIN users u ON u.id = a.parent_user_id
      WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

// Who to write to when the email is about the account itself, not an application
async function findUserContext(userId, client) {
  const { rows } = await client.query(
    `SELECT email AS "recipientEmail", first_name AS "firstName" FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function insert(n, client) {
  await client.query(
    `INSERT INTO notifications (application_id, recipient_email, template, subject, body_text, body_html)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [n.applicationId, n.recipientEmail, n.template, n.subject, n.text, n.html]
  );
}

// The oldest due email, locked. SKIP LOCKED means a second worker simply takes a different one.
async function lockNextDue(client) {
  const { rows } = await client.query(
    `SELECT id, template, recipient_email AS "to", subject, body_text AS text, body_html AS html, attempts
       FROM notifications
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      LIMIT 1
        FOR UPDATE SKIP LOCKED`
  );
  return rows[0] || null;
}

async function markSent(id, client) {
  await client.query(`UPDATE notifications SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`, [id]);
}

// Emails that carry a one-time link (verify email, reset password) are wiped once delivered, so the outbox never
// holds a working link
async function scrubBody(id, client) {
  const removed = '[Removed after sending: this email contained a one-time link]';
  await client.query(`UPDATE notifications SET body_text = $2, body_html = $2 WHERE id = $1`, [id, removed]);
}

async function markFailedAttempt(id, { attempts, retryInMinutes, error }, client) {
  if (retryInMinutes === null) {
    await client.query(`UPDATE notifications SET status = 'failed', attempts = $2, last_error = $3 WHERE id = $1`, [id, attempts, error]);
  } else {
    await client.query(
      `UPDATE notifications SET attempts = $2, last_error = $3, next_attempt_at = now() + make_interval(mins => $4) WHERE id = $1`,
      [id, attempts, error, retryInMinutes]
    );
  }
}

async function list({ status, limit }) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE status = $1`; }
  params.push(limit);
  const { rows } = await query(
    `SELECT id, application_id AS "applicationId", recipient_email AS "recipientEmail", template, subject,
            status, attempts, last_error AS "lastError", next_attempt_at AS "nextAttemptAt",
            sent_at AS "sentAt", created_at AS "createdAt"
       FROM notifications ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function retryFailed(id, client) {
  const { rowCount } = await client.query(
    `UPDATE notifications SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
      WHERE id = $1 AND status = 'failed'`,
    [id]
  );
  return rowCount === 1;
}

async function counts() {
  const { rows } = await query(`SELECT status, count(*)::int AS total FROM notifications GROUP BY status`);
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}

module.exports = { findContext, findUserContext, scrubBody, insert, lockNextDue, markSent, markFailedAttempt, list, retryFailed, counts };
