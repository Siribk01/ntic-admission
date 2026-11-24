// src/routes/index.js
// Every API module is mounted here, under /api/v1.

const express = require('express');
const locationsRoutes = require('../modules/locations/locations.routes');
const authRoutes = require('../modules/auth/auth.routes');
const staffRoutes = require('../modules/staff/staff.routes');
const auditRoutes = require('../modules/audit/audit.routes');
const cyclesPublicRoutes = require('../modules/cycles/cycles.public.routes');
const cyclesAdminRoutes = require('../modules/cycles/cycles.admin.routes');
const feesPublicRoutes = require('../modules/fees/fees.public.routes');
const feesAdminRoutes = require('../modules/fees/fees.admin.routes');

const router = express.Router();

router.use('/locations', locationsRoutes);
router.use('/auth', authRoutes);
router.use('/cycles', cyclesPublicRoutes);
router.use('/fees', feesPublicRoutes);
router.use('/admin', staffRoutes);
router.use('/admin', auditRoutes);
router.use('/admin', cyclesAdminRoutes);
router.use('/admin', feesAdminRoutes);
router.use('/payments', require('../modules/payments/payments.routes'));
router.use('/applicants', require('../modules/applicants/applicants.routes'));
router.use('/applications', require('../modules/applications/applications.routes'));
router.use('/applications', require('../modules/examinations/examinations.routes'));
router.use('/admin', require('../modules/examinations/examinations.admin.routes'));
router.use('/applications', require('../modules/documents/documents.routes'));
router.use('/document-types', require('../modules/documents/documentTypes.routes'));
router.use('/admin', require('../modules/documents/documents.admin.routes'));
router.use('/applications', require('../modules/decisions/decisions.routes'));
router.use('/admin', require('../modules/decisions/decisions.admin.routes'));
router.use('/admin', require('../modules/notifications/notifications.admin.routes'));
router.use('/admin', require('../modules/settings/settings.admin.routes'));
router.use('/admin', require('../modules/jobs/jobs.admin.routes'));
router.use('/auth', require('../modules/account/account.routes'));
router.use('/admin', require('../modules/results/results.admin.routes'));
router.use('/admin', require('../modules/interviews/interviews.admin.routes'));
router.use('/applications', require('../modules/interviews/interviews.routes'));
router.use('/applications', require('../modules/onlinePayments/onlinePayments.routes'));
router.use('/admin', require('../modules/onlinePayments/onlinePayments.admin.routes'));
router.use('/applications', require('../modules/printables/printables.routes'));
router.use('/admin', require('../modules/printables/printables.admin.routes'));
router.use('/admin', require('../modules/reports/reports.admin.routes'));
router.use('/admin', require('../modules/documents/documentTypes.admin.routes'));
router.use('/admin', require('../modules/duplicates/duplicates.admin.routes'));
router.use('/admin', require('../modules/health/health.admin.routes'));
router.use('/health', require('../modules/health/health.routes'));
router.use('/admin', require('../modules/emailTemplates/emailTemplates.admin.routes'));
router.use('/applications', require('../modules/corrections/corrections.routes'));
router.use('/admin', require('../modules/corrections/corrections.admin.routes'));
router.use('/support', require('../modules/support/support.routes'));
router.use('/admin', require('../modules/support/support.admin.routes'));
router.use('/application-options', require('../modules/options/options.routes'));
router.use('/admin', require('../modules/setup/setup.admin.routes'));


module.exports = router;