// src/modules/settings/settings.repository.js
const { query } = require('../../db/pool');

// Everything an administrator has changed. Settings never changed are simply not here.
async function findAll(db = { query }) {
  const { rows } = await db.query(`SELECT id, key, value, updated_at AS "updatedAt" FROM settings`);
  return rows;
}

// Saves one value (creates the row or replaces it). Returns the row id, which the audit log uses.
async function upsert(key, value, userId, client) {
  const { rows } = await client.query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id`,
    [key, JSON.stringify(value), userId]
  );
  return rows[0].id;
}

module.exports = { findAll, upsert };
