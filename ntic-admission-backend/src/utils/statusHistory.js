// src/utils/statusHistory.js
// The ONLY place an application's status is changed after submission, so every change leaves a history row (FR-028).
// Always called with the transaction client, so the status change and its history are saved together or not at all.

const AppError = require('./AppError');
const { canTransition } = require('../constants/applicationStatus');

// Writes a history row. "reason" is internal; "publicNote" is what the parent may see on their timeline.
async function record(client, { applicationId, from, to, actorId, reason, publicNote }) {
  await client.query(
    `INSERT INTO application_status_history (application_id, from_status, to_status, actor_id, reason, public_note)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [applicationId, from ?? null, to, actorId ?? null, reason ?? null, publicNote ?? null]
  );
}

// Moves the application from one status to another, checking the rules and that nobody else moved it first.
async function transition(client, { applicationId, from, to, actorId, reason, publicNote }) {
  if (!canTransition(from, to)) {
    throw new AppError(`An application cannot move from "${from}" to "${to}"`, 409, 'INVALID_STATE');
  }
  const { rowCount } = await client.query(
    `UPDATE applications SET status = $3 WHERE id = $1 AND status = $2`,
    [applicationId, from, to]
  );
  if (rowCount !== 1) throw new AppError('The application status changed. Please refresh and try again.', 409, 'INVALID_STATE');
  await record(client, { applicationId, from, to, actorId, reason, publicNote });
}

module.exports = { record, transition };
