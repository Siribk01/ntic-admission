// src/modules/health/health.admin.routes.js
// Mounted under /admin. The detailed report is for central administrators only.
const express = require('express');
const controller = require('./health.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.get('/health', authenticate, authorize(ROLES.CENTRAL_ADMIN), controller.report);

module.exports = router;
