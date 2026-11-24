// src/modules/onlinePayments/gateways/mock.js
// A pretend gateway for development and tests, so the whole online payment flow can be tried without real keys or money.
// It refuses to run when NODE_ENV is "production". Nothing here talks to the internet.
//   Start a payment as normal, then pretend the parent paid:  POST /webhooks/mock/simulate  { "reference": "...", "outcome": "success" }

const crypto = require('crypto');
const { GatewayError, safeEqual } = require('./http');

const SECRET = 'mock-secret';
const state = new Map(); // reference -> { status, amountMinor, currency }
let broken = false; // pretend the gateway is down

function createMock() {
  const allowed = () => process.env.NODE_ENV !== 'production';
  return {
    name: 'mock',
    isConfigured: () => allowed(),

    async initialize({ reference, amountMinor, currency, callbackUrl }) {
      if (!allowed()) throw new GatewayError('The mock gateway is disabled in production', { transient: false });
      state.set(reference, { status: 'pending', amountMinor, currency });
      return { authorizationUrl: `${callbackUrl}${callbackUrl.includes('?') ? '&' : '?'}mock=1&reference=${encodeURIComponent(reference)}` };
    },

    async verify(reference) {
      if (!allowed()) throw new GatewayError('The mock gateway is disabled in production', { transient: false });
      if (broken) throw new GatewayError('The mock gateway is pretending to be down', { transient: true });
      const s = state.get(reference);
      if (!s) return { status: 'not_found' };
      return { status: s.status, amountMinor: s.amountMinor, currency: s.currency, gatewayId: `mock-${reference.slice(-6)}`, paidAt: s.paidAt || null, gatewayStatus: s.status };
    },

    verifyWebhook(rawBody, headers) {
      const sent = headers['x-mock-signature'];
      if (!allowed() || !sent || !Buffer.isBuffer(rawBody)) return false;
      return safeEqual(crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex'), sent);
    },

    parseWebhook(json) {
      const data = json && json.data ? json.data : {};
      const type = json && json.event ? String(json.event) : 'unknown';
      return { eventId: data.id !== undefined ? `${type}:${data.id}` : null, type, reference: type === 'charge.success' && data.reference ? String(data.reference) : null };
    },

    // Test controls (not part of the gateway interface)
    simulate(reference, { outcome = 'success', amountMinor, currency } = {}) {
      const s = state.get(reference);
      if (!s) return false;
      s.status = outcome;
      if (amountMinor !== undefined) s.amountMinor = amountMinor;
      if (currency !== undefined) s.currency = currency;
      if (outcome === 'success') s.paidAt = new Date().toISOString();
      return true;
    },
    setBroken(value) { broken = Boolean(value); },
    sign(rawBody) { return crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex'); },
  };
}

module.exports = { createMock };
