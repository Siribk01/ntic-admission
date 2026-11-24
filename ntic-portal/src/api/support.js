// src/api/support.js
// Messages to the NTIC office. A request has a subject and a thread of messages.
import { api } from './client.js';

export const CATEGORIES = [
  { value: 'payment', label: 'Payment' }, { value: 'exam', label: 'Exam' }, { value: 'documents', label: 'Documents' },
  { value: 'technical', label: 'Problem with this website' }, { value: 'other', label: 'Something else' },
];

// The backend lists one status at a time, so we fetch all three and merge them (newest activity first).
export async function listRequests() {
  const parts = await Promise.all(['open', 'answered', 'closed'].map((status) => api(`/support?status=${status}`)));
  return parts.flat().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}
export const getRequest = (id) => api(`/support/${id}`);
// body: { category, subject, message, applicationId? }
export const createRequest = (body) => api('/support', { method: 'POST', body });
export const reply = (id, body) => api(`/support/${id}/messages`, { method: 'POST', body: { body } });
export const closeRequest = (id) => api(`/support/${id}/close`, { method: 'POST', body: {} });
