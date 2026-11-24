// src/modules/applications/applications.controller.js
const service = require('./applications.service');

async function createApplication(req, res, next) {
  try { res.status(201).json({ data: await service.createApplication(req.user, req.body) }); }
  catch (err) { next(err); }
}
async function listApplications(req, res, next) {
  try { res.status(200).json({ data: await service.listApplications(req.user) }); }
  catch (err) { next(err); }
}
async function getApplication(req, res, next) {
  try { res.status(200).json({ data: await service.getApplication(req.user, req.params.applicationId) }); }
  catch (err) { next(err); }
}
async function updateApplication(req, res, next) {
  try { res.status(200).json({ data: await service.updateApplication(req.user, req.params.applicationId, req.body) }); }
  catch (err) { next(err); }
}

async function submitApplication(req, res, next) {
  try { res.status(200).json({ data: await service.submitApplication(req.user, req.params.applicationId) }); }
  catch (err) { next(err); }
}

module.exports = { createApplication, listApplications, getApplication, updateApplication, submitApplication };
