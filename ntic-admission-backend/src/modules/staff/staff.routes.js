// src/modules/staff/staff.routes.js
// Everything here is for central administrators only.

const express = require('express');
const controller = require('./staff.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();

router.post('/staff', authenticate, authorize(ROLES.CENTRAL_ADMIN), controller.createStaff);

module.exports = router;