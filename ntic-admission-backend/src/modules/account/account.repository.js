// src/modules/account/account.repository.js
// SQL for email verification, password reset and password change.

const { query } = require('../../db/pool');

const SELECT_USER = `
  SELECT id, email, first_name AS "firstName", role, is_active AS "isActive",
         email_verified_at AS "emailVerifiedAt"
    FROM users`;

async function findUserById(id, db = { query }) {
  const { rows } = await db.query(`${SELECT_USER} WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Emails are case-insensitive (the same rule as the unique index on users)
async function findUserByEmail(email, db = { query }) {
  const { rows } = await db.query(`${SELECT_USER} WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

// ---------- tokens ----------

// Links asked for in the last hour, and how long ago the newest one was: used to limit how often emails can be requested
async function recentTokenActivity(userId, purpose, db = { query }) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS "lastHour",
            COALESCE(extract(epoch FROM now() - max(created_at)), 1e9)::float8 AS "secondsSinceLast"
       FROM account_tokens WHERE user_id = $1 AND purpose = $2`,
    [userId, purpose]
  );
  return rows[0];
}

// Only the newest link should work: opening a new one closes the older ones
async function closeOpenTokens(userId, purpose, client) {
  await client.query(
    `UPDATE account_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
}

async function insertToken({ userId, purpose, tokenHash, email, ttlMinutes }, client) {
  await client.query(
    `INSERT INTO account_tokens (user_id, purpose, token_hash, email, expires_at)
     VALUES ($1,$2,$3,$4, now() + make_interval(mins => $5))`,
    [userId, purpose, tokenHash, email, ttlMinutes]
  );
}

// The token row, locked, with everything needed to decide whether it may still be used.
// "usable" is worked out by the database clock, in one place.
async function lockToken(tokenHash, purpose, client) {
  const { rows } = await client.query(
    `SELECT t.id, t.user_id AS "userId", t.email AS "tokenEmail",
            (t.used_at IS NULL AND t.expires_at > now()) AS usable,
            u.email AS "currentEmail", u.is_active AS "isActive", u.role, u.email_verified_at AS "emailVerifiedAt"
       FROM account_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.purpose = $2
        FOR UPDATE OF t`,
    [tokenHash, purpose]
  );
  return rows[0] || null;
}

async function markTokenUsed(id, client) {
  await client.query(`UPDATE account_tokens SET used_at = now() WHERE id = $1`, [id]);
}

// ---------- users ----------
async function markEmailVerified(userId, client) {
  await client.query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [userId]);
}

// A new password also clears wrong-password counting and any lock
async function setPassword(userId, passwordHash, client) {
  await client.query(
    `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1`,
    [userId, passwordHash]
  );
}

// For "change password": the stored hash and whether the account is locked right now
async function findForPasswordCheck(userId, client) {
  const { rows } = await client.query(
    `SELECT id, email, first_name AS "firstName", role, password_hash AS "passwordHash",
            (locked_until IS NOT NULL AND locked_until > now()) AS locked
       FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  return rows[0] || null;
}

// Same rule as sign-in: 5 wrong passwords lock the account for 15 minutes. Returns true if it is now locked.
async function registerWrongPassword(userId, client) {
  const { rows } = await client.query(
    `UPDATE users
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
      WHERE id = $1
  RETURNING (failed_login_count >= 5) AS locked`,
    [userId]
  );
  return rows[0].locked;
}

async function clearWrongPasswords(userId, client) {
  await client.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [userId]);
}

module.exports = {
  findUserById, findUserByEmail, recentTokenActivity, closeOpenTokens, insertToken, lockToken, markTokenUsed,
  markEmailVerified, setPassword, findForPasswordCheck, registerWrongPassword, clearWrongPasswords,
};
