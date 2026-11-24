// src/constants/applicationStatus.js
// The application track (SRS section 3.1). The allowed moves are fixed here in code, not editable by admins.

const STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',                  // submitted, waiting for the fee
  UNDER_REVIEW: 'under_review',            // fee paid, staff are reviewing
  INFORMATION_REQUIRED: 'information_required',
  DECISION_PENDING: 'decision_pending',    // reviewed, waiting for the decision-maker
  OFFERED: 'offered',
  WAITLISTED: 'waitlisted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  CLOSED: 'closed',
});

// Who may move from where to where. A status missing from the list of a "from" is simply not allowed.
const TRANSITIONS = Object.freeze({
  draft: ['submitted'],
  submitted: ['under_review', 'withdrawn', 'closed'],
  under_review: ['information_required', 'decision_pending', 'offered', 'waitlisted', 'rejected', 'withdrawn'],
  information_required: ['under_review', 'withdrawn'],
  decision_pending: ['under_review', 'offered', 'waitlisted', 'rejected', 'withdrawn'],
  waitlisted: ['offered', 'rejected', 'withdrawn'],
  offered: ['closed', 'withdrawn'],
  // Finished. The only way out is an administrator reopening the file (audited), which goes back to review.
  rejected: ['under_review'],
  withdrawn: ['under_review'],
  // closed -> submitted is only used to reopen an application that EXPIRED unpaid (it must pay again, at the current fee)
  closed: ['under_review', 'submitted'],
});

// Fee paid or payable and the file is alive: payments, exam booking etc. are allowed in these.
const LIVE_STATUSES = Object.freeze(['submitted', 'under_review', 'information_required', 'decision_pending']);
const TERMINAL_STATUSES = Object.freeze(['rejected', 'withdrawn', 'closed']);

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

module.exports = { STATUS, TRANSITIONS, LIVE_STATUSES, TERMINAL_STATUSES, canTransition };
