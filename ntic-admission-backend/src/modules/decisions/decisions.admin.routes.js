// src/modules/decisions/decisions.admin.routes.js
// Staff review. Mounted at /admin. Campus scope is enforced in the service.

const express = require('express');
const controller = require('./decisions.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const readers = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.REVIEWER)];
// Who may act on applications. (Single approver for now; a second-approval switch is a later addition.)
const deciders = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER)];

router.get('/applications', ...readers, controller.listApplications);
router.get('/applications/:applicationId', ...readers, controller.getApplicationForStaff);
router.post('/applications/:applicationId/request-information', ...deciders, controller.requestInformation);
router.post('/applications/:applicationId/send-for-decision', ...deciders, controller.sendForDecision);
router.post('/applications/:applicationId/decision', ...deciders, controller.decide);
router.post('/applications/:applicationId/reopen', authenticate, authorize(ROLES.CENTRAL_ADMIN), controller.reopen);

module.exports = router;
