// src/modules/jobs/jobs.admin.routes.js
// Mounted at /admin. Central admins only.
// The permission check is on each route (not router.use), so it can never block requests meant for other /admin routers.

const express = require('express');
const controller = require('./jobs.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/jobs', ...adminOnly, controller.getStatus);
router.post('/jobs/run', ...adminOnly, controller.runNow);

module.exports = router;
