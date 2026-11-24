// src/modules/reports/reports.repository.js
// Read-only SQL for the dashboard and the exports. Nothing here changes data.
// Every query takes the campus scope (null = all campuses) and an optional single campus, and applies them in the database,
// so a user never receives a number or a row from a campus they may not see.

const { query } = require('../../db/pool');

// Builds "AND <column> = ANY($n)" style filters while collecting the parameters in order
function filterBuilder(params) {
  return {
    scope(column, campusScope) {
      if (!campusScope) return '';
      params.push(campusScope);
      return ` AND ${column} = ANY($${params.length}::uuid[])`;
    },
    equals(column, value, cast = '') {
      if (value === undefined || value === null) return '';
      params.push(value);
      return ` AND ${column} = $${params.length}${cast}`;
    },
    // Calendar days in Lagos time, both ends included
    days(column, from, to) {
      let sql = '';
      if (from) { params.push(from); sql += ` AND (${column} AT TIME ZONE 'Africa/Lagos')::date >= $${params.length}::date`; }
      if (to) { params.push(to); sql += ` AND (${column} AT TIME ZONE 'Africa/Lagos')::date <= $${params.length}::date`; }
      return sql;
    },
  };
}

// ---------------------------------------------------------------- dashboard

async function findCycle(cycleId) {
  if (cycleId) {
    const { rows } = await query(`SELECT id, academic_session AS "academicSession", status FROM admission_cycles WHERE id = $1`, [cycleId]);
    return rows[0] || null;
  }
  const { rows } = await query(
    `SELECT id, academic_session AS "academicSession", status FROM admission_cycles
      ORDER BY (status = 'active') DESC, opens_at DESC NULLS LAST LIMIT 1`
  );
  return rows[0] || null;
}

// where-clause for "applications ap in this cycle, in this scope"
function appWhere(params, { cycleId, campusScope, campusId }) {
  params.push(cycleId);
  const f = filterBuilder(params);
  return `ap.cycle_id = $1${f.scope('ap.campus_id', campusScope)}${f.equals('ap.campus_id', campusId, '::uuid')}`;
}

async function statusCounts(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(`SELECT ap.status, count(*)::int AS count FROM applications ap WHERE ${where} GROUP BY ap.status`, params);
  return rows;
}

async function groupedCounts(filters, kind) {
  const params = [];
  const where = appWhere(params, filters);
  const join = kind === 'campus'
    ? 'JOIN campuses g ON g.id = ap.campus_id'
    : 'JOIN admission_categories g ON g.id = ap.category_id';
  const { rows } = await query(
    `SELECT g.id, g.name, count(*)::int AS count FROM applications ap ${join}
      WHERE ${where} AND ap.status <> 'draft' GROUP BY g.id, g.name ORDER BY count(*) DESC, g.name`,
    params
  );
  return rows;
}

async function dailySubmissions(filters, days) {
  const params = [];
  const where = appWhere(params, filters);
  params.push(days);
  const { rows } = await query(
    `SELECT to_char((ap.submitted_at AT TIME ZONE 'Africa/Lagos')::date, 'YYYY-MM-DD') AS date, count(*)::int AS count
       FROM applications ap
      WHERE ${where} AND ap.submitted_at >= now() - make_interval(days => $${params.length}::int)
      GROUP BY 1 ORDER BY 1`,
    params
  );
  return rows;
}

