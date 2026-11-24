// src/modules/fees/fees.admin.routes.js
// Central administrators only. Mounted under /admin.

const express = require('express');
const controller = require('./fees.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.post('/fee-rules', ...adminOnly, controller.createFeeRule);
router.get('/fee-rules', ...adminOnly, controller.listFeeRules);
// "gaps" must be declared BEFORE "/:ruleId", otherwise "gaps" would be read as a rule id
router.get('/fee-rules/gaps', ...adminOnly, controller.listFeeGaps);
router.get('/fee-rules/:ruleId', ...adminOnly, controller.getFeeRule);
router.patch('/fee-rules/:ruleId', ...adminOnly, controller.updateFeeRule);

module.exports = router;