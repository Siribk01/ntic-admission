// src/modules/locations/locations.routes.js
// Maps URLs to controller functions. No logic here.

const express = require('express');
const controller = require('./locations.controller');

const router = express.Router();

router.get('/states', controller.listStates);
router.get('/states/:stateId/campuses', controller.listCampuses);
router.get('/categories', controller.listCategories);

module.exports = router;