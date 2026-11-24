// src/modules/reports/reports.service.js
// The admin dashboard numbers, and CSV / Excel exports.
//
// Rules that apply to everything here:
//   - Campus scope is applied inside the SQL, so a campus officer never receives a number or a row from another campus.
//   - Money is shown in naira with 2 decimals (the database holds kobo).
//   - Dates and times are shown in Lagos time.
//   - Every export is written to the audit log BEFORE the file is handed over, because an export is a copy of personal data.

const crypto = require('crypto');
const ExcelJS = require('exceljs');
const repo = require('./reports.repository');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { getCampusScope } = require('../../utils/campusScope');
const { toCsv } = require('../../utils/csv');
const { formatMajor } = require('../../utils/money');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');
const { LIVE_STATUSES } = require('../../constants/applicationStatus');
const { dashboardSchema, exportSchema } = require('./reports.validation');

const MONEY_ROLES = [ROLES.CENTRAL_ADMIN, ROLES.FINANCE_OFFICER];
const maxRows = () => Number(process.env.EXPORT_MAX_ROWS) || 20000;
const naira = (minor) => formatMajor(minor);
const nameOf = (...parts) => parts.filter(Boolean).join(' ');
// Subjects are stored as slugs such as general_studies; the sheet shows "General studies"
const prettySubject = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ');

// ---------------------------------------------------------------- time helpers (Lagos)

const partsOf = (value) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(value)).map((p) => [p.type, p.value])
);
const lagosDate = (value) => { const p = partsOf(value); return `${p.year}-${p.month}-${p.day}`; };
const lagosStamp = (value) => (value ? `${lagosDate(value)} ${partsOf(value).hour}:${partsOf(value).minute}` : '');

function lastDays(count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(lagosDate(Date.now() - i * 864e5));
  return out;
}

// ---------------------------------------------------------------- dashboard

async function resolveFilters(f, actor) {
  const campusScope = await getCampusScope(actor);
  // asking about a campus outside your scope looks the same as a campus that does not exist
  if (f.campusId && campusScope && !campusScope.includes(f.campusId)) throw AppError.notFound('Campus not found');
  return campusScope;
}

