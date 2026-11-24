// src/modules/examinations/examinations.routes.js
// Parent-facing: see the exam, see available dates, choose or change a date. Mounted at /applications.

const express = require('express');
const controller = require('./examinations.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.use(authenticate, authorize(ROLES.APPLICANT));

router.get('/:applicationId/exam', controller.getExamForParent);
router.get('/:applicationId/exam/slots', controller.listSlotsForParent);
router.put('/:applicationId/exam', controller.scheduleExamAsParent);

module.exports = router;
