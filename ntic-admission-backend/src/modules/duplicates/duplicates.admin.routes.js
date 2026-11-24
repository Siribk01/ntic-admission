// src/modules/duplicates/duplicates.admin.routes.js
// Mounted under /admin.
const express = require('express');
const controller = require('./duplicates.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const staff = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER)];

router.get('/duplicates', ...staff, controller.list);
router.post('/duplicates/dismiss', ...staff, controller.dismiss);
router.post('/duplicates/restore', ...staff, controller.restore);

module.exports = router;
