// src/modules/corrections/corrections.routes.js
// Mounted under /applications. A parent asks for a correction to their own child's submitted application.
const express = require('express');
const controller = require('./corrections.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const parent = [authenticate, authorize(ROLES.APPLICANT)];

router.post('/:applicationId/corrections', ...parent, controller.create);
router.get('/:applicationId/corrections', ...parent, controller.listMine);
router.post('/:applicationId/corrections/:correctionId/cancel', ...parent, controller.cancel);

module.exports = router;
