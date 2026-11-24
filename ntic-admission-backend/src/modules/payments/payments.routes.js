// src/modules/payments/payments.routes.js
// Parent-facing: my receipts.

const express = require('express');
const controller = require('./payments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.get('/', authenticate, authorize(ROLES.APPLICANT), controller.listMyPayments);

module.exports = router;
