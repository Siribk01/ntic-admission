// src/modules/examinations/examinations.admin.routes.js
// Staff. Mounted at /admin. Campus scope is enforced in the service.

const express = require('express');
const controller = require('./examinations.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER)];
const readers = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.REVIEWER)];

router.post('/exam-slots', ...staff, controller.createSlot);
router.get('/exam-slots', ...readers, controller.listSlots);
router.get('/exam-slots/:slotId', ...readers, controller.getSlot);
router.patch('/exam-slots/:slotId', ...staff, controller.updateSlot);

router.get('/applications/:applicationId/exam', ...readers, controller.getExamForStaff);
router.put('/applications/:applicationId/exam', ...staff, controller.scheduleExam);
router.post('/applications/:applicationId/exam/cancel', ...staff, controller.cancelExam);

module.exports = router;
