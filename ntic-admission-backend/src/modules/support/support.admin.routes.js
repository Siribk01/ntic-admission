// src/modules/support/support.admin.routes.js
// Mounted under /admin.
const express = require('express');
const controller = require('./support.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.FINANCE_OFFICER)];

router.get('/support-requests', ...staff, controller.listStaff);
router.get('/support-requests/:requestId', ...staff, controller.getStaff);
router.post('/support-requests/:requestId/reply', ...staff, controller.replyAsStaff);
router.post('/support-requests/:requestId/close', ...staff, controller.closeAsStaff);

module.exports = router;
