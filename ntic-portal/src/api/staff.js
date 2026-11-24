// src/api/staff.js
// Everything the staff screens ask the backend for. Staff routes all live under /admin.
import { api, apiBlob } from './client.js';

export function listApplications({ q, status, limit = 25, offset = 0 } = {}) {
  const p = new URLSearchParams({ limit, offset });
  if (q) p.set('q', q);
  if (status) p.set('status', status);
  return api(`/admin/applications?${p}`);
}
export const getApplication = (id) => api(`/admin/applications/${id}`);
export const requestInformation = (id, message) => api(`/admin/applications/${id}/request-information`, { method: 'POST', body: { message } });
export const sendForDecision = (id) => api(`/admin/applications/${id}/send-for-decision`, { method: 'POST', body: {} });
// body: { outcome: 'offer'|'waitlist'|'reject', publicMessage?, notes?, offerDeadline? }
export const decide = (id, body) => api(`/admin/applications/${id}/decision`, { method: 'POST', body });

export const listClaims = (status = 'pending') => api(`/admin/payment-claims?status=${status}&limit=100`);
export const confirmClaim = (id) => api(`/admin/payment-claims/${id}/confirm`, { method: 'POST', body: {} });
export const rejectClaim = (id, reason) => api(`/admin/payment-claims/${id}/reject`, { method: 'POST', body: { reason } });

export async function openDocument(applicationId, typeCode) {
  const blob = await apiBlob(`/admin/applications/${applicationId}/documents/${typeCode}/file`);
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}

// ---- exams ----
export const listSlots = (upcoming) => api(`/admin/exam-slots${upcoming === undefined ? '' : `?upcoming=${upcoming}`}`);
// body: { cycleId, campusId, startsAt (with time zone), durationMinutes?, venue, capacity }
export const createSlot = (body) => api('/admin/exam-slots', { method: 'POST', body });
export const updateSlot = (id, body) => api(`/admin/exam-slots/${id}`, { method: 'PATCH', body });
export const getRoster = (slotId) => api(`/admin/exam-slots/${slotId}/roster`);
export const markAttendance = (applicationId, attended) => api(`/admin/applications/${applicationId}/exam/attendance`, { method: 'POST', body: { attended } });
export const getResult = (applicationId) => api(`/admin/applications/${applicationId}/exam/result`);
// body: { scores: [{ subject, score, maxScore }], remarks? }
export const saveResult = (applicationId, body) => api(`/admin/applications/${applicationId}/exam/result`, { method: 'PUT', body });
export const reviewResult = (applicationId) => api(`/admin/applications/${applicationId}/exam/result/review`, { method: 'POST', body: {} });

// ---- setup (central admin only) ----
const send = (method, path, body) => api(path, { method, body });
export const setup = {
  cycles: () => api('/admin/cycles'),
  createCycle: (b) => send('POST', '/admin/cycles', b),
  updateCycle: (id, b) => send('PATCH', `/admin/cycles/${id}`, b),
  setCycleCategories: (id, categoryIds) => send('PUT', `/admin/cycles/${id}/categories`, { categoryIds }),
  categories: () => api('/admin/categories'),
  createCategory: (b) => send('POST', '/admin/categories', b),
  updateCategory: (id, b) => send('PATCH', `/admin/categories/${id}`, b),
  campuses: () => api('/admin/campuses'),
  createCampus: (b) => send('POST', '/admin/campuses', b),
  updateCampus: (id, b) => send('PATCH', `/admin/campuses/${id}`, b),
  fees: () => api('/admin/fee-rules'),
  createFee: (b) => send('POST', '/admin/fee-rules', b),
  updateFee: (id, b) => send('PATCH', `/admin/fee-rules/${id}`, b),
  staff: () => api('/admin/staff'),
  createStaff: (b) => send('POST', '/admin/staff', b),
  updateStaff: (id, b) => send('PATCH', `/admin/staff/${id}`, b),
  resetPassword: (id, password) => send('POST', `/admin/staff/${id}/reset-password`, { password }),
};

