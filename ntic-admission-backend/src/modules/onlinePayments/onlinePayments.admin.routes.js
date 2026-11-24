// src/modules/onlinePayments/onlinePayments.admin.routes.js
// Finance and central admin. Mounted at /admin. Per-route middleware only (never router.use).

const express = require('express');
const controller = require('./onlinePayments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.FINANCE_OFFICER)];

router.get('/online-payments', ...staff, controller.listAttemptsForStaff);
router.post('/online-payments/:attemptId/settle', ...staff, controller.settleForStaff);

router.get('/payment-claims', ...staff, controller.listClaimsForStaff);
router.post('/payment-claims/:claimId/confirm', ...staff, controller.confirmClaim);
router.post('/payment-claims/:claimId/reject', ...staff, controller.rejectClaim);

module.exports = router;
