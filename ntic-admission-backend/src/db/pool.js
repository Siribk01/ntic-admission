// src/db/pool.js
// One shared PostgreSQL connection pool for the whole app.

const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,                       // at most 10 connections open at once
  idleTimeoutMillis: 30000,      // close a connection idle for 30 seconds
  connectionTimeoutMillis: 5000, // give up after 5 seconds if the DB is unreachable
});

// Without this, an unexpected error on an idle connection could crash the process.
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

// Simple query. Always pass values as `params`, never build SQL by joining strings.
// Example: query('SELECT * FROM users WHERE id = $1', [id])
const query = (text, params) => pool.query(text, params);

// Runs `work(client)` inside a transaction: COMMIT if it succeeds, ROLLBACK if it throws.
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // always hand the connection back to the pool
  }
}

// Used by the health check and for testing.
async function checkConnection() {
  const { rows } = await query(
    'SELECT current_database() AS database, now() AS server_time'
  );
  return rows[0];
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, checkConnection, closePool };