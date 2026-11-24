// src/modules/users/users.repository.js
// SQL only for the users table. No business rules, no HTTP.

const { query } = require('../../db/pool');

// Columns that are safe to return to the rest of the app. Never includes password_hash.
const SAFE_COLUMNS = `
  id,
  email,
  phone,
  first_name AS "firstName",
  last_name  AS "lastName",
  role,
  is_active AS "isActive",
  email_verified_at AS "emailVerifiedAt",
  created_at AS "createdAt"
`;

// `client` is optional. Pass a transaction client when this insert must be part of a bigger all-or-nothing job.
async function createUser(
  { email, phone = null, passwordHash, firstName, lastName, role = 'applicant' },
  client
) {
  const db = client || { query };
  const { rows } = await db.query(
    `INSERT INTO users (email, phone, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SAFE_COLUMNS}`,
    [email, phone, passwordHash, firstName, lastName, role]
  );
  return rows[0];
}

// For LOGIN ONLY. Includes the password hash and lockout fields.
async function findAuthByEmail(email) {
  const { rows } = await query(
    `SELECT ${SAFE_COLUMNS},
            password_hash       AS "passwordHash",
            failed_login_count  AS "failedLoginCount",
            locked_until        AS "lockedUntil"
       FROM users
      WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

// Safe lookup by id (no password hash)
async function findById(id) {
  const { rows } = await query(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Gives a user access to campuses. Pass the transaction client so it is saved together with the user.
async function addCampusScopes(userId, campusIds, client) {
  const db = client || { query };
  await db.query(
    `INSERT INTO user_campus_scopes (user_id, campus_id)
     SELECT $1, unnest($2::uuid[])`,
    [userId, campusIds]
  );
}
// A wrong password. Adds 1 to the counter in a single atomic statement.
// When the counter reaches maxAttempts: lock the account and start the count again from 0.
async function recordFailedLogin(id, { maxAttempts, lockMinutes }) {
  const { rows } = await query(
    `UPDATE users
        SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2
                                      THEN 0
                                      ELSE failed_login_count + 1 END,
            locked_until       = CASE WHEN failed_login_count + 1 >= $2
                                      THEN now() + make_interval(mins => $3)
                                      ELSE locked_until END
      WHERE id = $1
      RETURNING failed_login_count AS "failedLoginCount", locked_until AS "lockedUntil"`,
    [id, maxAttempts, lockMinutes]
  );
  return rows[0];
}

// How many active users have this role? (used by the first-admin script)
async function countActiveByRole(role) {
  const { rows } = await query(
    `SELECT count(*)::int AS total FROM users WHERE role = $1 AND is_active = true`,
    [role]
  );
  return rows[0].total;
}

// Gives a user access to campuses. Pass the transaction client so it is saved together with the user.
async function addCampusScopes(userId, campusIds, client) {
  const db = client || { query };
  await db.query(
    `INSERT INTO user_campus_scopes (user_id, campus_id)
     SELECT $1, unnest($2::uuid[])`,
    [userId, campusIds]
  );
}

// A correct password. Clears the counter and any lock, and records the time.
async function recordSuccessfulLogin(id) {
  await query(
    `UPDATE users
        SET failed_login_count = 0,
            locked_until = NULL,
            last_login_at = now()
      WHERE id = $1`,
    [id]
  );
}
module.exports = {
  createUser,
  findAuthByEmail,
  findById,
  countActiveByRole,
  addCampusScopes,
  recordFailedLogin,
  recordSuccessfulLogin,
};