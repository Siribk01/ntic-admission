// src/modules/onlinePayments/onlinePayments.routes.js
// Parent-facing. Mounted at /applications. Per-route middleware only (never router.use).

const express = require('express');
const controller = require('./onlinePayments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ipRateLimit } = require('../../utils/ipRateLimit');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const parent = [authenticate, authorize(ROLES.APPLICANT)];
// The "I'm back from the payment page" check calls the gateway, so it is limited per address
const verifyLimit = ipRateLimit({ limit: Number(process.env.PUBLIC_RATE_LIMIT) || 60, windowMs: 15 * 60 * 1000 });

router.post('/:applicationId/online-payments', ...parent, controller.initiatePayment);
router.get('/:applicationId/online-payments', ...parent, controller.listAttempts);
router.get('/:applicationId/online-payments/:reference', ...parent, controller.getAttempt);
router.post('/:applicationId/online-payments/:reference/verify', ...parent, verifyLimit, controller.verifyAttempt);

router.post('/:applicationId/payment-claims', ...parent, controller.submitClaim);
router.get('/:applicationId/payment-claims', ...parent, controller.listMyClaims);

module.exports = router;
