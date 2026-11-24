// src/api/status.js
// Where the application stands, and what the parent can do about it.
import { api, apiBlob } from './client.js';

export const getStatus = (applicationId) => api(`/applications/${applicationId}/status`);
export const respondToInformationRequest = (applicationId, message) =>
  api(`/applications/${applicationId}/information-response`, { method: 'POST', body: message ? { message } : {} });
export const acceptOffer = (applicationId) => api(`/applications/${applicationId}/offer/accept`, { method: 'POST', body: {} });
export const declineOffer = (applicationId) => api(`/applications/${applicationId}/offer/decline`, { method: 'POST', body: {} });
export const withdrawApplication = (applicationId, reason) => api(`/applications/${applicationId}/withdraw`, { method: 'POST', body: { reason } });

export async function openOfferLetter(applicationId) {
  const blob = await apiBlob(`/applications/${applicationId}/offer-letter.pdf`);
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
