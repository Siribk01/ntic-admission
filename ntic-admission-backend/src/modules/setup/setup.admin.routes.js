// src/modules/setup/setup.admin.routes.js
// Mounted at /admin. Central admins only. The check is on each route (never router.use), so it cannot block other /admin routers.
const express = require('express');
const c = require('./setup.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const admin = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/cycles', ...admin, c.listCycles);
router.post('/cycles', ...admin, c.createCycle);
router.patch('/cycles/:cycleId', ...admin, c.updateCycle);
router.put('/cycles/:cycleId/categories', ...admin, c.setCycleCategories);

router.get('/categories', ...admin, c.listCategories);
router.post('/categories', ...admin, c.createCategory);
router.patch('/categories/:categoryId', ...admin, c.updateCategory);

router.get('/campuses', ...admin, c.listCampuses);
router.post('/campuses', ...admin, c.createCampus);
router.patch('/campuses/:campusId', ...admin, c.updateCampus);

router.get('/fee-rules', ...admin, c.listFees);
router.post('/fee-rules', ...admin, c.createFee);
router.patch('/fee-rules/:feeId', ...admin, c.updateFee);

router.get('/staff', ...admin, c.listStaff);
router.post('/staff', ...admin, c.createStaff);
router.patch('/staff/:userId', ...admin, c.updateStaff);
router.post('/staff/:userId/reset-password', ...admin, c.resetStaffPassword);

module.exports = router;
