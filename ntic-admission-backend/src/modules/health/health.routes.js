// src/modules/health/health.routes.js
// PUBLIC and tiny: mounted at /health for uptime monitors and load balancers. It says only "ok" or "unavailable".
const express = require('express');
const controller = require('./health.controller');

const router = express.Router();
router.get('/', controller.live);

module.exports = router;
