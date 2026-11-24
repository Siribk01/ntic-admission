// src/modules/documents/documentTypes.admin.routes.js
// Mounted under /admin. Per-route permission checks (never router.use) so other /admin routers are not blocked.
const express = require('express');
const controller = require('./documentTypes.admin.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/document-types', ...adminOnly, controller.list);
router.post('/document-types', ...adminOnly, controller.create);
router.patch('/document-types/:typeId', ...adminOnly, controller.update);

module.exports = router;
