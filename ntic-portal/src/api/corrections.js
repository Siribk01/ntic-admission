// src/api/corrections.js
// After submission the details are locked. A parent asks for a correction, and NTIC approves or rejects it.
import { api } from './client.js';

export const listCorrections = (applicationId) => api(`/applications/${applicationId}/corrections`);
// body: { field, newValue, reason }
export const requestCorrection = (applicationId, body) => api(`/applications/${applicationId}/corrections`, { method: 'POST', body });
export const cancelCorrection = (applicationId, correctionId) => api(`/applications/${applicationId}/corrections/${correctionId}/cancel`, { method: 'POST', body: {} });
