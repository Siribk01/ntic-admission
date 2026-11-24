// src/modules/printables/printables.repository.js
// SQL only. Everything a printed document needs is read here; nothing is changed except the templates and issued letters.

const { query } = require('../../db/pool');

const NAME_JOINS = `
  JOIN applicants a ON a.id = ap.applicant_id
  LEFT JOIN campuses campus ON campus.id = ap.campus_id
  LEFT JOIN admission_categories cat ON cat.id = ap.category_id
  LEFT JOIN admission_cycles cy ON cy.id = ap.cycle_id`;

const NAME_COLUMNS = `
  ap.application_number AS "applicationNumber", ap.campus_id AS "campusId", a.parent_user_id AS "parentUserId",
  a.first_name AS "firstName", a.middle_name AS "middleName", a.surname,
  campus.name AS "campusName", cat.name AS "categoryName", cy.academic_session AS "academicSession"`;

async function findReceiptData(paymentId) {
  const { rows } = await query(
    `SELECT p.id, p.application_id AS "applicationId", p.receipt_number AS "receiptNumber", p.amount_minor::float8 AS "amountMinor",
            p.currency, p.method, p.provider, p.bank_reference AS "bankReference", p.status, p.paid_at AS "paidAt", p.reversed_at AS "reversedAt",
            ap.fee_amount_minor::float8 AS "feeMinor", ap.fee_currency AS "feeCurrency",
            COALESCE(paid.total, 0)::float8 AS "paidTotalMinor",
            ${NAME_COLUMNS}
       FROM payments p
       JOIN applications ap ON ap.id = p.application_id
       ${NAME_JOINS}
       LEFT JOIN LATERAL (SELECT SUM(x.amount_minor) AS total FROM payments x WHERE x.application_id = ap.id AND x.status = 'successful') paid ON true
      WHERE p.id = $1`,
    [paymentId]
  );
  return rows[0] || null;
}

async function findExamCardData(applicationId) {
  const { rows } = await query(
    `SELECT e.exam_number AS "examNumber", e.status AS "examStatus",
            s.starts_at AS "startsAt", s.duration_minutes AS "durationMinutes", s.mode, s.venue, slot_campus.name AS "slotCampusName",
            to_char(a.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
            ${NAME_COLUMNS}
       FROM applications ap
       ${NAME_JOINS}
       LEFT JOIN examinations e ON e.application_id = ap.id
       LEFT JOIN exam_slots s ON s.id = e.slot_id
       LEFT JOIN campuses slot_campus ON slot_campus.id = s.campus_id
      WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

// The application, its parent's name, and the MOST RECENT decision (an older offer that was replaced does not count)
async function findOfferData(applicationId) {
  const { rows } = await query(
    `SELECT ap.id, ${NAME_COLUMNS},
            u.first_name AS "parentFirstName", u.last_name AS "parentLastName",
            d.id AS "decisionId", d.outcome, d.response, to_char(d.offer_deadline, 'YYYY-MM-DD') AS "offerDeadline"
       FROM applications ap
       ${NAME_JOINS}
       LEFT JOIN users u ON u.id = a.parent_user_id
       LEFT JOIN LATERAL (SELECT * FROM decisions x WHERE x.application_id = ap.id ORDER BY x.decided_at DESC, x.created_at DESC LIMIT 1) d ON true
      WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

async function lockDecision(decisionId, client) {
  const { rows } = await client.query('SELECT id, outcome, response FROM decisions WHERE id = $1 FOR UPDATE', [decisionId]);
  return rows[0] || null;
}

// ---------- templates ----------

const TEMPLATE_COLUMNS = `id, key, title, body, signatory_name AS "signatoryName", signatory_title AS "signatoryTitle", version, updated_at AS "updatedAt"`;

async function listTemplates(db = { query }) {
  const { rows } = await db.query(`SELECT ${TEMPLATE_COLUMNS} FROM print_templates ORDER BY key`);
  return rows;
}

async function findTemplate(key, db = { query }) {
  const { rows } = await db.query(`SELECT ${TEMPLATE_COLUMNS} FROM print_templates WHERE key = $1`, [key]);
  return rows[0] || null;
}

async function lockTemplate(key, client) {
  const { rows } = await client.query(`SELECT ${TEMPLATE_COLUMNS} FROM print_templates WHERE key = $1 FOR UPDATE`, [key]);
  return rows[0] || null;
}

async function updateTemplate(id, t, userId, client) {
  const { rows } = await client.query(
    `UPDATE print_templates
        SET title = $2, body = $3, signatory_name = $4, signatory_title = $5, version = version + 1, updated_by = $6, updated_at = now()
      WHERE id = $1
      RETURNING ${TEMPLATE_COLUMNS}`,
    [id, t.title ?? null, t.body, t.signatoryName ?? null, t.signatoryTitle ?? null, userId]
  );
  return rows[0];
}

async function insertVersion(t, userId, client) {
  await client.query(
    `INSERT INTO print_template_versions (template_id, version, title, body, signatory_name, signatory_title, saved_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [t.id, t.version, t.title, t.body, t.signatoryName, t.signatoryTitle, userId]
  );
}

async function listVersions(templateId) {
  const { rows } = await query(
    `SELECT v.version, v.title, v.body, v.signatory_name AS "signatoryName", v.signatory_title AS "signatoryTitle", v.saved_at AS "savedAt",
            u.first_name AS "firstName", u.last_name AS "lastName", u.email
       FROM print_template_versions v LEFT JOIN users u ON u.id = v.saved_by
      WHERE v.template_id = $1 ORDER BY v.version DESC LIMIT 50`,
    [templateId]
  );
  return rows;
}

// ---------- issued letters ----------

async function findIssued(decisionId, kind, db = { query }) {
  const { rows } = await db.query(
    `SELECT id, template_version AS "templateVersion", content, created_at AS "createdAt" FROM issued_letters WHERE decision_id = $1 AND kind = $2`,
    [decisionId, kind]
  );
  return rows[0] || null;
}

// Returns the new row's id, or null when someone else issued it first
async function insertIssued({ decisionId, applicationId, kind, templateVersion, content, userId }, client) {
  const { rows } = await client.query(
    `INSERT INTO issued_letters (decision_id, application_id, kind, template_version, content, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (decision_id, kind) DO NOTHING
     RETURNING id`,
    [decisionId, applicationId, kind, templateVersion, JSON.stringify(content), userId]
  );
  return rows[0] ? rows[0].id : null;
}

async function deleteIssued(decisionId, kind, client) {
  const { rowCount } = await client.query('DELETE FROM issued_letters WHERE decision_id = $1 AND kind = $2', [decisionId, kind]);
  return rowCount;
}

module.exports = {
  findReceiptData, findExamCardData, findOfferData, lockDecision,
  listTemplates, findTemplate, lockTemplate, updateTemplate, insertVersion, listVersions,
  findIssued, insertIssued, deleteIssued,
};
