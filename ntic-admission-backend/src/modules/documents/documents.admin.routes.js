// src/modules/documents/documents.admin.routes.js
// Staff viewing an application's documents. Mounted at /admin. Campus scope is enforced in the service.

const express = require('express');
const controller = require('./documents.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();

router.get(
  '/applications/:applicationId/documents/:typeCode/file',
  authenticate,
  authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.REVIEWER),
  controller.downloadForStaff
);

module.exports = router;
