// src/modules/applicants/applicants.controller.js
const service = require('./applicants.service');

async function createApplicant(req, res, next) {
  try { res.status(201).json({ data: await service.createApplicant(req.user, req.body) }); }
  catch (err) { next(err); }
}
async function listApplicants(req, res, next) {
  try { res.status(200).json({ data: await service.listApplicants(req.user) }); }
  catch (err) { next(err); }
}
async function getApplicant(req, res, next) {
  try { res.status(200).json({ data: await service.getApplicant(req.user, req.params.applicantId) }); }
  catch (err) { next(err); }
}
async function updateApplicant(req, res, next) {
  try { res.status(200).json({ data: await service.updateApplicant(req.user, req.params.applicantId, req.body) }); }
  catch (err) { next(err); }
}
async function saveGuardian(req, res, next) {
  try {
    const { applicantId, relationship } = req.params;
    res.status(200).json({ data: await service.saveGuardian(req.user, applicantId, relationship, req.body) });
  } catch (err) { next(err); }
}
async function removeGuardian(req, res, next) {
  try {
    await service.removeGuardian(req.user, req.params.applicantId, req.params.relationship);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { createApplicant, listApplicants, getApplicant, updateApplicant, saveGuardian, removeGuardian };
