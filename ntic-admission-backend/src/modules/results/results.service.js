// src/modules/results/results.service.js
// Exam attendance, and the marks candidates score. Staff only; parents never see raw marks here.
//
// Lock order everywhere: application(s) -> exam(s) -> result. Same order as scheduling, so nothing can deadlock.

const repo = require('./results.repository');
const examService = require('../examinations/examinations.service');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const { parseCsv } = require('../../utils/csv');
const AppError = require('../../utils/AppError');
const {
  enterResultSchema, attendanceSchema, bulkAttendanceSchema, importQuerySchema, scoresArray,
} = require('./results.validation');

const inScope = (scope, campusId) => !scope || scope.includes(campusId);
const auditEvent = (context, action, resourceType, resourceId, metadata) => ({
  actor: context.actor, action, resourceType, resourceId, ip: context.ip, userAgent: context.userAgent, metadata,
});
const invalidState = (message, code = 'INVALID_STATE') => new AppError(message, 409, code);

const MAX_IMPORT_ROWS = 5000;
const MAX_IMPORT_CANDIDATES = 500;

// ---------- small helpers ----------
const byMarks = (a, b) => a.subject.localeCompare(b.subject);
const normalise = (scores) => [...scores].map((s) => ({ subject: s.subject, score: s.score, maxScore: s.maxScore })).sort(byMarks);
const sameScores = (a, b) => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
const snapshotOf = (scores, remarks) => ({ scores: normalise(scores), remarks: remarks || null });

function totalsOf(scores) {
  const score = Math.round(scores.reduce((sum, s) => sum + s.score, 0) * 100) / 100;
  const maxScore = Math.round(scores.reduce((sum, s) => sum + s.maxScore, 0) * 100) / 100;
  return { score, maxScore, percentage: maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : null };
}

// ===================== attendance =====================

// Marks one candidate as having sat the exam or not. The exam must have started.
// Marking someone who was already marked is a correction, and needs a reason.
async function setAttendance(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const data = validate(attendanceSchema, input);
  const scope = await getCampusScope(context.actor);
  const target = data.attended ? 'completed' : 'absent';

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');

    const exam = await repo.lockExamByApplication(applicationId, client);
    if (!exam || exam.status === 'cancelled') throw invalidState('There is no exam to mark for this application');

    if (exam.status === 'scheduled') {
      if (new Date(exam.startsAt) > new Date()) {
        throw invalidState('The exam has not started yet, so attendance cannot be marked', 'EXAM_NOT_STARTED');
      }
    } else {
      // Already marked: a correction
      if (exam.status === target) throw invalidState(`This candidate is already marked as ${data.attended ? 'attended' : 'absent'}`);
      if (!data.reason) throw AppError.validation([{ field: 'reason', message: 'A reason is required to change attendance that was already marked' }]);
      if (target === 'absent' && (await repo.resultExistsForExam(exam.id, client))) {
        throw invalidState('Marks have already been entered for this candidate, so they cannot be marked absent', 'RESULT_EXISTS');
      }
    }

    await repo.setExamStatus(exam.id, target, client);
    await repo.addExamHistory(
      { examId: exam.id, action: data.attended ? 'attended' : 'absent', slotId: exam.slotId, reason: data.reason, actorId: context.actor.id },
      client
    );
    await auditService.record(
      auditEvent(context, 'exam.attendance', 'examination', exam.id, {
        applicationNumber: application.applicationNumber, examNumber: exam.examNumber, attended: data.attended, reason: data.reason,
      }),
      { client }
    );
  });
  return examService.getExamForStaff(applicationId, context.actor);
}

async function requireSlotInScope(slotId, actor) {
  assertUuid(slotId, 'Slot id');
  const slot = await repo.findSlot(slotId);
  if (!slot || !inScope(await getCampusScope(actor), slot.campusId)) throw AppError.notFound('Exam slot not found');
  return slot;
}

// Everyone booked into a slot, for the invigilator's list
async function getRoster(slotId, actor) {
  const slot = await requireSlotInScope(slotId, actor);
  const candidates = await repo.listRoster(slotId);
  const counts = { total: candidates.length, scheduled: 0, completed: 0, absent: 0 };
  for (const c of candidates) counts[c.status] = (counts[c.status] || 0) + 1;
  return { slot, counts, candidates };
}

