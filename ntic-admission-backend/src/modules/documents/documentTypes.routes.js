// src/modules/documents/documentTypes.routes.js
// Public: the checklist the application form shows. Mounted at /document-types.

const express = require('express');
const controller = require('./documents.controller');

const router = express.Router();
router.get('/', controller.listTypes);

module.exports = router;
