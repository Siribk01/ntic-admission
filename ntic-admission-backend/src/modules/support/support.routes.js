// src/modules/support/support.routes.js
// Mounted at /support. A parent's own requests.
const express = require('express');
const controller = require('./support.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const parent = [authenticate, authorize(ROLES.APPLICANT)];

router.post('/', ...parent, controller.create);
router.get('/', ...parent, controller.listMine);
router.get('/:requestId', ...parent, controller.getMine);
router.post('/:requestId/messages', ...parent, controller.replyAsParent);
router.post('/:requestId/close', ...parent, controller.closeAsParent);

module.exports = router;