// Marks a whole slot at once, by exam number. All or nothing: if any line is wrong, nothing is saved.
async function bulkAttendance(slotId, input, context) {
  const data = validate(bulkAttendanceSchema, input);
  const slot = await requireSlotInScope(slotId, context.actor);
  if (new Date(slot.startsAt) > new Date()) {
    throw invalidState('This exam slot has not started yet, so attendance cannot be marked', 'EXAM_NOT_STARTED');
  }

  const marks = data.marks.map((m) => ({ ...m, examNumber: m.examNumber.toUpperCase() }));
  const seen = new Set();
  const errors = [];
  marks.forEach((m, i) => {
    if (seen.has(m.examNumber)) errors.push({ field: `marks.${i}`, message: `${m.examNumber} appears more than once` });
    seen.add(m.examNumber);
  });
  if (errors.length) throw AppError.validation(errors);

  const counts = await withTransaction(async (client) => {
    const numbers = marks.map((m) => m.examNumber);
    const found = await repo.findExamsInSlot(slotId, numbers, client);
    await repo.lockApplications([...new Set(found.map((e) => e.applicationId))], client);
    const locked = await repo.lockExamsByIds(found.map((e) => e.id), client);
    const byNumber = new Map(locked.map((e) => [e.examNumber, e]));

    marks.forEach((m, i) => {
      const exam = byNumber.get(m.examNumber);
      // Re-checked under the lock: someone may have moved this candidate while we were reading
      if (!exam || exam.slotId !== slotId) {
        errors.push({ field: `marks.${i}`, message: `${m.examNumber} is not booked in this slot` });
      } else if (exam.status !== 'scheduled') {
        errors.push({ field: `marks.${i}`, message: `${m.examNumber} is already marked (${exam.status}). Correct it individually, with a reason` });
      }
    });
    if (errors.length) throw AppError.validation(errors);

    for (const m of marks) {
      const exam = byNumber.get(m.examNumber);
      await repo.setExamStatus(exam.id, m.attended ? 'completed' : 'absent', client);
      await repo.addExamHistory(
        { examId: exam.id, action: m.attended ? 'attended' : 'absent', slotId, reason: 'Slot attendance sheet', actorId: context.actor.id },
        client
      );
      await auditService.record(
        auditEvent(context, 'exam.attendance', 'examination', exam.id, { examNumber: exam.examNumber, attended: m.attended, via: 'bulk' }),
        { client }
      );
    }
    return { marked: marks.length, attended: marks.filter((m) => m.attended).length, absent: marks.filter((m) => !m.attended).length };
  });
  return { slotId, ...counts };
}

// ===================== results =====================

async function presentResult(applicationId, basics, exam) {
  const base = {
    applicationId, applicationNumber: basics.applicationNumber,
    candidate: `${basics.firstName} ${basics.surname}`,
    examNumber: exam ? exam.examNumber : null, examStatus: exam ? exam.status : 'not_scheduled',
  };
  const result = exam ? await repo.findResultByExam(exam.id) : null;
  if (!result) return { ...base, status: 'not_entered' };
  const scores = await repo.listScores(result.id);
  const { enteredById, reviewedById, examinationId, ...rest } = result;
  return { ...base, ...rest, scores, totals: totalsOf(scores), history: await repo.listResultHistory(result.id) };
}

async function staffContext(applicationId, actor) {
  assertUuid(applicationId, 'Application id');
  const basics = await repo.findApplicationBasics(applicationId);
  if (!basics || !inScope(await getCampusScope(actor), basics.campusId)) throw AppError.notFound('Application not found');
  return basics;
}

async function getResult(applicationId, actor) {
  const basics = await staffContext(applicationId, actor);
  const exam = await examService.getExamForStaff(applicationId, actor);
  return presentResult(applicationId, basics, exam.status === 'not_scheduled' ? null : exam);
}

// Enters or changes a candidate's marks. Always saved as a draft until a second person reviews it.
async function enterResult(applicationId, input, context) {
  assertUuid(applicationId, 'Application id');
  const data = validate(enterResultSchema, input);
  const scope = await getCampusScope(context.actor);

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');

    const exam = await repo.lockExamByApplication(applicationId, client);
    if (!exam || exam.status !== 'completed') {
      throw invalidState('Marks can only be entered for a candidate who is marked as having attended the exam', 'NOT_ATTENDED');
    }

    const existing = await repo.lockResultByExam(exam.id, client);
    let resultId;
    if (!existing) {
      resultId = await repo.insertResult({ examId: exam.id, remarks: data.remarks, actorId: context.actor.id }, client);
      await repo.replaceScores(resultId, data.scores, client);
      await repo.addResultHistory({ resultId, action: 'recorded', snapshot: snapshotOf(data.scores, data.remarks), reason: data.reason, actorId: context.actor.id }, client);
      await auditService.record(
        auditEvent(context, 'exam_result.record', 'exam_result', resultId, { applicationNumber: application.applicationNumber, examNumber: exam.examNumber }),
        { client }
      );
      return;
    }

    resultId = existing.id;
    const currentScores = await repo.listScores(resultId, client);
    if (sameScores(currentScores, data.scores) && (existing.remarks || null) === (data.remarks || null)) {
      throw invalidState('Nothing has changed: these are the same marks that are already saved');
    }
    if (existing.status === 'reviewed' && !data.reason) {
      throw AppError.validation([{ field: 'reason', message: 'A reason is required to change marks that were already reviewed' }]);
    }
    await repo.resetToDraft({ resultId, remarks: data.remarks, actorId: context.actor.id }, client);
    await repo.replaceScores(resultId, data.scores, client);
    await repo.addResultHistory({ resultId, action: 'changed', snapshot: snapshotOf(data.scores, data.remarks), reason: data.reason, actorId: context.actor.id }, client);
    await auditService.record(
      auditEvent(context, 'exam_result.change', 'exam_result', resultId, {
        applicationNumber: application.applicationNumber, examNumber: exam.examNumber, previousStatus: existing.status, reason: data.reason,
      }),
      { client }
    );
  });
  return getResult(applicationId, context.actor);
}