// ---- interviews ----
export function listInterviews({ status, limit = 50, offset = 0 } = {}) {
  const p = new URLSearchParams({ limit, offset });
  if (status) p.set('status', status);
  return api(`/admin/interviews?${p}`); // -> { total, items }
}
export const listInterviewers = () => api('/admin/interviewers');
export const getInterview = (applicationId) => api(`/admin/applications/${applicationId}/interview`);
// body: { interviewerId, startsAt, durationMinutes?, timezone?, platform, meetingUrl?, location?, instructions?, reason? }
export const scheduleInterview = (applicationId, body) => api(`/admin/applications/${applicationId}/interview`, { method: 'PUT', body });
export const cancelInterview = (applicationId, reason) => api(`/admin/applications/${applicationId}/interview/cancel`, { method: 'POST', body: { reason } });
// reason is only needed when changing an outcome that was already recorded
export const interviewOutcome = (applicationId, attended, reason) => api(`/admin/applications/${applicationId}/interview/outcome`, { method: 'POST', body: reason ? { attended, reason } : { attended } });
export const getScorecard = (applicationId) => api(`/admin/applications/${applicationId}/interview/scorecard`);
// body: { scores: [{ criterion, score, comment? }], recommendation?, notes? }
export const saveScorecard = (applicationId, body) => api(`/admin/applications/${applicationId}/interview/scorecard`, { method: 'PUT', body });
export const submitScorecard = (applicationId) => api(`/admin/applications/${applicationId}/interview/scorecard/submit`, { method: 'POST', body: {} });
export const reopenScorecard = (applicationId, reason) => api(`/admin/applications/${applicationId}/interview/scorecard/reopen`, { method: 'POST', body: { reason } });
export const criteria = {
  list: () => api('/admin/scorecard-criteria'),
  create: (b) => api('/admin/scorecard-criteria', { method: 'POST', body: b }),
  update: (id, b) => api(`/admin/scorecard-criteria/${id}`, { method: 'PATCH', body: b }),
};

// ---- reports ----
const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v) p.set(k, v); }); const s = p.toString(); return s ? `?${s}` : ''; };
export const getDashboard = (params = {}) => api(`/admin/dashboard${qs(params)}`);
// dataset: 'applications' | 'payments' | 'exam-results'; format: 'csv' | 'xlsx'. Saves the file through the browser.
export async function downloadExport(dataset, format, params = {}) {
  const blob = await apiBlob(`/admin/exports/${dataset}.${format}${qs(params)}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ntic-${dataset}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- automatic email wording (central admin only) ----
export const emails = {
  list: () => api('/admin/email-templates'),
  get: (key) => api(`/admin/email-templates/${key}`),
  versions: (key) => api(`/admin/email-templates/${key}/versions`),
  // body: { subject, body, enabled, version }  (version = 0 the first time, then the version you opened)
  save: (key, b) => api(`/admin/email-templates/${key}`, { method: 'PUT', body: b }),
  preview: (key, b) => api(`/admin/email-templates/${key}/preview`, { method: 'POST', body: b }), // b = { subject, body }
};

// ---- document checklist (central admin only) ----
export const docTypes = {
  list: () => api('/admin/document-types'),
  create: (b) => api('/admin/document-types', { method: 'POST', body: b }),   // { code, name, required, allowedMimes, maxBytes, sortOrder? }
  update: (id, b) => api(`/admin/document-types/${id}`, { method: 'PATCH', body: b }),
};

// ---- system settings and background jobs (central admin only) ----
export const systemSettings = {
  get: () => api('/admin/settings'),                       // { unpaidExpiryDays: { value, default, min, max, description, ... }, ... }
  save: (changes) => api('/admin/settings', { method: 'PATCH', body: changes }), // only the settings you want to change
  jobs: () => api('/admin/jobs'),
  runJob: (job) => api('/admin/jobs/run', { method: 'POST', body: job ? { job } : {} }), // job: reconcile_payments | expire_unpaid | expire_offers | send_reminders
};
