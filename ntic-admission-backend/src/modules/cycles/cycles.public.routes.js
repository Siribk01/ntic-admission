// src/modules/cycles/cycles.public.routes.js
// No sign-in needed: applicants must be able to see which intakes exist.

const express = require('express');
const controller = require('./cycles.controller');

const router = express.Router();

router.get('/', controller.listPublicCycles);

module.exports = router;