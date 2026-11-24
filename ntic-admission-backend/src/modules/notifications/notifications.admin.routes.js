// src/modules/notifications/notifications.admin.routes.js
// Mounted at /admin. Central admins only: this is the delivery log.
// The permission check is on each route (not router.use), so it can never block requests meant for other /admin routers.

const express = require('express');
const controller = require('./notifications.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/notifications', ...adminOnly, controller.listNotifications);
router.post('/notifications/:notificationId/retry', ...adminOnly, controller.retryNotification);

module.exports = router;
