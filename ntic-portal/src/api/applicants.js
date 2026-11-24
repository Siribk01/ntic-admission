// src/api/applicants.js
// A "child" in the portal is an "applicant" in the backend. These match /applicants/* in the backend I built.
import { api } from './client.js';

export const listChildren = () => api('/applicants');
export const getChild = (id) => api(`/applicants/${id}`);                       // includes guardians: [...]
export const createChild = (body) => api('/applicants', { method: 'POST', body });
export const updateChild = (id, body) => api(`/applicants/${id}`, { method: 'PATCH', body });
export const saveGuardian = (id, relationship, body) => api(`/applicants/${id}/guardians/${relationship}`, { method: 'PUT', body });
export const removeGuardian = (id, relationship) => api(`/applicants/${id}/guardians/${relationship}`, { method: 'DELETE' });
