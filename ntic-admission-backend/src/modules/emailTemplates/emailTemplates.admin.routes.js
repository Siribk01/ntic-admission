// src/modules/emailTemplates/emailTemplates.admin.routes.js
// Mounted under /admin. Central administrators only.
const express = require('express');
const controller = require('./emailTemplates.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/email-templates', ...adminOnly, controller.list);
router.get('/email-templates/:key', ...adminOnly, controller.get);
router.get('/email-templates/:key/versions', ...adminOnly, controller.versions);
router.put('/email-templates/:key', ...adminOnly, controller.save);
router.post('/email-templates/:key/preview', ...adminOnly, controller.preview);

module.exports = router;
