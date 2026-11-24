// src/modules/onlinePayments/gateways/http.js
// One small helper for calling a gateway's API, and the error type that says whether trying again could help.

class GatewayError extends Error {
  // transient = true: a timeout, a network failure or a gateway outage. The same call may work later.
  // transient = false: the gateway understood us and said no (wrong key, bad request). Retrying will not help.
  constructor(message, { transient, status } = {}) {
    super(message);
    this.name = 'GatewayError';
    this.transient = Boolean(transient);
    this.status = status;
  }
}

const TIMEOUT_MS = 15000;

// Returns { status, body } for any HTTP answer. Throws GatewayError (transient) only if no usable answer arrived.
async function callJson(fetchImpl, url, { method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new GatewayError(err.name === 'AbortError' ? 'The payment gateway did not answer in time' : 'Could not reach the payment gateway', { transient: true });
  } finally {
    clearTimeout(timer);
  }
  let parsed = null;
  try { parsed = await response.json(); } catch { /* not JSON */ }
  if (response.status >= 500 || response.status === 429) {
    throw new GatewayError(`The payment gateway is having problems (HTTP ${response.status})`, { transient: true, status: response.status });
  }
  return { status: response.status, body: parsed };
}

// Compares two strings without leaking, through timing, how many characters matched
function safeEqual(a, b) {
  const crypto = require('crypto');
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { GatewayError, callJson, safeEqual };
