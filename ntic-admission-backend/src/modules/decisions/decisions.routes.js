// src/modules/decisions/decisions.routes.js
// Parent-facing. Mounted at /applications.

const express = require('express');
const controller = require('./decisions.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.use(authenticate, authorize(ROLES.APPLICANT));

router.get('/:applicationId/status', controller.getStatusForParent);
router.post('/:applicationId/information-response', controller.respondToInformationRequest);
router.post('/:applicationId/withdraw', controller.withdraw);
router.post('/:applicationId/offer/accept', controller.acceptOffer);
router.post('/:applicationId/offer/decline', controller.declineOffer);

module.exports = router;