// A second person confirms the marks were entered correctly
async function reviewResult(applicationId, context) {
  assertUuid(applicationId, 'Application id');
  const scope = await getCampusScope(context.actor);

  await withTransaction(async (client) => {
    const application = await repo.lockApplication(applicationId, client);
    if (!application || !inScope(scope, application.campusId)) throw AppError.notFound('Application not found');

    const exam = await repo.lockExamByApplication(applicationId, client);
    const result = exam && (await repo.lockResultByExam(exam.id, client));
    if (!result) throw invalidState('There are no marks to review for this candidate', 'NO_RESULT');
    if (result.status === 'reviewed') throw invalidState('These marks have already been reviewed');
    if (result.enteredById === context.actor.id) {
      throw new AppError('Marks must be reviewed by someone other than the person who entered them', 403, 'FORBIDDEN');
    }

    await repo.markReviewed({ resultId: result.id, reviewerId: context.actor.id }, client);
    const scores = await repo.listScores(result.id, client);
    await repo.addResultHistory({ resultId: result.id, action: 'reviewed', snapshot: snapshotOf(scores, result.remarks), actorId: context.actor.id }, client);
    await auditService.record(
      auditEvent(context, 'exam_result.review', 'exam_result', result.id, { applicationNumber: application.applicationNumber, examNumber: exam.examNumber }),
      { client }
    );
  });
  return getResult(applicationId, context.actor);
}

// ===================== CSV import =====================

const REQUIRED_COLUMNS = ['examnumber', 'subject', 'score', 'maxscore'];
const NUMBER_PATTERN = /^\d+(\.\d+)?$/;

// Turns the file into { examNumber -> [{row, subject, score, maxScore}] }, or a list of problems
function readImportFile(file) {
  const problems = [];
  if (file.buffer.includes(0)) {
    throw AppError.validation([{ field: 'file', message: 'This does not look like a CSV file. In Excel, use Save As, then "CSV (Comma delimited)"' }]);
  }
  let rows;
  try { rows = parseCsv(file.buffer.toString('utf8')); } catch (err) {
    throw AppError.validation([{ field: 'file', message: err.message }]);
  }
  if (rows.length < 2) throw AppError.validation([{ field: 'file', message: 'The file has no data rows' }]);

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  const extra = header.filter((c) => !REQUIRED_COLUMNS.includes(c));
  if (missing.length || extra.length || new Set(header).size !== header.length) {
    throw AppError.validation([{
      field: 'file',
      message: 'The first row must contain exactly these columns: examNumber, subject, score, maxScore',
    }]);
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw AppError.validation([{ field: 'file', message: `The file has more than ${MAX_IMPORT_ROWS} rows` }]);
  }
  const col = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)]));

  const groups = new Map();
  rows.slice(1).forEach((cells, i) => {
    const row = i + 1; // the Nth data row (the header is not counted)
    const examNumber = (cells[col.examnumber] || '').trim().toUpperCase();
    const scoreText = (cells[col.score] || '').trim();
    const maxText = (cells[col.maxscore] || '').trim();
    if (!examNumber) { problems.push({ field: `row ${row}`, message: 'examNumber is empty' }); return; }
    if (!NUMBER_PATTERN.test(scoreText)) { problems.push({ field: `row ${row}`, message: `${examNumber}: score "${scoreText}" is not a number` }); return; }
    if (!NUMBER_PATTERN.test(maxText)) { problems.push({ field: `row ${row}`, message: `${examNumber}: maxScore "${maxText}" is not a number` }); return; }
    if (!groups.has(examNumber)) groups.set(examNumber, []);
    groups.get(examNumber).push({ row, subject: cells[col.subject] || '', score: Number(scoreText), maxScore: Number(maxText) });
  });

  // The same rules as typing marks in one at a time
  for (const [examNumber, lines] of groups) {
    const parsed = scoresArray.safeParse(lines.map(({ subject, score, maxScore }) => ({ subject, score, maxScore })));
    if (parsed.success) { groups.set(examNumber, lines.map((l, i) => ({ ...l, ...parsed.data[i] }))); continue; }
    for (const issue of parsed.error.issues) {
      const row = typeof issue.path[0] === 'number' ? lines[issue.path[0]].row : lines[0].row;
      problems.push({ field: `row ${row}`, message: `${examNumber}: ${issue.message}` });
    }
  }
  if (groups.size > MAX_IMPORT_CANDIDATES) {
    throw AppError.validation([{ field: 'file', message: `The file covers more than ${MAX_IMPORT_CANDIDATES} candidates. Split it into smaller files` }]);
  }
  return { groups, problems };
}

