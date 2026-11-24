// src/api/applications.js
// Applications and their documents. These match the backend routes under /applications and /document-types.
import { api, apiBlob } from './client.js';

export const listApplications = () => api('/applications');
export const getApplication = (id) => api(`/applications/${id}`);   // includes applicant (with guardians) and "missing": [...]
export const createApplication = (applicantId, cycleId) => api('/applications', { method: 'POST', body: { applicantId, cycleId } });
export const updateApplication = (id, body) => api(`/applications/${id}`, { method: 'PATCH', body });
export const submitApplication = (id) => api(`/applications/${id}/submit`, { method: 'POST' });

export const listDocumentTypes = () => api('/document-types', { auth: false });
export const listDocuments = (id) => api(`/applications/${id}/documents`);
export const uploadDocument = (id, code, file) => {
  const form = new FormData();
  form.append('file', file); // the field must be called "file"
  return api(`/applications/${id}/documents/${code}`, { method: 'PUT', form });
};
export const removeDocument = (id, code) => api(`/applications/${id}/documents/${code}`, { method: 'DELETE' });
// Opens the uploaded file in a new tab
export async function openDocument(id, code) {
  const blob = await apiBlob(`/applications/${id}/documents/${code}/file`);
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
