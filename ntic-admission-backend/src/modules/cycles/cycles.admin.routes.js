// src/modules/cycles/cycles.admin.routes.js
// Central administrators only. Mounted under /admin.

const express = require('express');
const controller = require('./cycles.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.post('/cycles', ...adminOnly, controller.createCycle);
router.get('/cycles', ...adminOnly, controller.listAllCycles);
router.get('/cycles/:cycleId', ...adminOnly, controller.getCycle);
router.patch('/cycles/:cycleId', ...adminOnly, controller.updateCycle);
router.post('/cycles/:cycleId/activate', ...adminOnly, controller.activateCycle);
router.post('/cycles/:cycleId/close', ...adminOnly, controller.closeCycle);
router.post('/cycles/:cycleId/reopen', ...adminOnly, controller.reopenCycle);

module.exports = router;