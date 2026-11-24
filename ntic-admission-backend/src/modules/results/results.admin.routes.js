// src/modules/results/results.admin.routes.js
// Staff. Mounted at /admin. Campus scope is enforced in the service.
// Per-route middleware only (never router.use), so this router cannot block other routers mounted at /admin.

const express = require('express');
const controller = require('./results.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { uploadSingleFile } = require('../../middleware/upload');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER)];
const readers = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.REVIEWER)];

// Attendance
router.get('/exam-slots/:slotId/roster', ...readers, controller.getRoster);
router.post('/exam-slots/:slotId/attendance', ...staff, controller.bulkAttendance);
router.post('/applications/:applicationId/exam/attendance', ...staff, controller.setAttendance);

// Results
router.post('/exam-results/import', ...staff, uploadSingleFile, controller.importResults);
router.get('/applications/:applicationId/exam/result', ...readers, controller.getResult);
router.put('/applications/:applicationId/exam/result', ...staff, controller.enterResult);
router.post('/applications/:applicationId/exam/result/review', ...readers, controller.reviewResult);

module.exports = router;
