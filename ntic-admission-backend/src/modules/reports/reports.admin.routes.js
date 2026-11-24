// src/modules/reports/reports.admin.routes.js
// Mounted under /admin.
const express = require('express');
const controller = require('./reports.controller');
const { DATASETS } = require('./reports.service');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { ipRateLimit } = require('../../utils/ipRateLimit');
const { ROLES } = require('../../constants/roles');

const router = express.Router();
const everyone = [authenticate, authorize(ROLES.CENTRAL_ADMIN, ROLES.CAMPUS_OFFICER, ROLES.REVIEWER, ROLES.FINANCE_OFFICER)];
// Exports are heavy and copy personal data, so they are rate limited (default 30 per 15 minutes per address)
const exportLimit = ipRateLimit({ limit: Number(process.env.EXPORT_RATE_LIMIT) || 30, windowMs: 15 * 60 * 1000 });

router.get('/dashboard', ...everyone, controller.dashboard);

for (const [dataset, def] of Object.entries(DATASETS)) {
  for (const format of ['csv', 'xlsx']) {
    router.get(`/exports/${dataset}.${format}`, authenticate, authorize(...def.roles), exportLimit, controller.exportHandler(dataset, format));
  }
}

module.exports = router;