async function funnel(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const has = (sql) => `EXISTS (${sql})`;
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE ap.status <> 'draft')::int AS submitted,
       count(*) FILTER (WHERE ap.status <> 'draft' AND ${has(`SELECT 1 FROM payments p WHERE p.application_id = ap.id AND p.status = 'successful'`)})::int AS paid,
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM examinations e WHERE e.application_id = ap.id AND e.status IN ('scheduled','completed','absent')`)})::int AS "examBooked",
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM examinations e WHERE e.application_id = ap.id AND e.status = 'completed'`)})::int AS "examSat",
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM exam_results r JOIN examinations e ON e.id = r.examination_id WHERE e.application_id = ap.id AND r.status = 'reviewed'`)})::int AS "resultsReviewed",
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM interviews i WHERE i.application_id = ap.id AND i.status = 'completed'`)})::int AS interviewed,
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM decisions d WHERE d.application_id = ap.id`)})::int AS decided,
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM decisions d WHERE d.application_id = ap.id AND d.outcome = 'offered'`)})::int AS offered,
       count(*) FILTER (WHERE ${has(`SELECT 1 FROM decisions d WHERE d.application_id = ap.id AND d.response = 'accepted'`)})::int AS accepted
     FROM applications ap WHERE ${where}`,
    params
  );
  return rows[0];
}

async function offerResponses(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(
    `SELECT d.response, count(*)::int AS count FROM decisions d JOIN applications ap ON ap.id = d.application_id
      WHERE ${where} AND d.outcome = 'offered' GROUP BY d.response`,
    params
  );
  return rows;
}

async function examSeats({ cycleId, campusScope, campusId }) {
  const params = [cycleId];
  const f = filterBuilder(params);
  const { rows } = await query(
    `SELECT count(*)::int AS slots, COALESCE(sum(s.capacity), 0)::int AS seats, COALESCE(sum(b.booked), 0)::int AS booked
       FROM exam_slots s
       LEFT JOIN LATERAL (SELECT count(*) AS booked FROM examinations e WHERE e.slot_id = s.id AND e.status = 'scheduled') b ON true
      WHERE s.cycle_id = $1 AND s.status = 'open' AND s.starts_at > now()${f.scope('s.campus_id', campusScope)}${f.equals('s.campus_id', campusId, '::uuid')}`,
    params
  );
  return rows[0];
}

async function interviewCounts(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(
    `SELECT i.status, count(*)::int AS count,
            count(*) FILTER (WHERE i.status = 'scheduled' AND i.starts_at > now())::int AS upcoming,
            count(*) FILTER (WHERE i.status = 'scheduled' AND i.ends_at <= now())::int AS overdue
       FROM interviews i JOIN applications ap ON ap.id = i.application_id
      WHERE ${where} GROUP BY i.status`,
    params
  );
  return rows;
}

async function resultsAwaitingReview(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM exam_results r JOIN examinations e ON e.id = r.examination_id JOIN applications ap ON ap.id = e.application_id
      WHERE ${where} AND r.status = 'draft'`,
    params
  );
  return rows[0].count;
}

async function paymentTotals(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(
    `SELECT p.method, p.status, count(*)::int AS count, COALESCE(sum(p.amount_minor), 0)::float8 AS "amountMinor"
       FROM payments p JOIN applications ap ON ap.id = p.application_id WHERE ${where} GROUP BY p.method, p.status`,
    params
  );
  return rows;
}

async function outstanding(filters, liveStatuses) {
  const params = [];
  const where = appWhere(params, filters);
  params.push(liveStatuses);
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE ap.fee_amount_minor > COALESCE(paid.total, 0))::int AS applications,
            COALESCE(sum(GREATEST(ap.fee_amount_minor - COALESCE(paid.total, 0), 0)), 0)::float8 AS "amountMinor"
       FROM applications ap
       LEFT JOIN LATERAL (SELECT sum(p.amount_minor) AS total FROM payments p WHERE p.application_id = ap.id AND p.status = 'successful') paid ON true
      WHERE ${where} AND ap.status = ANY($${params.length}::text[])`,
    params
  );
  return rows[0];
}

async function pendingClaims(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM payment_claims c JOIN applications ap ON ap.id = c.application_id WHERE ${where} AND c.status = 'pending'`,
    params
  );
  return rows[0].count;
}

