// src/modules/onlinePayments/gateways/paystack.js
// Paystack: https://paystack.com/docs/api/transaction/ . Amounts are in kobo, which is how we store money too.
//   initialize  POST /transaction/initialize
//   verify      GET  /transaction/verify/:reference
//   webhook     header x-paystack-signature = HMAC SHA-512 of the raw request body, using the secret key

const crypto = require('crypto');
const { GatewayError, callJson, safeEqual } = require('./http');

function createPaystack({ secretKey, getFetch, baseUrl = 'https://api.paystack.co' }) {
  const auth = () => ({ authorization: `Bearer ${secretKey}` });

  return {
    name: 'paystack',
    isConfigured: () => Boolean(secretKey),

    async initialize({ reference, amountMinor, currency, email, callbackUrl, metadata }) {
      const { status, body } = await callJson(getFetch(), `${baseUrl}/transaction/initialize`, {
        method: 'POST', headers: auth(),
        body: { email, amount: amountMinor, currency, reference, callback_url: callbackUrl, metadata },
      });
      if (status >= 400 || !body || body.status !== true || !body.data || !body.data.authorization_url) {
        throw new GatewayError(`Paystack refused to start the payment${body && body.message ? `: ${body.message}` : ''}`, { transient: false, status });
      }
      return { authorizationUrl: body.data.authorization_url };
    },

    // status: success | failed | abandoned | pending | not_found
    async verify(reference) {
      const { status, body } = await callJson(getFetch(), `${baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, { headers: auth() });
      if (status === 404) return { status: 'not_found' };
      if (status >= 400 || !body || body.status !== true || !body.data) {
        throw new GatewayError(`Paystack could not verify the payment${body && body.message ? `: ${body.message}` : ''}`, { transient: false, status });
      }
      const d = body.data;
      if (d.reference !== reference) throw new GatewayError('Paystack answered about a different payment', { transient: false });
      const map = { success: 'success', failed: 'failed', reversed: 'failed', abandoned: 'abandoned' };
      return {
        status: map[d.status] || 'pending',
        amountMinor: Number.isInteger(d.amount) ? d.amount : null,
        currency: d.currency || null,
        gatewayId: d.id !== undefined ? String(d.id) : null,
        paidAt: d.paid_at || null,
        gatewayStatus: String(d.status || ''),
      };
    },

    verifyWebhook(rawBody, headers) {
      const sent = headers['x-paystack-signature'];
      if (!secretKey || !sent || !Buffer.isBuffer(rawBody)) return false;
      const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
      return safeEqual(expected, sent);
    },

    // The reference is only used to know WHICH payment to check; the amount and status come from verify(), never from here
    parseWebhook(json) {
      const data = json && json.data ? json.data : {};
      const type = json && json.event ? String(json.event) : 'unknown';
      return { eventId: data.id !== undefined ? `${type}:${data.id}` : null, type, reference: type === 'charge.success' && data.reference ? String(data.reference) : null };
    },
  };
}

module.exports = { createPaystack };
