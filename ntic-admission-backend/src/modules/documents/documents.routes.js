// src/modules/documents/documents.routes.js
// Parent-facing. Mounted at /applications (alongside the applications routes).

const express = require('express');
const controller = require('./documents.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { uploadSingleFile } = require('../../middleware/upload');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
router.use(authenticate, authorize(ROLES.APPLICANT));

router.get('/:applicationId/documents', controller.listDocuments);
router.put('/:applicationId/documents/:typeCode', uploadSingleFile, controller.uploadDocument);
router.get('/:applicationId/documents/:typeCode/file', controller.downloadForParent);
router.delete('/:applicationId/documents/:typeCode', controller.removeDocument);

module.exports = router;
