// src/modules/decisions/decisions.repository.js
// SQL for the staff review side: application lists, decisions, and the status timeline.

const { query } = require('../../db/pool');

// ---------- staff list ----------
async function listApplications({ status, cycleId, campusId, q, limit, offset, campusScope }) {
  const where = [`ap.status <> 'draft'`]; // staff never see unsubmitted drafts
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (status) add('ap.status = ?', status);
  if (cycleId) add('ap.cycle_id = ?', cycleId);
  if (campusId) add('ap.campus_id = ?', campusId);
  if (campusScope) add('ap.campus_id = ANY(?::uuid[])', campusScope);
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    const n = params.length;
    where.push(`(ap.application_number ILIKE $${n} OR e.exam_number ILIKE $${n}
                 OR a.first_name || ' ' || a.surname ILIKE $${n} OR a.surname || ' ' || a.first_name ILIKE $${n})`);
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ap.id,
            ap.application_number AS "applicationNumber",
            ap.status,
            a.first_name AS "firstName", a.surname,
            c.name  AS "campusName",
            cat.name AS "categoryName",
            ap.submitted_at AS "submittedAt",
            ap.fee_amount_minor::float8 AS "feeAmountMinor",
            pay.paid::float8 AS "paidMinor",
            e.exam_number AS "examNumber",
            e.status AS "examStatus",
            count(*) OVER()::int AS total
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN campuses c ON c.id = ap.campus_id
       LEFT JOIN admission_categories cat ON cat.id = ap.category_id
       LEFT JOIN examinations e ON e.application_id = ap.id
       LEFT JOIN LATERAL (SELECT COALESCE(SUM(p.amount_minor), 0) AS paid FROM payments p
                           WHERE p.application_id = ap.id AND p.status = 'successful') pay ON true
      WHERE ${where.join(' AND ')}
      ORDER BY ap.submitted_at DESC, ap.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

// ---------- locking ----------
// Application row locked for a status change. Includes owner for parent actions.
async function lockApplication(applicationId, client) {
  const { rows } = await client.query(
    `SELECT ap.id, ap.status, ap.campus_id AS "campusId", ap.category_id AS "categoryId",
            ap.application_number AS "applicationNumber", a.parent_user_id AS "parentUserId"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id
      WHERE ap.id = $1 FOR UPDATE OF ap`,
    [applicationId]
  );
  return rows[0] || null;
}

// ---------- decisions ----------
const SELECT_DECISION = `
  SELECT d.id, d.outcome, d.reason_code AS "reasonCode", d.notes, d.public_message AS "publicMessage",
         to_char(d.offer_deadline, 'YYYY-MM-DD') AS "offerDeadline",
         d.response, d.responded_at AS "respondedAt",
         u.email AS "decidedBy", d.decided_at AS "decidedAt"
    FROM decisions d JOIN users u ON u.id = d.decided_by
`;

async function insertDecision(d, client) {
  const { rows } = await client.query(
    `INSERT INTO decisions (application_id, outcome, reason_code, notes, public_message, offer_deadline, response, decided_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [d.applicationId, d.outcome, d.reasonCode ?? null, d.notes ?? null, d.publicMessage ?? null,
     d.offerDeadline ?? null, d.outcome === 'offered' ? 'pending' : null, d.decidedBy]
  );
  return rows[0].id;
}

async function listDecisions(applicationId) {
  const { rows } = await query(`${SELECT_DECISION} WHERE d.application_id = $1 ORDER BY d.decided_at DESC, d.id`, [applicationId]);
  return rows;
}

// The open offer, locked, with "is the deadline already past (Lagos date)?" worked out by the database
async function lockPendingOffer(applicationId, client) {
  const { rows } = await client.query(
    `SELECT id, to_char(offer_deadline, 'YYYY-MM-DD') AS "offerDeadline",
            (offer_deadline < (now() AT TIME ZONE 'Africa/Lagos')::date) AS "isPast"
       FROM decisions WHERE application_id = $1 AND response = 'pending' FOR UPDATE`,
    [applicationId]
  );
  return rows[0] || null;
}

async function setOfferResponse(decisionId, response, client) {
  await client.query(`UPDATE decisions SET response = $2, responded_at = now() WHERE id = $1`, [decisionId, response]);
}

// ---------- reopening an application that expired unpaid ----------
// The most recent status change. A file that went submitted -> closed can only have been closed by the expiry job.
async function findLastTransition(applicationId, client) {
  const { rows } = await client.query(
    `SELECT from_status AS "from", to_status AS "to" FROM application_status_history
      WHERE application_id = $1 ORDER BY id DESC LIMIT 1`,
    [applicationId]
  );
  return rows[0] || null;
}

// Re-quoting (FR-017): the reopened application takes the fee that applies NOW
async function updateFeeSnapshot(applicationId, fee, client) {
  await client.query(
    `UPDATE applications SET fee_amount_minor = $2, fee_currency = $3, fee_rule_id = $4 WHERE id = $1`,
    [applicationId, fee.amountMinor, fee.currency, fee.ruleId]
  );
}

// ---------- timeline ----------
async function listTimelineForParent(applicationId) {
  const { rows } = await query(
    `SELECT to_status AS status, created_at AS "at", public_note AS note
       FROM application_status_history WHERE application_id = $1 ORDER BY id`,
    [applicationId]
  );
  return rows;
}

async function listHistoryForStaff(applicationId) {
  const { rows } = await query(
    `SELECT h.from_status AS "from", h.to_status AS "to", h.reason, h.public_note AS "publicNote",
            h.created_at AS "at", u.email AS "by"
       FROM application_status_history h LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.application_id = $1 ORDER BY h.id`,
    [applicationId]
  );
  return rows;
}

// ---------- staff detail ----------
async function findApplicationDetail(applicationId) {
  const { rows } = await query(
    `SELECT ap.id,
            ap.application_number AS "applicationNumber",
            ap.status, ap.applicant_id AS "applicantId", ap.cycle_id AS "cycleId",
            ap.campus_id AS "campusId", c.name AS "campusName",
            ap.category_id AS "categoryId", cat.name AS "categoryName",
            ap.program, ap.boarding,
            ap.heard_from AS "heardFrom", ap.heard_from_other AS "heardFromOther",
            to_char(ap.preferred_exam_date,'YYYY-MM-DD') AS "preferredExamDate",
            ap.preferred_exam_time AS "preferredExamTime",
            ap.preferred_exam_campus_id AS "preferredExamCampusId",
            ap.interview_availability AS "interviewAvailability",
            ap.consent_given_at AS "consentGivenAt", ap.consent_version AS "consentVersion",
            ap.submitted_at AS "submittedAt",
            ap.fee_amount_minor::float8 AS "feeAmountMinor", ap.fee_currency AS "feeCurrency",
            pay.paid::float8 AS "paidMinor",
            a.first_name AS "firstName", a.middle_name AS "middleName", a.surname,
            to_char(a.date_of_birth,'YYYY-MM-DD') AS "dateOfBirth", a.gender, a.nationality,
            a.place_of_birth AS "placeOfBirth", a.state_of_origin_id AS "stateOfOriginId",
            a.contact_phone AS "contactPhone", a.contact_email AS "contactEmail",
            a.address_line AS "addressLine", a.residence_state_id AS "residenceStateId"
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN campuses c ON c.id = ap.campus_id
       LEFT JOIN admission_categories cat ON cat.id = ap.category_id
       LEFT JOIN LATERAL (SELECT COALESCE(SUM(p.amount_minor), 0) AS paid FROM payments p
                           WHERE p.application_id = ap.id AND p.status = 'successful') pay ON true
      WHERE ap.id = $1 AND ap.status <> 'draft'`,
    [applicationId]
  );
  return rows[0] || null;
}

async function findOwnerAndStatus(applicationId) {
  const { rows } = await query(
    `SELECT ap.id, ap.status, a.parent_user_id AS "parentUserId"
       FROM applications ap JOIN applicants a ON a.id = ap.applicant_id WHERE ap.id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

module.exports = {
  findOwnerAndStatus,
  listApplications, lockApplication, insertDecision, listDecisions, lockPendingOffer, setOfferResponse,
  listTimelineForParent, listHistoryForStaff, findApplicationDetail,
  findLastTransition, updateFeeSnapshot,
};
