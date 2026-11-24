// src/modules/applications/applications.routes.js
// Parent-facing. Signed-in applicant (parent) role only.

const express = require('express');
const controller = require('./applications.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.use(authenticate, authorize(ROLES.APPLICANT));

router.post('/', controller.createApplication);
router.get('/', controller.listApplications);
router.get('/:applicationId', controller.getApplication);
router.patch('/:applicationId', controller.updateApplication);
router.post('/:applicationId/submit', controller.submitApplication);

module.exports = router;
