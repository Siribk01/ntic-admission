// src/modules/settings/settings.admin.routes.js
// Mounted at /admin. Central admins only.
// The permission check is on each route (not router.use), so it can never block requests meant for other /admin routers.

const express = require('express');
const controller = require('./settings.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/settings', ...adminOnly, controller.listSettings);
router.patch('/settings', ...adminOnly, controller.updateSettings);

module.exports = router;
