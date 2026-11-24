// src/modules/corrections/corrections.admin.routes.js
// Mounted under /admin. Campus officers (their campuses) and central administrators.
const express = require('express');
const controller = require('./corrections.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER)];

router.get('/corrections', ...staff, controller.listStaff);
router.post('/corrections/:correctionId/approve', ...staff, controller.approve);
router.post('/corrections/:correctionId/reject', ...staff, controller.reject);

module.exports = router;
