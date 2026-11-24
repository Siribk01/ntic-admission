// src/modules/payments/payments.admin.routes.js
// Mounted under /admin. Finance officers record payments for their campuses; only central admins reverse them.

const express = require('express');
const controller = require('./payments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.FINANCE_OFFICER)];

router.post('/payments', ...staff, controller.createPayment);
router.get('/payments', ...staff, controller.listPaymentsForStaff);
router.post('/payments/:paymentId/reverse', authenticate, authorize(ROLES.CENTRAL_ADMIN), controller.reversePayment);

module.exports = router;
