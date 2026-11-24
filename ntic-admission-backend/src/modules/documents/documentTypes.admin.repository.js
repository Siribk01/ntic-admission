// src/modules/documents/documentTypes.admin.repository.js
const { query } = require('../../db/pool');

const COLUMNS = `dt.id, dt.code, dt.name, dt.required, dt.allowed_mimes AS "allowedMimes", dt.max_bytes AS "maxBytes",
                 dt.sort_order AS "sortOrder", dt.is_active AS "isActive", dt.created_at AS "createdAt", dt.updated_at AS "updatedAt"`;

async function list() {
  const { rows } = await query(
    `SELECT ${COLUMNS}, (SELECT count(*) FROM application_documents d WHERE d.document_type_id = dt.id)::int AS "uploadedCount"
       FROM document_types dt ORDER BY dt.is_active DESC, dt.sort_order, dt.name`
  );
  return rows;
}

async function findById(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, (SELECT count(*) FROM application_documents d WHERE d.document_type_id = dt.id)::int AS "uploadedCount" FROM document_types dt WHERE dt.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Serialises "how many types are there / what is the next position" so two admins cannot both add the 30th type
async function lockTable(client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('ntic_document_types'))`);
}

async function counts(client) {
  const { rows } = await client.query(`SELECT count(*)::int AS total, COALESCE(max(sort_order), 0)::int AS "maxSort" FROM document_types`);
  return rows[0];
}

async function insert(t, client) {
  const { rows } = await client.query(
    `INSERT INTO document_types (code, name, required, allowed_mimes, max_bytes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [t.code, t.name, t.required, t.allowedMimes, t.maxBytes, t.sortOrder]
  );
  return rows[0].id;
}

async function lockById(id, client) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM document_types dt WHERE dt.id = $1 FOR UPDATE`, [id]);
  return rows[0] || null;
}

async function update(id, t, client) {
  await client.query(
    `UPDATE document_types SET name = $2, required = $3, allowed_mimes = $4, max_bytes = $5, sort_order = $6, is_active = $7, updated_at = now() WHERE id = $1`,
    [id, t.name, t.required, t.allowedMimes, t.maxBytes, t.sortOrder, t.isActive]
  );
}

module.exports = { list, findById, lockTable, counts, insert, lockById, update };
