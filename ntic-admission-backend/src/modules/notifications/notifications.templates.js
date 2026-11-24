// src/modules/notifications/notifications.templates.js
// What each email says. Every template returns { subject, lines }, where lines is an array of paragraphs.
// The same text is used for the plain-text and the HTML version, so they can never disagree.
// Keep these short and free of sensitive details: email is not private.

const { formatMajor } = require('../../utils/money');

const portal = () => process.env.PORTAL_URL || 'the NTIC admissions portal';

const lagosTime = (value) =>
  new Intl.DateTimeFormat('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value));
const lagosDate = (yyyyMmDd) =>
  new Intl.DateTimeFormat('en-NG', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${yyyyMmDd}T00:00:00Z`));


// Interview times are shown in the time zone chosen for that interview (Nigeria time unless staff picked another)
const timeIn = (value, tz) => {
  try {
    return new Intl.DateTimeFormat('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'Africa/Lagos' }).format(new Date(value));
  } catch { return lagosTime(value); }
};
const PLATFORM_LABELS = { google_meet: 'Google Meet', microsoft_teams: 'Microsoft Teams', zoom: 'Zoom', phone: 'Phone call', in_person: 'In person', other: 'Online meeting' };
// The lines that describe an interview, shared by the scheduled, rescheduled and reminder emails
const interviewLines = (c) => [
  `Date and time: ${timeIn(c.startsAt, c.timezone)} (${c.timezone || 'Africa/Lagos'})`,
  `Length: about ${c.durationMinutes} minutes`,
  `How: ${PLATFORM_LABELS[c.platform] || 'Online'}`,
  ...(c.location ? [`Where: ${c.location}`] : []),
  ...(c.meetingUrl ? [{ label: 'Meeting link', url: c.meetingUrl }] : []),
  ...(c.instructions ? [`Instructions: ${c.instructions}`] : []),
];

const TEMPLATES = {
  application_submitted: (c) => ({
    subject: `Application ${c.applicationNumber} received`,
    lines: [
      `We have received the application for ${c.applicantName}. The application number is ${c.applicationNumber}.`,
      `The application fee is ${formatMajor(c.feeAmountMinor)} ${c.feeCurrency}. Your application will move to review once the fee has been paid.`,
      `Sign in to ${portal()} to follow your application.`,
    ],
  }),

  payment_received: (c) => ({
    subject: c.method === 'waiver' ? `Fee waiver applied: ${c.receiptNumber}` : `Payment received: receipt ${c.receiptNumber}`,
    lines: [
      c.method === 'waiver'
        ? `A fee waiver of ${formatMajor(c.amountMinor)} ${c.currency} has been applied to application ${c.applicationNumber}. Reference: ${c.receiptNumber}.`
        : `We received a payment of ${formatMajor(c.amountMinor)} ${c.currency} for application ${c.applicationNumber}. Receipt number: ${c.receiptNumber}.`,
      c.paidInFull
        ? 'The application fee has now been paid in full. You can choose your exam date in the portal.'
        : `The balance still to pay is ${formatMajor(c.balanceMinor)} ${c.currency}.`,
    ],
  }),

  payment_claim_received: (c) => ({
    subject: `We received your payment details for ${c.applicationNumber}`,
    lines: [
      `Thank you. We received your bank transfer details (reference ${c.bankReference}, ${formatMajor(c.amountMinor)} ${c.currency}) for application ${c.applicationNumber}.`,
      'Our finance team will check them against the school account. Your payment counts only after it is confirmed, and you will get a receipt by email.',
    ],
  }),

  payment_claim_rejected: (c) => ({
    subject: `We could not confirm your payment for ${c.applicationNumber}`,
    lines: [
      `We could not confirm the bank transfer with reference ${c.bankReference} for application ${c.applicationNumber}.`,
      `Reason: ${c.reason}`,
      'If you did pay, please check the details and send them again in the portal, or contact the school.',
    ],
  }),

  exam_scheduled: (c) => ({
    subject: `Exam date confirmed for ${c.applicantName}`,
    lines: [
      `The entrance exam for ${c.applicantName} is confirmed.`,
      `Exam number: ${c.examNumber}`,
      `Date and time: ${lagosTime(c.startsAt)} (Nigeria time)`,
      `Venue: ${c.venue}, ${c.campusName}`,
      'Please arrive early and bring your exam number.',
    ],
  }),

  exam_rescheduled: (c) => ({
    subject: `Exam date changed for ${c.applicantName}`,
    lines: [
      `The entrance exam for ${c.applicantName} has been moved.`,
      `Exam number: ${c.examNumber}`,
      `New date and time: ${lagosTime(c.startsAt)} (Nigeria time)`,
      `Venue: ${c.venue}, ${c.campusName}`,
    ],
  }),

  exam_cancelled: (c) => ({
    subject: `Exam booking cancelled for ${c.applicantName}`,
    lines: [
      `The exam booking for ${c.applicantName} (exam number ${c.examNumber}) has been cancelled.`,
      `Sign in to ${portal()} to choose a new date, or contact NTIC if you have questions.`,
    ],
  }),

  information_requested: (c) => ({
    subject: `More information needed for application ${c.applicationNumber}`,
    lines: [
      `NTIC needs more information for ${c.applicantName}'s application.`,
      `Message from NTIC: ${c.message}`,
      `Please sign in to ${portal()}, update the documents if needed, and tell us when you are done.`,
    ],
  }),

  decision_offer: (c) => ({
    subject: `Decision on application ${c.applicationNumber}: offer of admission`,
    lines: [
      `Congratulations. ${c.applicantName} has been offered admission.`,
      c.message || null,
      `Please sign in to ${portal()} to accept or decline the offer by ${lagosDate(c.offerDeadline)}. An offer that has not been answered by then will expire.`,
    ].filter(Boolean),
  }),

  correction_approved: (c) => ({
    subject: `Correction approved for application ${c.applicationNumber}`,
    lines: [
      `The change you asked for to the ${c.fieldLabel} of ${c.applicantName} (application ${c.applicationNumber}) has been made.`,
      c.note ? `Note from NTIC: ${c.note}` : null,
    ].filter(Boolean),
  }),

  correction_rejected: (c) => ({
    subject: `Correction not made for application ${c.applicationNumber}`,
    lines: [
      `We could not make the change you asked for to the ${c.fieldLabel} of ${c.applicantName} (application ${c.applicationNumber}).`,
      `Reason: ${c.note}`,
      `If you still need this changed, please send a message through ${portal()}.`,
    ],
  }),

  // Email is not private, so the reply itself is never put in the email
  support_reply: (c) => ({
    subject: 'NTIC has replied to your message',
    lines: [`NTIC Admissions has replied to your support request "${c.requestSubject}".`, `Sign in to ${portal()} to read the reply.`],
  }),

  decision_waitlist: (c) => ({
    subject: `Decision on application ${c.applicationNumber}: waiting list`,
    lines: [
      `${c.applicantName} has been placed on the waiting list.`,
      c.message || null,
      'We will contact you if a place becomes available.',
    ].filter(Boolean),
  }),

  decision_reject: (c) => ({
    subject: `Decision on application ${c.applicationNumber}`,
    lines: [
      `Thank you for applying. We are sorry to say that we are unable to offer ${c.applicantName} a place at this time.`,
      c.message || null,
    ].filter(Boolean),
  }),

  application_reopened: (c) => ({
    subject: `Application ${c.applicationNumber} reopened`,
    lines: c.awaitingPayment
      ? [
          `The application for ${c.applicantName} has been reopened.`,
          `The application fee is ${formatMajor(c.feeAmountMinor)} ${c.feeCurrency}. It is calculated again under the current fees, so it may differ from the earlier amount.`,
          `Please pay by ${lagosDate(c.paymentDeadline)}. The application moves to review once the fee has been paid.`,
        ]
      : [`The application for ${c.applicantName} has been reopened and is under review again.`],
  }),

  // ----- about the account itself -----

  verify_email: (c) => ({
    subject: 'Please confirm your email address',
    lines: [
      'Thank you for creating an account with NTIC Admissions. Please confirm your email address so we can send you updates about your application.',
      c.link ? { label: 'Confirm your email address', url: c.link } : `Your confirmation code is: ${c.token}`,
      'This link works for 24 hours. If you did not create an account, you can ignore this email.',
    ],
  }),

  password_reset: (c) => ({
    subject: 'Reset your NTIC password',
    lines: [
      'We received a request to reset the password for your NTIC Admissions account.',
      c.link ? { label: 'Choose a new password', url: c.link } : `Your reset code is: ${c.token}`,
      'This link works for 1 hour and can be used once. If you did not ask for this, you can ignore this email and your password will stay the same.',
    ],
  }),

  password_changed: () => ({
    subject: 'Your NTIC password was changed',
    lines: [
      'The password for your NTIC Admissions account was just changed.',
      'If this was you, there is nothing more to do. If it was not you, please reset your password straight away and contact NTIC.',
    ],
  }),

  // ----- sent by the background jobs -----

  unpaid_expiry_warning: (c) => ({
    subject: `Reminder: application fee due by ${lagosDate(c.paymentDeadline)}`,
    lines: [
      `The application fee of ${formatMajor(c.feeAmountMinor)} ${c.feeCurrency} for ${c.applicantName} (application ${c.applicationNumber}) has not been paid yet.`,
      `Please pay by ${lagosDate(c.paymentDeadline)}. After that date the application is closed automatically.`,
      `If it is closed, NTIC can reopen it, but the fee is then calculated again under the current fees.`,
    ],
  }),

  application_expired: (c) => ({
    subject: `Application ${c.applicationNumber} has expired`,
    lines: [
      `The application for ${c.applicantName} has been closed because the application fee was not paid by ${lagosDate(c.paymentDeadline)}.`,
      `If you still want to apply, please contact NTIC and ask for the application to be reopened. The fee is then calculated again under the current fees.`,
    ],
  }),

  offer_reminder: (c) => ({
    subject: `Reminder: please respond to the offer for ${c.applicantName}`,
    lines: [
      `${c.applicantName} has an offer of admission that has not been answered yet.`,
      `Please sign in to ${portal()} and accept or decline the offer by ${lagosDate(c.offerDeadline)}. An offer that has not been answered by then will expire.`,
    ],
  }),

  offer_expired: (c) => ({
    subject: `The offer for ${c.applicantName} has expired`,
    lines: [
      `The offer of admission for ${c.applicantName} (application ${c.applicationNumber}) has expired because it was not answered by ${lagosDate(c.offerDeadline)}.`,
      'If you have questions, please contact NTIC.',
    ],
  }),

  exam_reminder: (c) => ({
    subject: `Exam reminder for ${c.applicantName}`,
    lines: [
      `This is a reminder that the entrance exam for ${c.applicantName} is coming up.`,
      `Exam number: ${c.examNumber}`,
      `Date and time: ${lagosTime(c.startsAt)} (Nigeria time)`,
      `Venue: ${c.venue}, ${c.campusName}`,
      'Please arrive early and bring your exam number.',
    ],
  }),

  interview_scheduled: (c) => ({
    subject: `Interview scheduled for ${c.applicantName}`,
    lines: [`An interview has been scheduled for ${c.applicantName} (application ${c.applicationNumber}).`, ...interviewLines(c), 'Please be ready a few minutes early.'],
  }),

  interview_rescheduled: (c) => ({
    subject: `Interview time changed for ${c.applicantName}`,
    lines: [`The interview for ${c.applicantName} (application ${c.applicationNumber}) has been moved. Please use the new details below.`, ...interviewLines(c)],
  }),

  interview_cancelled: (c) => ({
    subject: `Interview cancelled for ${c.applicantName}`,
    lines: [`The interview for ${c.applicantName} (application ${c.applicationNumber}) has been cancelled.`, 'NTIC will contact you if a new time is arranged.'],
  }),

  interview_reminder: (c) => ({
    subject: `Interview reminder for ${c.applicantName}`,
    lines: [`This is a reminder that the interview for ${c.applicantName} is coming up.`, ...interviewLines(c), 'Please be ready a few minutes early.'],
  }),
};

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function render(template, context, override = null) {
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  const original = build(context);
  let { subject, lines } = original;
  // Wording an administrator has saved replaces the built-in text. If anything about it fails, the built-in text is used.
  if (override && !SENSITIVE_TEMPLATES.has(template)) {
    try {
      ({ subject, lines } = require('../emailTemplates/emailTemplates.definitions').applyOverride(override, context, original));
    } catch { ({ subject, lines } = original); }
  }
  // A line is plain text, or { label, url } for a link
  const plain = (l) => (typeof l === 'string' ? l : `${l.label}: ${l.url}`);
  const text = ['Dear Parent/Guardian,', '', ...lines.flatMap((l) => [plain(l), '']), 'NTIC Admissions'].join('\n');
  // Everything that came from a person or the database is escaped, so nobody can inject markup into an email
  const paragraph = (l) =>
    typeof l === 'string'
      ? `<p>${escapeHtml(l)}</p>`
      : `<p>${escapeHtml(l.label)}: <a href="${escapeHtml(l.url)}">${escapeHtml(l.url)}</a></p>`;
  const html = `<p>Dear Parent/Guardian,</p>` + lines.map(paragraph).join('') + `<p>NTIC Admissions</p>`;
  return { subject, text, html };
}

// Emails whose body holds a one-time link. The outbox wipes their text once they are sent.
const SENSITIVE_TEMPLATES = new Set(['verify_email', 'password_reset']);

module.exports = { render, TEMPLATES, SENSITIVE_TEMPLATES };
