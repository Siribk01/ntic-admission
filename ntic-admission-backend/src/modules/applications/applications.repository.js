// src/modules/applications/applications.repository.js
// SQL only for applications. Parent ownership is enforced by joining through applicants.

const { query } = require('../../db/pool');

const SELECT_APPLICATION = `
  SELECT ap.id,
         ap.applicant_id AS "applicantId",
         ap.cycle_id     AS "cycleId",
         ap.status,
         ap.campus_id    AS "campusId",
         ap.category_id  AS "categoryId",
         ap.program,
         ap.boarding,
         ap.heard_from   AS "heardFrom",
         ap.heard_from_other AS "heardFromOther",
         to_char(ap.preferred_exam_date, 'YYYY-MM-DD') AS "preferredExamDate",
         ap.preferred_exam_time AS "preferredExamTime",
         ap.preferred_exam_campus_id AS "preferredExamCampusId",
         ap.interview_availability AS "interviewAvailability",
         ap.consent_given_at AS "consentGivenAt",
         ap.consent_version  AS "consentVersion",
         ap.application_number AS "applicationNumber",
         ap.submitted_at     AS "submittedAt",
         ap.fee_amount_minor::float8 AS "feeAmountMinor",
         pay.paid::float8    AS "paidMinor",
         CASE WHEN ap.fee_amount_minor IS NULL THEN NULL
              WHEN pay.paid = 0 THEN 'unpaid'
              WHEN pay.paid < ap.fee_amount_minor THEN 'part_paid'
              ELSE 'paid' END AS "paymentStatus",
         ap.fee_currency     AS "feeCurrency",
         ap.created_at   AS "createdAt",
         ap.updated_at   AS "updatedAt"
    FROM applications ap
    JOIN applicants a ON a.id = ap.applicant_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.amount_minor), 0) AS paid
        FROM payments p WHERE p.application_id = ap.id AND p.status = 'successful'
    ) pay ON true
`;

const COLUMN_FOR_FIELD = {
  campusId: 'campus_id',
  categoryId: 'category_id',
  program: 'program',
  boarding: 'boarding',
  heardFrom: 'heard_from',
  heardFromOther: 'heard_from_other',
  preferredExamDate: 'preferred_exam_date',
  preferredExamTime: 'preferred_exam_time',
  preferredExamCampusId: 'preferred_exam_campus_id',
  interviewAvailability: 'interview_availability',
};

// The cycle, but only if it is accepting applications right now (status active and inside its dates)
async function findAcceptingCycle(cycleId, db = { query }) {
  const { rows } = await db.query(
    `SELECT id FROM admission_cycles
      WHERE id = $1 AND status = 'active' AND now() >= opens_at AND now() < closes_at`,
    [cycleId]
  );
  return rows[0] || null;
}

async function isCategoryOfferedInCycle(cycleId, categoryId, db = { query }) {
  const { rows } = await db.query(
    `SELECT 1 FROM cycle_categories cc
       JOIN admission_categories c ON c.id = cc.category_id
      WHERE cc.cycle_id = $1 AND cc.category_id = $2 AND c.is_active = true`,
    [cycleId, categoryId]
  );
  return rows.length > 0;
}

async function findActiveCampusIds(campusIds, db = { query }) {
  const { rows } = await db.query(
    `SELECT id FROM campuses WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [campusIds]
  );
  return rows.map((r) => r.id);
}

async function insert(applicantId, cycleId) {
  const { rows } = await query(
    `INSERT INTO applications (applicant_id, cycle_id) VALUES ($1, $2) RETURNING id`,
    [applicantId, cycleId]
  );
  return rows[0].id;
}

async function findOwned(applicationId, parentUserId, db = { query }) {
  const { rows } = await db.query(
    `${SELECT_APPLICATION} WHERE ap.id = $1 AND a.parent_user_id = $2`,
    [applicationId, parentUserId]
  );
  return rows[0] || null;
}

// Same as findOwned but locks the application row until the transaction ends
async function lockOwned(applicationId, parentUserId, client) {
  const { rows } = await client.query(
    `SELECT ap.id FROM applications ap JOIN applicants a ON a.id = ap.applicant_id
      WHERE ap.id = $1 AND a.parent_user_id = $2 FOR UPDATE OF ap`,
    [applicationId, parentUserId]
  );
  return rows[0] || null;
}

async function listByParent(parentUserId) {
  const { rows } = await query(
    `${SELECT_APPLICATION} WHERE a.parent_user_id = $1 ORDER BY ap.created_at`,
    [parentUserId]
  );
  return rows;
}

async function update(applicationId, data, consentVersion, client) {
  const sets = [];
  const params = [applicationId];
  for (const [field, column] of Object.entries(COLUMN_FOR_FIELD)) {
    if (data[field] !== undefined) {
      params.push(data[field]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (data.consent === true) {
    params.push(consentVersion);
    sets.push(`consent_given_at = COALESCE(consent_given_at, now())`, `consent_version = $${params.length}`);
  }
  if (sets.length === 0) return;
  await client.query(`UPDATE applications SET ${sets.join(', ')} WHERE id = $1`, params);
}

// Moves a draft to submitted and stores the number, time and fee snapshot, all in one statement.
// "AND status = 'draft'" is a second safety net: it cannot submit twice even if a lock were missed.
async function markSubmitted(applicationId, fee, client) {
  const { rowCount } = await client.query(
    `UPDATE applications
        SET status = 'submitted',
            submitted_at = now(),
            application_number = 'NTIC-' || to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY')
                                 || '-' || lpad(nextval('application_number_seq')::text, 6, '0'),
            fee_amount_minor = $2,
            fee_currency = $3,
            fee_rule_id = $4
      WHERE id = $1 AND status = 'draft'`,
    [applicationId, fee.amountMinor, fee.currency, fee.ruleId]
  );
  return rowCount === 1;
}

module.exports = {
  markSubmitted,
  findAcceptingCycle, isCategoryOfferedInCycle, findActiveCampusIds,
  insert, findOwned, lockOwned, listByParent, update,
};
