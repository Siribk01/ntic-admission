// src/modules/printables/printables.routes.js
// Mounted under /applications. A parent downloads their own child's documents.
// Per-route middleware (not router.use) so this router never blocks other routers mounted on the same path.
const express = require('express');
const controller = require('./printables.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const parent = [authenticate, authorize(ROLES.APPLICANT)];

router.get('/:applicationId/payments/:paymentId/receipt.pdf', ...parent, controller.receiptForParent);
router.get('/:applicationId/exam/card.pdf', ...parent, controller.examCardForParent);
router.get('/:applicationId/offer-letter.pdf', ...parent, controller.offerLetterForParent);

module.exports = router;