async function getDashboard(query, actor) {
  const f = validate(dashboardSchema, query);
  const campusScope = await resolveFilters(f, actor);
  const cycle = await repo.findCycle(f.cycleId);
  if (!cycle) {
    if (f.cycleId) throw AppError.notFound('Admission cycle not found');
    return { cycle: null, message: 'There is no admission cycle yet' };
  }
  const filters = { cycleId: cycle.id, campusScope, campusId: f.campusId };
  const money = MONEY_ROLES.includes(actor.role);

  const [statuses, byCampus, byCategory, daily, funnel, offers, seats, interviews, resultsDraft, totals, owing, claims, attempts] = await Promise.all([
    repo.statusCounts(filters), repo.groupedCounts(filters, 'campus'), repo.groupedCounts(filters, 'category'), repo.dailySubmissions(filters, 30),
    repo.funnel(filters), repo.offerResponses(filters), repo.examSeats(filters), repo.interviewCounts(filters), repo.resultsAwaitingReview(filters),
    money ? repo.paymentTotals(filters) : null, money ? repo.outstanding(filters, LIVE_STATUSES) : null,
    money ? repo.pendingClaims(filters) : null, money ? repo.attemptsNeedingReview(filters) : null,
  ]);

  const byStatus = Object.fromEntries(['draft', 'submitted', 'under_review', 'information_required', 'decision_pending', 'offered', 'waitlisted', 'rejected', 'withdrawn', 'closed'].map((s) => [s, 0]));
  for (const r of statuses) byStatus[r.status] = r.count;
  const drafts = byStatus.draft;
  delete byStatus.draft;

  const dailyMap = Object.fromEntries(daily.map((d) => [d.date, d.count]));
  const interviewBy = Object.fromEntries(interviews.map((r) => [r.status, r]));
  const offerBy = Object.fromEntries(offers.map((r) => [r.response, r.count]));

  const result = {
    cycle: { id: cycle.id, academicSession: cycle.academicSession, status: cycle.status },
    campusId: f.campusId || null,
    applications: {
      submitted: funnel.submitted,
      drafts,
      byStatus,
      byCampus,
      byCategory,
      submittedPerDay: lastDays(30).map((date) => ({ date, count: dailyMap[date] || 0 })),
    },
    funnel: [
      ['submitted', 'Submitted'], ['paid', 'Fee paid'], ['examBooked', 'Exam booked'], ['examSat', 'Sat the exam'], ['resultsReviewed', 'Results reviewed'],
      ['interviewed', 'Interviewed'], ['decided', 'Decision made'], ['offered', 'Offered a place'], ['accepted', 'Accepted the offer'],
    ].map(([key, label]) => ({ key, label, count: funnel[key] })),
    exams: { upcomingSlots: seats.slots, upcomingSeats: seats.seats, upcomingBooked: seats.booked, upcomingFree: Math.max(seats.seats - seats.booked, 0) },
    interviews: {
      scheduled: (interviewBy.scheduled || {}).count || 0,
      upcoming: (interviewBy.scheduled || {}).upcoming || 0,
      awaitingOutcome: (interviewBy.scheduled || {}).overdue || 0,
      completed: (interviewBy.completed || {}).count || 0,
      absent: (interviewBy.absent || {}).count || 0,
      cancelled: (interviewBy.cancelled || {}).count || 0,
    },
    offers: { pending: offerBy.pending || 0, accepted: offerBy.accepted || 0, declined: offerBy.declined || 0, expired: offerBy.expired || 0 },
    needsAttention: {
      informationRequested: byStatus.information_required,
      awaitingDecision: byStatus.decision_pending,
      resultsAwaitingReview: resultsDraft,
      interviewsAwaitingOutcome: (interviewBy.scheduled || {}).overdue || 0,
    },
    generatedAt: new Date().toISOString(),
  };

  if (money) {
    const sum = (rows, pick) => rows.filter(pick).reduce((s, r) => s + r.amountMinor, 0);
    const count = (rows, pick) => rows.filter(pick).reduce((s, r) => s + r.count, 0);
    const received = (r) => r.status === 'successful' && r.method !== 'waiver';
    const methods = {};
    for (const r of totals.filter(received)) methods[r.method] = { count: r.count, amount: naira(r.amountMinor) };
    result.payments = {
      currency: 'NGN',
      collected: naira(sum(totals, received)),
      paymentCount: count(totals, received),
      byMethod: methods,
      waived: naira(sum(totals, (r) => r.status === 'successful' && r.method === 'waiver')),
      reversed: naira(sum(totals, (r) => r.status === 'reversed')),
      reversedCount: count(totals, (r) => r.status === 'reversed'),
      stillOwed: naira(owing.amountMinor),
      applicationsWithBalance: owing.applications,
    };
    result.needsAttention.bankTransfersToConfirm = claims;
    result.needsAttention.onlinePaymentsToReview = attempts;
  }
  return result;
}

// ---------------------------------------------------------------- exports

// Each dataset says how to fetch, and how to turn the rows into a table: { columns: [{ header, type, width }], data: [[...]] }
const text = (header, width = 16) => ({ header, type: 'text', width });
const amount = (header) => ({ header, type: 'money', width: 14 });
const whole = (header, width = 12) => ({ header, type: 'number', width });

