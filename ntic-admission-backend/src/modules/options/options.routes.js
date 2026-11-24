// src/modules/options/options.routes.js
// Mounted at /application-options. Any signed-in user may read these lists.
const express = require('express');
const controller = require('./options.controller');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();
router.get('/', authenticate, controller.getOptions);

module.exports = router;
