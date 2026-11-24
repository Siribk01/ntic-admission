// src/modules/onlinePayments/gateways/flutterwave.js
// Flutterwave v3: https://developer.flutterwave.com/docs . Amounts are in whole currency units (naira), not kobo.
//   initialize  POST /v3/payments                                   (tx_ref is our reference)
//   verify      GET  /v3/transactions/verify_by_reference?tx_ref=
//   webhook     header verif-hash must equal the "secret hash" you set in the Flutterwave dashboard

const { GatewayError, callJson, safeEqual } = require('./http');
const { toMinorUnits, formatMajor } = require('../../../utils/money');

function createFlutterwave({ secretKey, secretHash, getFetch, baseUrl = 'https://api.flutterwave.com/v3' }) {
  const auth = () => ({ authorization: `Bearer ${secretKey}` });

  return {
    name: 'flutterwave',
    isConfigured: () => Boolean(secretKey && secretHash),

    async initialize({ reference, amountMinor, currency, email, name, callbackUrl, metadata }) {
      const { status, body } = await callJson(getFetch(), `${baseUrl}/payments`, {
        method: 'POST', headers: auth(),
        body: {
          tx_ref: reference, amount: Number(formatMajor(amountMinor)), currency, redirect_url: callbackUrl,
          customer: { email, name: name || 'NTIC parent' }, meta: metadata,
          customizations: { title: 'NTIC application fee' },
        },
      });
      if (status >= 400 || !body || body.status !== 'success' || !body.data || !body.data.link) {
        throw new GatewayError(`Flutterwave refused to start the payment${body && body.message ? `: ${body.message}` : ''}`, { transient: false, status });
      }
      return { authorizationUrl: body.data.link };
    },

    async verify(reference) {
      const { status, body } = await callJson(getFetch(), `${baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { headers: auth() });
      if (status === 404 || (body && typeof body.message === 'string' && /no transaction/i.test(body.message))) return { status: 'not_found' };
      if (status >= 400 || !body || body.status !== 'success' || !body.data) {
        throw new GatewayError(`Flutterwave could not verify the payment${body && body.message ? `: ${body.message}` : ''}`, { transient: false, status });
      }
      const d = body.data;
      if (d.tx_ref !== reference) throw new GatewayError('Flutterwave answered about a different payment', { transient: false });
      const map = { successful: 'success', failed: 'failed', cancelled: 'failed' };
      return {
        status: map[d.status] || 'pending',
        amountMinor: typeof d.amount === 'number' ? toMinorUnits(String(d.amount)) : null,
        currency: d.currency || null,
        gatewayId: d.id !== undefined ? String(d.id) : null,
        paidAt: d.created_at || null,
        gatewayStatus: String(d.status || ''),
      };
    },

    verifyWebhook(rawBody, headers) {
      const sent = headers['verif-hash'];
      return Boolean(secretHash && sent && safeEqual(secretHash, sent));
    },

    parseWebhook(json) {
      const data = json && json.data ? json.data : {};
      const type = json && json.event ? String(json.event) : 'unknown';
      return { eventId: data.id !== undefined ? `${type}:${data.id}` : null, type, reference: type === 'charge.completed' && data.tx_ref ? String(data.tx_ref) : null };
    },
  };
}

module.exports = { createFlutterwave };