const DATASETS = {
  applications: {
    roles: [ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER],
    fetch: repo.exportApplications,
    table: (rows) => ({
      columns: [
        text('Application number', 20), text('Status', 20), text('Submitted', 18), text('Session', 11), text('Campus', 16), text('Category', 16), text('Boarding', 10),
        text('Candidate', 28), text('Gender', 9), text('Date of birth', 13), text('Nationality', 13),
        text('Parent', 24), text('Parent email', 28), text('Contact phone', 15), text('Contact email', 28),
        amount('Fee (NGN)'), amount('Paid (NGN)'), amount('Balance (NGN)'),
        text('Exam number', 14), text('Exam status', 12), text('Exam date', 18), text('Result status', 12),
        text('Interview status', 14), text('Interview date', 18), text('Decision', 12), text('Offer response', 14), text('Offer deadline', 14),
      ],
      data: rows.map((r) => [
        r.applicationNumber, r.status, lagosStamp(r.submittedAt), r.academicSession, r.campus, r.category, r.boarding,
        nameOf(r.firstName, r.middleName, r.surname), r.gender, r.dateOfBirth, r.nationality,
        nameOf(r.parentFirstName, r.parentLastName), r.parentEmail, r.contactPhone, r.contactEmail,
        r.feeMinor, r.paidMinor, Math.max(r.feeMinor - r.paidMinor, 0),
        r.examNumber, r.examStatus, lagosStamp(r.examAt), r.resultStatus,
        r.interviewStatus, lagosStamp(r.interviewAt), r.decision, r.offerResponse, r.offerDeadline,
      ]),
    }),
  },
  payments: {
    roles: [ROLES.CENTRAL_ADMIN, ROLES.FINANCE_OFFICER],
    fetch: repo.exportPayments,
    table: (rows) => ({
      columns: [
        text('Receipt number', 18), text('Paid at', 18), text('Application number', 20), text('Candidate', 28), text('Campus', 16),
        text('Method', 14), text('Provider', 12), text('Bank / payment reference', 26), amount('Amount (NGN)'), text('Currency', 9),
        text('Status', 12), text('Reversed at', 18), text('Note', 30), text('Recorded by', 26),
      ],
      data: rows.map((r) => [
        r.receiptNumber, lagosStamp(r.paidAt), r.applicationNumber, nameOf(r.firstName, r.middleName, r.surname), r.campus,
        r.method, r.provider, r.bankReference, r.amountMinor, r.currency,
        r.status, lagosStamp(r.reversedAt), r.note, nameOf(r.recorderFirstName, r.recorderLastName) || r.recorderEmail,
      ]),
    }),
  },
  'exam-results': {
    roles: [ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.REVIEWER],
    fetch: repo.exportExamResults,
    table: (rows) => {
      const subjects = [...new Set(rows.flatMap((r) => Object.keys(r.scores)))].sort();
      return {
        columns: [
          text('Application number', 20), text('Candidate', 28), text('Campus', 16), text('Category', 16), text('Exam number', 14), text('Exam date', 18),
          ...subjects.map((s) => whole(prettySubject(s), Math.max(10, s.length + 2))),
          whole('Total'), whole('Out of'), text('Result status', 12), text('Reviewed at', 18), text('Remarks', 30),
        ],
        data: rows.map((r) => [
          r.applicationNumber, nameOf(r.firstName, r.middleName, r.surname), r.campus, r.category, r.examNumber, lagosStamp(r.examAt),
          ...subjects.map((s) => (r.scores[s] === undefined ? null : r.scores[s])),
          r.total, r.maxTotal, r.resultStatus, lagosStamp(r.reviewedAt), r.remarks,
        ]),
      };
    },
  },
};

function asCsv({ columns, data }) {
  const money = columns.map((c) => c.type === 'money');
  const body = data.map((row) => row.map((v, i) => (money[i] && typeof v === 'number' ? naira(v) : v)));
  return Buffer.from(`﻿${toCsv([columns.map((c) => c.header), ...body])}`, 'utf8'); // the BOM makes Excel read accents correctly
}

async function asXlsx(title, { columns, data }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NTIC Admission System';
  wb.created = new Date();
  const ws = wb.addWorksheet(title);
  ws.columns = columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const row of data) {
    const added = ws.addRow(row.map((v, i) => {
      if (v === null || v === undefined || v === '') return null;
      if (columns[i].type === 'money') return Number(naira(v)); // a real number, so Excel can add the column up
      if (columns[i].type === 'number') return Number(v);
      return String(v); // always a text cell: a name starting with "=" is shown as text and is never run as a formula
    }));
    columns.forEach((c, i) => { if (c.type === 'money') added.getCell(i + 1).numFmt = '#,##0.00'; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const FORMATS = {
  csv: { contentType: 'text/csv; charset=utf-8', build: (title, table) => asCsv(table) },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', build: asXlsx },
};

async function exportDataset(dataset, format, query, context) {
  const def = DATASETS[dataset];
  const fmt = FORMATS[format];
  if (!def || !fmt) throw AppError.notFound('Unknown export');
  const filters = validate(exportSchema(dataset), query);
  const campusScope = await resolveFilters(filters, context.actor);

  const limit = maxRows();
  const rows = await def.fetch({ ...filters, campusScope, limit });
  if (rows.length > limit) {
    throw new AppError(`This export has more than ${limit} rows. Narrow it with cycleId, campusId, status, from and to`, 422, 'TOO_MANY_ROWS');
  }

  await withTransaction((client) => auditService.record({
    actor: context.actor, action: `export.${dataset}`, resourceType: 'export', resourceId: crypto.randomUUID(),
    ip: context.ip, userAgent: context.userAgent,
    metadata: { format, rowCount: rows.length, filters, campusScope: campusScope ? 'limited' : 'all' },
  }, { client }));

  const table = def.table(rows);
  const buffer = await fmt.build(dataset, table);
  return { filename: `ntic-${dataset}-${lagosDate(Date.now())}.${format}`, contentType: fmt.contentType, buffer, rowCount: rows.length };
}

module.exports = { getDashboard, exportDataset, DATASETS };