async function attemptsNeedingReview(filters) {
  const params = [];
  const where = appWhere(params, filters);
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM payment_attempts t JOIN applications ap ON ap.id = t.application_id WHERE ${where} AND t.status = 'needs_review'`,
    params
  );
  return rows[0].count;
}

// ---------------------------------------------------------------- exports

// Returns up to limit + 1 rows so the caller can tell "too many" without counting separately
async function exportApplications({ cycleId, campusId, status, from, to, campusScope, limit }) {
  const params = [];
  const f = filterBuilder(params);
  const where = `ap.status <> 'draft'${f.scope('ap.campus_id', campusScope)}${f.equals('ap.campus_id', campusId, '::uuid')}${f.equals('ap.cycle_id', cycleId, '::uuid')}${f.equals('ap.status', status)}${f.days('ap.submitted_at', from, to)}`;
  params.push(limit + 1);
  const { rows } = await query(
    `SELECT ap.application_number AS "applicationNumber", ap.status, ap.submitted_at AS "submittedAt", cy.academic_session AS "academicSession",
            campus.name AS campus, cat.name AS category, ap.boarding,
            a.first_name AS "firstName", a.middle_name AS "middleName", a.surname, a.gender, to_char(a.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth", a.nationality,
            pu.first_name AS "parentFirstName", pu.last_name AS "parentLastName", pu.email AS "parentEmail",
            a.contact_phone AS "contactPhone", a.contact_email AS "contactEmail",
            ap.fee_amount_minor::float8 AS "feeMinor", ap.fee_currency AS currency, COALESCE(paid.total, 0)::float8 AS "paidMinor",
            e.exam_number AS "examNumber", e.status AS "examStatus", s.starts_at AS "examAt", r.status AS "resultStatus",
            iv.status AS "interviewStatus", iv.starts_at AS "interviewAt",
            d.outcome AS decision, d.response AS "offerResponse", to_char(d.offer_deadline, 'YYYY-MM-DD') AS "offerDeadline"
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN users pu ON pu.id = a.parent_user_id
       LEFT JOIN campuses campus ON campus.id = ap.campus_id
       LEFT JOIN admission_categories cat ON cat.id = ap.category_id
       LEFT JOIN admission_cycles cy ON cy.id = ap.cycle_id
       LEFT JOIN LATERAL (SELECT sum(p.amount_minor) AS total FROM payments p WHERE p.application_id = ap.id AND p.status = 'successful') paid ON true
       LEFT JOIN examinations e ON e.application_id = ap.id
       LEFT JOIN exam_slots s ON s.id = e.slot_id
       LEFT JOIN exam_results r ON r.examination_id = e.id
       LEFT JOIN LATERAL (SELECT * FROM interviews x WHERE x.application_id = ap.id ORDER BY (x.status = 'cancelled'), x.created_at DESC LIMIT 1) iv ON true
       LEFT JOIN LATERAL (SELECT * FROM decisions x WHERE x.application_id = ap.id ORDER BY x.decided_at DESC, x.created_at DESC LIMIT 1) d ON true
      WHERE ${where}
      ORDER BY ap.submitted_at, ap.application_number
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function exportPayments({ cycleId, campusId, status, from, to, campusScope, limit }) {
  const params = [];
  const f = filterBuilder(params);
  const where = `TRUE${f.scope('ap.campus_id', campusScope)}${f.equals('ap.campus_id', campusId, '::uuid')}${f.equals('ap.cycle_id', cycleId, '::uuid')}${f.equals('p.status', status)}${f.days('p.paid_at', from, to)}`;
  params.push(limit + 1);
  const { rows } = await query(
    `SELECT p.receipt_number AS "receiptNumber", p.paid_at AS "paidAt", ap.application_number AS "applicationNumber",
            a.first_name AS "firstName", a.middle_name AS "middleName", a.surname,
            campus.name AS campus, p.method, p.provider, p.bank_reference AS "bankReference",
            p.amount_minor::float8 AS "amountMinor", p.currency, p.status, p.reversed_at AS "reversedAt", p.note,
            ru.first_name AS "recorderFirstName", ru.last_name AS "recorderLastName", ru.email AS "recorderEmail"
       FROM payments p
       JOIN applications ap ON ap.id = p.application_id
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN campuses campus ON campus.id = ap.campus_id
       LEFT JOIN users ru ON ru.id = p.recorded_by
      WHERE ${where}
      ORDER BY p.paid_at, p.receipt_number
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function exportExamResults({ cycleId, campusId, status, from, to, campusScope, limit }) {
  const params = [];
  const f = filterBuilder(params);
  const where = `TRUE${f.scope('ap.campus_id', campusScope)}${f.equals('ap.campus_id', campusId, '::uuid')}${f.equals('ap.cycle_id', cycleId, '::uuid')}${f.equals('r.status', status)}${f.days('s.starts_at', from, to)}`;
  params.push(limit + 1);
  const { rows } = await query(
    `SELECT r.id AS "resultId", ap.application_number AS "applicationNumber",
            a.first_name AS "firstName", a.middle_name AS "middleName", a.surname,
            campus.name AS campus, cat.name AS category, e.exam_number AS "examNumber", s.starts_at AS "examAt",
            r.status AS "resultStatus", r.remarks, r.reviewed_at AS "reviewedAt",
            COALESCE((SELECT json_object_agg(x.subject, x.score) FROM exam_result_scores x WHERE x.result_id = r.id), '{}'::json) AS scores,
            COALESCE((SELECT sum(x.score) FROM exam_result_scores x WHERE x.result_id = r.id), 0)::float8 AS total,
            COALESCE((SELECT sum(x.max_score) FROM exam_result_scores x WHERE x.result_id = r.id), 0)::float8 AS "maxTotal"
       FROM exam_results r
       JOIN examinations e ON e.id = r.examination_id
       JOIN applications ap ON ap.id = e.application_id
       JOIN applicants a ON a.id = ap.applicant_id
       LEFT JOIN exam_slots s ON s.id = e.slot_id
       LEFT JOIN campuses campus ON campus.id = ap.campus_id
       LEFT JOIN admission_categories cat ON cat.id = ap.category_id
      WHERE ${where}
      ORDER BY ap.application_number
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

module.exports = {
  findCycle, statusCounts, groupedCounts, dailySubmissions, funnel, offerResponses, examSeats, interviewCounts, resultsAwaitingReview,
  paymentTotals, outstanding, pendingClaims, attemptsNeedingReview,
  exportApplications, exportPayments, exportExamResults,
};
