// src/modules/audit/audit.routes.js
// Central administrators only.

const express = require('express');
const controller = require('./audit.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();

router.get('/audit-logs', authenticate, authorize(ROLES.CENTRAL_ADMIN), controller.listAuditLogs);

module.exports = router;