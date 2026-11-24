// src/modules/emailTemplates/emailTemplates.definitions.js
// Which emails can be re-worded, which {{placeholders}} they may use, and how an override is applied. No database here.
//
// An override has a subject and a body. In the body, paragraphs are separated by a blank line.
// The paragraph {{details}} on its own stands for the system's own lines (dates, links, amounts) so they cannot be lost.
// Other placeholders are filled in a single pass as plain text, so a value like "{{x}}" can never change an email.

const { TEMPLATES, SENSITIVE_TEMPLATES } = require('../notifications/notifications.templates');
const { fill, clean, paragraphs } = require('../printables/printables.templates');
const { formatMajor } = require('../../utils/money');

const KEYS = Object.keys(TEMPLATES).filter((k) => !SENSITIVE_TEMPLATES.has(k));
const PLACEHOLDERS = ['applicantName', 'applicationNumber', 'portalUrl', 'applicationFee'];

// These emails are only useful with their facts (dates, times, links, deadlines), so the override must keep {{details}}
const REQUIRES_DETAILS = new Set([
  'payment_received', 'payment_claim_rejected', 'exam_scheduled', 'exam_rescheduled', 'exam_reminder',
  'information_requested', 'decision_offer', 'offer_reminder',
  'interview_scheduled', 'interview_rescheduled', 'interview_reminder',
]);

const TOKEN = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
const DETAILS_PARAGRAPH = /^\{\{\s*details\s*\}\}$/;

// Returns a list of problems (empty = fine)
function check(key, { subject, body }) {
  const problems = [];
  const unknown = (text, field, allowDetails) => {
    const names = new Set([...text.matchAll(TOKEN)].map((m) => m[1]));
    for (const n of names) {
      if (n === 'details' && allowDetails) continue;
      if (!PLACEHOLDERS.includes(n)) {
        problems.push({ field, message: `{{${n}}} is not a known placeholder. You can use: ${PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ')}${allowDetails ? ', {{details}}' : ''}` });
      }
    }
    if (/\{\{|\}\}/.test(text.replace(TOKEN, ''))) problems.push({ field, message: 'There is a stray "{{" or "}}". Placeholders look like {{applicantName}}' });
  };
  unknown(subject, 'subject', false);
  unknown(body, 'body', true);
  const paras = paragraphs(body);
  for (const p of paras) {
    if (/\{\{\s*details\s*\}\}/.test(p) && !DETAILS_PARAGRAPH.test(p)) {
      problems.push({ field: 'body', message: '{{details}} must be on a line of its own, with a blank line before and after it' });
    }
  }
  if (REQUIRES_DETAILS.has(key) && !paras.some((p) => DETAILS_PARAGRAPH.test(p))) {
    problems.push({ field: 'body', message: 'This email carries important facts (dates, links, amounts). Keep a line with {{details}} so they are included' });
  }
  return problems;
}

const valuesFrom = (c) => ({
  applicantName: c.applicantName ?? '',
  applicationNumber: c.applicationNumber ?? '',
  portalUrl: process.env.PORTAL_URL || 'the NTIC admissions portal',
  applicationFee: c.feeAmountMinor != null ? `${formatMajor(c.feeAmountMinor)} ${c.feeCurrency || 'NGN'}` : '',
});

// Same shape the built-in templates return: { subject, lines }. `original` is the built-in result for this context.
function applyOverride(override, context, original) {
  const values = valuesFrom(context);
  const subject = clean(fill(override.subject, values)).replace(/\s+/g, ' ').trim();
  const lines = paragraphs(override.body).flatMap((p) => (DETAILS_PARAGRAPH.test(p) ? original.lines : [fill(p, values)]));
  return { subject: subject || original.subject, lines };
}

// Made-up but realistic values, so wording can be previewed for any email
const SAMPLE_CONTEXT = {
  applicantName: 'Ada', applicationNumber: 'NTIC-2027-000123', feeAmountMinor: 1000000, feeCurrency: 'NGN',
  amountMinor: 1000000, balanceMinor: 0, currency: 'NGN', paidInFull: true, awaitingPayment: false, method: 'bank_transfer',
  receiptNumber: 'RCT-000045', bankReference: 'TRF-889123', paymentDeadline: '2026-12-15', offerDeadline: '2027-01-31',
  campusName: 'Kano Campus', examNumber: 'KAN-27-0001', venue: 'Main Hall', startsAt: '2026-11-23T08:00:00Z', timezone: 'Africa/Lagos',
  durationMinutes: 30, platform: 'google_meet', meetingUrl: 'https://meet.example.com/abc', location: null, instructions: 'Please be ready a few minutes early.',
  fieldLabel: 'date of birth', note: 'Checked against the birth certificate.', requestSubject: 'Question about my fee',
  message: 'Please upload a clearer copy of the birth certificate.', reason: 'The slip was unreadable.', link: 'https://portal.example.com/x', token: 'sample',
};

module.exports = { KEYS, PLACEHOLDERS, REQUIRES_DETAILS, check, applyOverride, valuesFrom, SAMPLE_CONTEXT };
