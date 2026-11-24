// src/api/payments.js
// Bank-transfer payment: the parent reports a transfer ("claim"), staff confirm it, and a payment with a receipt is recorded.
import { api, apiBlob } from './client.js';

export const listClaims = (applicationId) => api(`/applications/${applicationId}/payment-claims`);
// body: { amount: "10000.00", bankReference, bankName?, paidOn: "2026-11-16", note? }
export const submitClaim = (applicationId, body) => api(`/applications/${applicationId}/payment-claims`, { method: 'POST', body });
export const listPayments = (applicationId) => api(`/payments?applicationId=${applicationId}`);

export async function openReceipt(applicationId, paymentId) {
  const blob = await apiBlob(`/applications/${applicationId}/payments/${paymentId}/receipt.pdf`);
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