// Checks the whole file, and (unless it is a dry run) saves every candidate's marks as a draft.
// All or nothing. ?dryRun=true only checks and reports.
async function importResults(file, query, context) {
  const { dryRun } = validate(importQuerySchema, query || {});
  const isDryRun = dryRun === 'true';
  const { groups, problems } = readImportFile(file);
  const scope = await getCampusScope(context.actor);
  const numbers = [...groups.keys()];
  const firstRowOf = (n) => groups.get(n)[0].row;

  const outcome = await withTransaction(async (client) => {
    const errors = [...problems];
    let exams = await repo.findExamsByNumbers(numbers, client);
    if (!isDryRun) {
      // Lock the people involved, then read again: what we check is what we write
      await repo.lockApplications([...new Set(exams.map((e) => e.applicationId))], client);
      await repo.lockExamsByIds(exams.map((e) => e.id), client);
      exams = await repo.findExamsByNumbers(numbers, client);
    }
    const byNumber = new Map(exams.map((e) => [e.examNumber, e]));
    const plan = [];

    for (const n of numbers) {
      const exam = byNumber.get(n);
      // A candidate outside the officer's campuses is reported exactly like one that does not exist
      if (!exam || !inScope(scope, exam.campusId)) { errors.push({ field: `row ${firstRowOf(n)}`, message: `${n}: exam number not found` }); continue; }
      if (exam.status !== 'completed') {
        errors.push({ field: `row ${firstRowOf(n)}`, message: `${n}: not marked as attended (status: ${exam.status})` });
        continue;
      }
      const existing = isDryRun ? await repo.findResultByExam(exam.id, client) : await repo.lockResultByExam(exam.id, client);
      if (existing && existing.status === 'reviewed') {
        errors.push({ field: `row ${firstRowOf(n)}`, message: `${n}: marks were already reviewed. Change them one candidate at a time, with a reason` });
        continue;
      }
      const scores = groups.get(n).map(({ subject, score, maxScore }) => ({ subject, score, maxScore }));
      let kind = 'create';
      if (existing) {
        kind = sameScores(await repo.listScores(existing.id, client), scores) ? 'unchanged' : 'update';
      }
      plan.push({ exam, existing, scores, kind });
    }

    errors.sort((a, b) => Number(a.field.slice(4)) - Number(b.field.slice(4)));
    const summary = {
      candidates: numbers.length,
      created: plan.filter((p) => p.kind === 'create').length,
      updated: plan.filter((p) => p.kind === 'update').length,
      unchanged: plan.filter((p) => p.kind === 'unchanged').length,
    };
    if (errors.length) return { errors, summary };
    if (isDryRun) return { errors, summary };

    for (const { exam, existing, scores, kind } of plan) {
      if (kind === 'unchanged') continue;
      let resultId;
      if (kind === 'create') {
        resultId = await repo.insertResult({ examId: exam.id, actorId: context.actor.id }, client);
      } else {
        resultId = existing.id;
        await repo.resetToDraft({ resultId, remarks: existing.remarks, actorId: context.actor.id }, client);
      }
      await repo.replaceScores(resultId, scores, client);
      await repo.addResultHistory(
        { resultId, action: kind === 'create' ? 'recorded' : 'changed', snapshot: snapshotOf(scores, existing && existing.remarks), reason: 'CSV import', actorId: context.actor.id },
        client
      );
      await auditService.record(
        auditEvent(context, kind === 'create' ? 'exam_result.record' : 'exam_result.change', 'exam_result', resultId, { examNumber: exam.examNumber, via: 'csv' }),
        { client }
      );
    }
    return { errors, summary };
  });

  const valid = outcome.errors.length === 0;
  if (!valid && !isDryRun) {
    throw AppError.validation(outcome.errors.slice(0, 100), `Nothing was saved. ${outcome.errors.length} problem(s) found in the file`);
  }
  return { dryRun: isDryRun, valid, summary: outcome.summary, errors: outcome.errors.slice(0, 100), saved: valid && !isDryRun };
}

module.exports = { setAttendance, getRoster, bulkAttendance, getResult, enterResult, reviewResult, importResults };
