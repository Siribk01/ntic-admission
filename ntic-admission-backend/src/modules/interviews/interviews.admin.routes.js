// src/modules/interviews/interviews.admin.routes.js
// Staff and interviewers. Mounted at /admin. Campus scope and "assigned to me" are enforced in the service.
// Per-route middleware only (never router.use), so this router cannot block other routers mounted at /admin.

const express = require('express');
const controller = require('./interviews.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const { CENTRAL_ADMIN, CAMPUS_OFFICER, REVIEWER, INTERVIEWER } = ROLES;
const admin = [authenticate, authorize(CENTRAL_ADMIN)];
const staff = [authenticate, authorize(CENTRAL_ADMIN, CAMPUS_OFFICER)];
const staffOrInterviewer = [authenticate, authorize(CENTRAL_ADMIN, CAMPUS_OFFICER, INTERVIEWER)];
const everyone = [authenticate, authorize(CENTRAL_ADMIN, CAMPUS_OFFICER, REVIEWER, INTERVIEWER)];
const interviewerOnly = [authenticate, authorize(INTERVIEWER)];

router.get('/interviewers', ...staff, controller.listInterviewers);
router.get('/interviews', ...everyone, controller.listInterviews);

router.get('/applications/:applicationId/interview', ...everyone, controller.getInterview);
router.put('/applications/:applicationId/interview', ...staff, controller.scheduleInterview);
router.post('/applications/:applicationId/interview/cancel', ...staff, controller.cancelInterview);
router.post('/applications/:applicationId/interview/outcome', ...staffOrInterviewer, controller.recordOutcome);

router.get('/applications/:applicationId/interview/scorecard', ...everyone, controller.getScorecard);
router.put('/applications/:applicationId/interview/scorecard', ...interviewerOnly, controller.saveScorecard);
router.post('/applications/:applicationId/interview/scorecard/submit', ...interviewerOnly, controller.submitScorecard);
router.post('/applications/:applicationId/interview/scorecard/reopen', ...admin, controller.reopenScorecard);

router.get('/scorecard-criteria', ...everyone, controller.listCriteria);
router.post('/scorecard-criteria', ...admin, controller.createCriterion);
router.patch('/scorecard-criteria/:criterionId', ...admin, controller.updateCriterion);

module.exports = router;
