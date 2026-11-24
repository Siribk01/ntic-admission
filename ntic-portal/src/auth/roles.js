// src/auth/roles.js
// Who is who. The backend decides what each role may do; this file only decides which screens to show.
export const STAFF_ROLES = ['central_admin', 'campus_officer', 'reviewer', 'finance_officer', 'interviewer'];
export const ROLE_LABEL = {
  central_admin: 'Central admin', campus_officer: 'Campus officer', reviewer: 'Reviewer', finance_officer: 'Finance officer', interviewer: 'Interviewer', applicant: 'Parent',
};
export const isStaff = (user) => STAFF_ROLES.includes(user?.role);

// Who sees which staff menu item (the backend enforces the same rules)
export const CAN_READ_APPLICATIONS = ['central_admin', 'campus_officer', 'reviewer'];
export const CAN_DECIDE = ['central_admin', 'campus_officer'];
export const CAN_SCHEDULE_INTERVIEWS = ['central_admin', 'campus_officer'];
export const CAN_SEE_INTERVIEWS = ['central_admin', 'campus_officer', 'reviewer', 'interviewer'];
export const CAN_MANAGE_EXAMS = ['central_admin', 'campus_officer']; // create slots, mark attendance, enter marks
export const CAN_SEE_REPORTS = ['central_admin', 'campus_officer', 'reviewer', 'finance_officer'];
export const EXPORTS = [
  { dataset: 'applications', label: 'Applications', hint: 'One row per submitted application, with payment, exam, interview and decision.', roles: ['central_admin', 'campus_officer'], statuses: ['submitted', 'under_review', 'information_required', 'decision_pending', 'offered', 'waitlisted', 'rejected', 'withdrawn', 'closed'] },
  { dataset: 'payments', label: 'Payments', hint: 'Every payment and reversal, for reconciliation with the bank.', roles: ['central_admin', 'finance_officer'], statuses: ['successful', 'reversed'] },
  { dataset: 'exam-results', label: 'Exam results', hint: 'Marks per subject for every candidate who sat the exam.', roles: ['central_admin', 'campus_officer', 'reviewer'], statuses: ['draft', 'reviewed'] },
];
export const CAN_ADMIN = ['central_admin']; // sessions, classes, campuses, fees, staff accounts
export const CAN_HANDLE_PAYMENTS = ['central_admin', 'finance_officer'];

export const homeFor = (user) => (!isStaff(user) ? '/' : user.role === 'interviewer' ? '/staff/interviews' : CAN_READ_APPLICATIONS.includes(user.role) ? '/staff' : user.role === 'finance_officer' ? '/staff/payments' : '/staff');
