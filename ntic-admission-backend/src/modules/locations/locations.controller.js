// src/modules/locations/locations.controller.js
// HTTP only: read the request, call the service, send the response.
// Errors are passed to next(err), which hands them to the error handler in app.js.

const service = require('./locations.service');

async function listStates(req, res, next) {
  try {
    const states = await service.getStates();
    res.status(200).json({ data: states });
  } catch (err) {
    next(err);
  }
}

async function listCampuses(req, res, next) {
  try {
    const campuses = await service.getCampusesForState(req.params.stateId);
    res.status(200).json({ data: campuses });
  } catch (err) {
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    const categories = await service.getCategories();
    res.status(200).json({ data: categories });
  } catch (err) {
    next(err);
  }
}

module.exports = { listStates, listCampuses, listCategories };