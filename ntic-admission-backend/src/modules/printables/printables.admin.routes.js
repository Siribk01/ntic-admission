// src/modules/printables/printables.admin.routes.js
// Mounted under /admin.
const express = require('express');
const controller = require('./printables.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const money = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.FINANCE_OFFICER)];
const officers = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER)];
const adminOnly = [authenticate, authorize(ROLES.CENTRAL_ADMIN)];

router.get('/payments/:paymentId/receipt.pdf', ...money, controller.receiptForStaff);
router.get('/applications/:applicationId/exam/card.pdf', ...officers, controller.examCardForStaff);
router.get('/applications/:applicationId/offer-letter.pdf', ...officers, controller.offerLetterForStaff);
router.post('/applications/:applicationId/offer-letter/reset', ...adminOnly, controller.resetOfferLetter);

router.get('/print-templates', ...adminOnly, controller.listTemplates);
router.get('/print-templates/:key', ...adminOnly, controller.getTemplate);
router.get('/print-templates/:key/versions', ...adminOnly, controller.listVersions);
router.put('/print-templates/:key', ...adminOnly, controller.updateTemplate);
router.post('/print-templates/:key/preview', ...adminOnly, controller.previewTemplate);

module.exports = router;
