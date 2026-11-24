// src/api/interview.js
import { api } from './client.js';
export const getInterview = (applicationId) => api(`/applications/${applicationId}/interview`);
