// src/modules/onlinePayments/gateways/index.js
// Chooses the payment gateway. The rest of the code only ever talks to the small interface every gateway offers:
//   isConfigured(), initialize(...), verify(reference), verifyWebhook(rawBody, headers), parseWebhook(json)
//
// .env:
//   PAYMENT_PROVIDER=paystack | flutterwave | mock     (leave empty to switch online payments off)
//   PAYSTACK_SECRET_KEY=sk_live_...
//   FLW_SECRET_KEY=FLWSECK-...   and   FLW_SECRET_HASH=<the "secret hash" from the Flutterwave dashboard>

const { createPaystack } = require('./paystack');
const { createFlutterwave } = require('./flutterwave');
const { createMock } = require('./mock');

let fetchOverride = null;
const getFetch = () => fetchOverride || globalThis.fetch; // tests can swap this
const setFetch = (fn) => { fetchOverride = fn; };

let mock = null;
// A gateway by name. Attempts remember their provider, so a payment started with Paystack is still checked with
// Paystack even if you later switch PAYMENT_PROVIDER.
function forProvider(name) {
  if (name === 'paystack') return createPaystack({ secretKey: process.env.PAYSTACK_SECRET_KEY, getFetch });
  if (name === 'flutterwave') return createFlutterwave({ secretKey: process.env.FLW_SECRET_KEY, secretHash: process.env.FLW_SECRET_HASH, getFetch });
  if (name === 'mock') { mock = mock || createMock(); return mock; }
  return null;
}

// The gateway new payments are started with, or null if online payments are not set up
function activeGateway() {
  const gateway = forProvider((process.env.PAYMENT_PROVIDER || '').trim().toLowerCase());
  return gateway && gateway.isConfigured() ? gateway : null;
}

module.exports = { activeGateway, forProvider, setFetch };
