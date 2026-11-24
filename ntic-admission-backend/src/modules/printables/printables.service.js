// src/modules/printables/printables.service.js
// PDF receipts, exam cards and offer letters, and the editable wording behind them.
//
// Who may download what:
//   a parent         only their own child's documents (anything else is "not found", never "forbidden")
//   staff            only for campuses in their scope (administrators: all)
// Every function returns { filename, buffer }; the controller sends it.

const repo = require('./printables.repository');
const pdf = require('./printables.pdf');
const { fill, paragraphs, lines, PLACEHOLDERS } = require('./printables.templates');
const { keySchema, saveSchema, previewSchema } = require('./printables.validation');
const auditService = require('../audit/audit.service');
const { withTransaction } = require('../../db/pool');
const { validate } = require('../../utils/validate');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const { formatMajor } = require('../../utils/money');
const AppError = require('../../utils/AppError');

const inScope = (scope, campusId) => !scope || scope.includes(campusId);

// ===================== small formatting helpers (everything is shown in Lagos time) =====================

const lagos = (value, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', ...options }).format(new Date(value));
const LONG_DATE = { day: 'numeric', month: 'long', year: 'numeric' };
const longDate = (v) => lagos(v, LONG_DATE);
const longDateWithDay = (v) => lagos(v, { weekday: 'long', ...LONG_DATE });
const clockTime = (v) => lagos(v, { hour: 'numeric', minute: '2-digit', hour12: true });
// A calendar date typed in the system ("2026-11-30") has no time zone: read it at midday so it can never slip to another day
const dateOnly = (ymd) => longDate(`${ymd}T12:00:00+01:00`);

function money(minor, currency = 'NGN') {
  const [whole, frac] = formatMajor(minor).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency === 'NGN' ? '₦' : `${currency} `}${grouped}.${frac}`;
}

function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ');
}

const fullName = (d) => [d.firstName, d.middleName, d.surname].filter(Boolean).join(' ');
const fileSafe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
const METHOD_LABELS = { cash: 'Cash', bank_transfer: 'Bank transfer', pos: 'POS', waiver: 'Fee waiver' };

async function letterheadLines() {
  const t = await repo.findTemplate('letterhead');
  return lines(t ? t.body : 'Nigerian Tulip International Colleges');
}

// ===================== receipts =====================

async function buildReceipt(payment) {
  const isWaiver = payment.method === 'waiver';
  const method = payment.method === 'online'
    ? `Online payment${payment.provider ? ` (${payment.provider.charAt(0).toUpperCase()}${payment.provider.slice(1)})` : ''}`
    : METHOD_LABELS[payment.method] || payment.method;
  const reference = ['bank_transfer', 'pos'].includes(payment.method) ? payment.bankReference : payment.method === 'online' ? payment.bankReference : null;
  const buffer = await pdf.renderReceipt({
    letterhead: await letterheadLines(),
    receiptNumber: payment.receiptNumber,
    isWaiver,
    voidedOn: payment.reversedAt ? longDate(payment.reversedAt) : null,
    candidate: fullName(payment),
    applicationNumber: payment.applicationNumber,
    campus: payment.campusName,
    category: payment.categoryName,
    session: payment.academicSession,
    paidOn: longDate(payment.paidAt),
    method,
    referenceLabel: payment.method === 'online' ? 'Payment reference' : 'Bank reference',
    reference,
    amount: money(payment.amountMinor, payment.currency),
    fee: money(payment.feeMinor, payment.feeCurrency),
    paidToDate: money(payment.paidTotalMinor, payment.feeCurrency),
    balance: money(Math.max(payment.feeMinor - payment.paidTotalMinor, 0), payment.feeCurrency),
    generatedOn: longDate(new Date()),
  });
  return { filename: `receipt-${fileSafe(payment.receiptNumber)}.pdf`, buffer };
}

async function receiptForParent(applicationId, paymentId, parent) {
  assertUuid(applicationId, 'Application id');
  assertUuid(paymentId, 'Payment id');
  const payment = await repo.findReceiptData(paymentId);
  if (!payment || payment.applicationId !== applicationId || payment.parentUserId !== parent.id) throw AppError.notFound('Payment not found');
  return buildReceipt(payment);
}

async function receiptForStaff(paymentId, actor) {
  assertUuid(paymentId, 'Payment id');
  const payment = await repo.findReceiptData(paymentId);
  if (!payment || !inScope(await getCampusScope(actor), payment.campusId)) throw AppError.notFound('Payment not found');
  return buildReceipt(payment);
}

// ===================== exam card =====================

async function examCardFor(applicationId, access) {
  assertUuid(applicationId, 'Application id');
  const d = await repo.findExamCardData(applicationId);
  if (!d) throw AppError.notFound('Application not found');
  if (access.parent ? d.parentUserId !== access.parent.id : !inScope(await getCampusScope(access.actor), d.campusId)) throw AppError.notFound('Application not found');
  if (!d.examNumber || d.examStatus !== 'scheduled' || !d.startsAt) {
    throw new AppError('There is no scheduled exam for this application, so there is no exam card to print', 409, 'NO_EXAM');
  }
  const instructions = await repo.findTemplate('exam_instructions');
  const buffer = await pdf.renderExamCard({
    letterhead: await letterheadLines(),
    examNumber: d.examNumber,
    candidate: fullName(d),
    applicationNumber: d.applicationNumber,
    dateOfBirth: d.dateOfBirth ? dateOnly(d.dateOfBirth) : '',
    category: d.categoryName,
    date: longDateWithDay(d.startsAt),
    time: clockTime(d.startsAt),
    duration: duration(d.durationMinutes),
    mode: d.mode === 'online' ? 'Online' : 'In person',
    venue: d.venue,
    campus: d.slotCampusName || d.campusName,
    instructions: lines(instructions ? instructions.body : ''),
    generatedOn: longDate(new Date()),
  });
  return { filename: `exam-card-${fileSafe(d.examNumber)}.pdf`, buffer };
}

const examCardForParent = (applicationId, parent) => examCardFor(applicationId, { parent });
const examCardForStaff = (applicationId, actor) => examCardFor(applicationId, { actor });

// ===================== offer letter =====================

function offerValues(d, issuedOnText) {
  return {
    parentName: [d.parentFirstName, d.parentLastName].filter(Boolean).join(' ') || 'Parent/Guardian',
    candidateName: fullName(d),
    applicationNumber: d.applicationNumber,
    campusName: d.campusName || '',
    categoryName: d.categoryName || '',
    academicSession: d.academicSession || '',
    offerDeadline: d.offerDeadline ? dateOnly(d.offerDeadline) : '',
    issueDate: issuedOnText,
  };
}

function composeLetter({ letterhead, template, values, reference }) {
  return {
    letterhead,
    issuedOn: values.issueDate,
    reference,
    title: fill(template.title, values).trim(),
    paragraphs: paragraphs(fill(template.body, values)),
    signatoryName: template.signatoryName || null,
    signatoryTitle: template.signatoryTitle || null,
  };
}

// The letter is written once, the first time anybody opens it, and then kept as it was. Editing the template later never changes
// a letter a parent has already seen. (An administrator can deliberately reset a still-pending letter: see resetOfferLetter.)
async function issuedOfferLetter(d, actor) {
  const existing = await repo.findIssued(d.decisionId, 'offer_letter');
  if (existing) return existing.content;

  const template = await repo.findTemplate('offer_letter');
  const content = composeLetter({
    letterhead: await letterheadLines(), template, values: offerValues(d, longDate(new Date())), reference: d.applicationNumber,
  });
  const created = await withTransaction(async (client) => {
    const id = await repo.insertIssued({ decisionId: d.decisionId, applicationId: d.id, kind: 'offer_letter', templateVersion: template.version, content, userId: actor.id }, client);
    if (id) {
      await auditService.record({
        actor, action: 'document.offer_letter_issue', resourceType: 'issued_letter', resourceId: id,
        metadata: { applicationNumber: d.applicationNumber, templateVersion: template.version },
      }, { client });
    }
    return Boolean(id);
  });
  if (created) return content;
  return (await repo.findIssued(d.decisionId, 'offer_letter')).content; // somebody else issued it a moment before us: use theirs
}

async function offerLetterFor(applicationId, access) {
  assertUuid(applicationId, 'Application id');
  const d = await repo.findOfferData(applicationId);
  if (!d) throw AppError.notFound('Application not found');
  if (access.parent ? d.parentUserId !== access.parent.id : !inScope(await getCampusScope(access.actor), d.campusId)) throw AppError.notFound('Application not found');
  if (!d.decisionId || d.outcome !== 'offered') throw new AppError('There is no offer for this application', 409, 'NO_OFFER');
  if (!['pending', 'accepted'].includes(d.response)) throw new AppError('This offer is no longer active, so there is no letter to print', 409, 'NO_OFFER');

  const content = await issuedOfferLetter(d, access.parent || access.actor);
  return { filename: `offer-letter-${fileSafe(d.applicationNumber)}.pdf`, buffer: await pdf.renderOfferLetter(content) };
}

const offerLetterForParent = (applicationId, parent) => offerLetterFor(applicationId, { parent });
const offerLetterForStaff = (applicationId, actor) => offerLetterFor(applicationId, { actor });

// Throws the stored letter away so the next download uses the CURRENT template. Only while the offer is still waiting for an answer:
// a letter the parent has accepted is a record and is left alone.
async function resetOfferLetter(applicationId, context) {
  assertUuid(applicationId, 'Application id');
  const d = await repo.findOfferData(applicationId);
  if (!d || !inScope(await getCampusScope(context.actor), d.campusId)) throw AppError.notFound('Application not found');
  if (!d.decisionId || d.outcome !== 'offered') throw new AppError('There is no offer for this application', 409, 'NO_OFFER');

  await withTransaction(async (client) => {
    const decision = await repo.lockDecision(d.decisionId, client); // the same lock the parent's accept/decline takes
    if (!decision || decision.response !== 'pending') throw new AppError('Only a letter whose offer is still waiting for an answer can be reset', 409, 'INVALID_STATE');
    if (!(await repo.deleteIssued(d.decisionId, 'offer_letter', client))) throw new AppError('This letter has not been opened yet, so there is nothing to reset', 409, 'INVALID_STATE');
    await auditService.record({
      actor: context.actor, action: 'document.offer_letter_reset', resourceType: 'application', resourceId: applicationId,
      ip: context.ip, userAgent: context.userAgent, metadata: { applicationNumber: d.applicationNumber },
    }, { client });
  });
  return { reset: true };
}

// ===================== editable wording =====================

const DESCRIPTIONS = {
  letterhead: 'The school name (first line) and address lines at the top of every PDF. At most 6 lines.',
  exam_instructions: 'The instructions printed on the exam card. One instruction per line.',
  offer_letter: 'The offer letter. Blank lines start a new paragraph. Placeholders are filled in for each candidate.',
};
const present = (t) => ({
  key: t.key, description: DESCRIPTIONS[t.key], title: t.title, body: t.body, signatoryName: t.signatoryName, signatoryTitle: t.signatoryTitle,
  version: t.version, updatedAt: t.updatedAt, placeholders: PLACEHOLDERS[t.key],
});

async function listTemplates() {
  return (await repo.listTemplates()).map(present);
}

async function getTemplate(key) {
  const k = validate(keySchema, key);
  const t = await repo.findTemplate(k);
  if (!t) throw AppError.notFound('Template not found');
  return present(t);
}

async function listVersions(key) {
  const k = validate(keySchema, key);
  const t = await repo.findTemplate(k);
  if (!t) throw AppError.notFound('Template not found');
  return (await repo.listVersions(t.id)).map(({ firstName, lastName, email, ...v }) => ({ ...v, savedBy: [firstName, lastName].filter(Boolean).join(' ') || email || null }));
}

async function updateTemplate(key, input, context) {
  const k = validate(keySchema, key);
  const data = validate(saveSchema(k), input);
  const saved = await withTransaction(async (client) => {
    const current = await repo.lockTemplate(k, client);
    if (!current) throw AppError.notFound('Template not found');
    if (current.version !== data.version) {
      throw AppError.conflict(`Someone else saved this template since you opened it (it is now version ${current.version}). Reload it and make your change again`);
    }
    const updated = await repo.updateTemplate(current.id, data, context.actor.id, client);
    await repo.insertVersion(updated, context.actor.id, client);
    await auditService.record({
      actor: context.actor, action: 'document.template_update', resourceType: 'print_template', resourceId: current.id,
      ip: context.ip, userAgent: context.userAgent, metadata: { key: k, fromVersion: current.version, toVersion: updated.version },
    }, { client });
    return updated;
  });
  return present(saved);
}

// Draws a sample using the draft text WITHOUT saving it, so the wording can be checked before it goes live
async function previewTemplate(key, input) {
  const k = validate(keySchema, key);
  const draft = validate(previewSchema(k), input);
  const stored = Object.fromEntries((await repo.listTemplates()).map((t) => [t.key, t]));
  const use = { ...stored, [k]: { ...stored[k], ...draft, title: draft.title ?? stored[k].title } };

  const sample = {
    firstName: 'Ada', middleName: 'Ngozi', surname: 'Okafor', parentFirstName: 'Chidi', parentLastName: 'Okafor',
    applicationNumber: 'NTIC-2027-000123', campusName: 'Kano Campus', categoryName: 'JSS 1', academicSession: '2027/2028', offerDeadline: '2027-01-31',
  };
  const letterhead = lines(use.letterhead.body);
  if (k === 'exam_instructions') {
    const buffer = await pdf.renderExamCard({
      letterhead, examNumber: 'KAN-27-0001', candidate: fullName(sample), applicationNumber: sample.applicationNumber, dateOfBirth: '1 January 2014',
      category: sample.categoryName, date: 'Monday, 23 November 2026', time: '9:00 am', duration: '2 hours', mode: 'In person', venue: 'Main Hall',
      campus: sample.campusName, instructions: lines(use.exam_instructions.body), generatedOn: longDate(new Date()),
    });
    return { filename: 'preview-exam-card.pdf', buffer };
  }
  const content = composeLetter({ letterhead, template: use.offer_letter, values: offerValues(sample, longDate(new Date())), reference: sample.applicationNumber });
  return { filename: 'preview-offer-letter.pdf', buffer: await pdf.renderOfferLetter(content) };
}

module.exports = {
  receiptForParent, receiptForStaff, examCardForParent, examCardForStaff, offerLetterForParent, offerLetterForStaff, resetOfferLetter,
  listTemplates, getTemplate, listVersions, updateTemplate, previewTemplate,
};
