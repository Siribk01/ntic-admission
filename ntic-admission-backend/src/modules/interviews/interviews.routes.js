// src/modules/interviews/interviews.routes.js
// Parent-facing. Mounted at /applications. Per-route middleware, like the staff router.

const express = require('express');
const controller = require('./interviews.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();

router.get('/:applicationId/interview', authenticate, authorize(ROLES.APPLICANT), controller.getInterviewForParent);

module.exports = router;
