// src/modules/documents/documents.repository.js
// SQL only for document types and uploaded documents.

const { query } = require('../../db/pool');

async function listActiveTypes() {
  const { rows } = await query(
    `SELECT code, name, required, allowed_mimes AS "allowedMimes", max_bytes AS "maxBytes"
       FROM document_types WHERE is_active = true ORDER BY sort_order, name`
  );
  return rows;
}

async function findActiveTypeByCode(code, db = { query }) {
  const { rows } = await db.query(
    `SELECT id, code, name, required, allowed_mimes AS "allowedMimes", max_bytes AS "maxBytes"
       FROM document_types WHERE code = $1 AND is_active = true`,
    [code]
  );
  return rows[0] || null;
}

// Locks the application row (so an upload cannot slip in while it is being submitted) and returns what we need to decide
async function lockApplicationForUpload(applicationId, client) {
  const { rows } = await client.query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", a.parent_user_id AS "parentUserId"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id
      WHERE ap.id = $1 FOR UPDATE OF ap`,
    [applicationId]
  );
  return rows[0] || null;
}

// Application plus owner, no lock. Used for reads.
async function findApplicationOwnerAndCampus(applicationId) {
  const { rows } = await query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", a.parent_user_id AS "parentUserId"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id
      WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

const SELECT_DOCUMENT = `
  SELECT d.id,
         dt.code AS "typeCode", dt.name AS "typeName",
         d.original_name AS "originalName",
         d.mime_type AS "mimeType",
         d.size_bytes AS "sizeBytes",
         d.sha256,
         d.stored_name AS "storedName",
         d.created_at AS "uploadedAt",
         d.updated_at AS "updatedAt"
    FROM application_documents d
    JOIN document_types dt ON dt.id = d.document_type_id
`;

async function listForApplication(applicationId) {
  const { rows } = await query(`${SELECT_DOCUMENT} WHERE d.application_id = $1 ORDER BY dt.sort_order`, [applicationId]);
  return rows;
}

async function findByApplicationAndCode(applicationId, code, db = { query }) {
  const { rows } = await db.query(`${SELECT_DOCUMENT} WHERE d.application_id = $1 AND dt.code = $2`, [applicationId, code]);
  return rows[0] || null;
}

// Adds the document, or replaces the existing one of that type. Returns the new row's id.
async function upsert(doc, client) {
  const { rows } = await client.query(
    `INSERT INTO application_documents
       (application_id, document_type_id, original_name, stored_name, mime_type, size_bytes, sha256, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (application_id, document_type_id) DO UPDATE
       SET original_name = EXCLUDED.original_name, stored_name = EXCLUDED.stored_name,
           mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes,
           sha256 = EXCLUDED.sha256, uploaded_by = EXCLUDED.uploaded_by
     RETURNING id`,
    [doc.applicationId, doc.typeId, doc.originalName, doc.storedName, doc.mimeType, doc.sizeBytes, doc.sha256, doc.uploadedBy]
  );
  return rows[0].id;
}

async function deleteById(id, client) {
  await client.query('DELETE FROM application_documents WHERE id = $1', [id]);
}

// Required, active document types this application has not uploaded yet
async function listMissingRequired(applicationId, db = { query }) {
  const { rows } = await db.query(
    `SELECT dt.code, dt.name
       FROM document_types dt
      WHERE dt.required AND dt.is_active
        AND NOT EXISTS (SELECT 1 FROM application_documents d
                         WHERE d.application_id = $1 AND d.document_type_id = dt.id)
      ORDER BY dt.sort_order`,
    [applicationId]
  );
  return rows;
}

module.exports = {
  listActiveTypes, findActiveTypeByCode, lockApplicationForUpload, findApplicationOwnerAndCampus,
  listForApplication, findByApplicationAndCode, upsert, deleteById, listMissingRequired,
};
