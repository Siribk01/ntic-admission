// src/modules/onlinePayments/webhooks.routes.js
// Messages FROM the payment gateways. Mounted at /webhooks.
//
// IMPORTANT: mount this BEFORE app.use(express.json()). A gateway signs the exact bytes it sends, so we must read the raw
// body ourselves. If express.json() has already parsed it, the bytes are gone and every signature check would fail.
//   app.use('/webhooks', require('./modules/onlinePayments/webhooks.routes'));
//   app.use(express.json());
//
// URLs to give the gateways:   POST https://<your-api>/webhooks/paystack      POST https://<your-api>/webhooks/flutterwave

const express = require('express');
const controller = require('./onlinePayments.controller');

const router = express.Router();

// Development only (answers 404 unless PAYMENT_PROVIDER=mock and NODE_ENV is not production)
router.post('/mock/simulate', express.json(), controller.simulateMock);

router.post('/:provider', express.raw({ type: '*/*', limit: '200kb' }), controller.webhook);

module.exports = router;
