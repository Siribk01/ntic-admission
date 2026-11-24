// src/api/exams.js
// The entrance exam: see the booking, list free dates, choose or change a date, download the exam card.
import { api, apiBlob } from './client.js';

export const getExam = (applicationId) => api(`/applications/${applicationId}/exam`);
export const listSlots = (applicationId) => api(`/applications/${applicationId}/exam/slots`);
export const bookSlot = (applicationId, slotId) => api(`/applications/${applicationId}/exam`, { method: 'PUT', body: { slotId } });

export async function openExamCard(applicationId) {
  const blob = await apiBlob(`/applications/${applicationId}/exam/card.pdf`);
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
