// src/modules/applicants/applicants.routes.js
// Parent-facing. Every route needs a signed-in user with the applicant (parent) role.

const express = require('express');
const controller = require('./applicants.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.use(authenticate, authorize(ROLES.APPLICANT));

router.post('/', controller.createApplicant);
router.get('/', controller.listApplicants);
router.get('/:applicantId', controller.getApplicant);
router.patch('/:applicantId', controller.updateApplicant);
router.put('/:applicantId/guardians/:relationship', controller.saveGuardian);
router.delete('/:applicantId/guardians/:relationship', controller.removeGuardian);

module.exports = router;
