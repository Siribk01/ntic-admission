// src/constants/roles.js
// The one place that lists every role. Must match the CHECK constraint on users.role.

const ROLES = Object.freeze({
  APPLICANT: 'applicant',
  CENTRAL_ADMIN: 'central_admin',
  CAMPUS_OFFICER: 'campus_officer',
  FINANCE_OFFICER: 'finance_officer',
  INTERVIEWER: 'interviewer',
  REVIEWER: 'reviewer',
});

// Everyone except applicants (parents)
const STAFF_ROLES = Object.freeze([
  ROLES.CENTRAL_ADMIN,
  ROLES.CAMPUS_OFFICER,
  ROLES.FINANCE_OFFICER,
  ROLES.INTERVIEWER,
  ROLES.REVIEWER,
]);

module.exports = { ROLES, STAFF_ROLES };