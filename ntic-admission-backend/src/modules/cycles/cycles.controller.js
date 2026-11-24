// src/modules/cycles/cycles.controller.js
const service = require('./cycles.service');
const { getRequestContext } = require('../../utils/requestContext');

// Who is doing this, and from where (for the audit log)
const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });

async function createCycle(req, res, next) {
  try {
    res.status(201).json({ data: await service.createCycle(req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function listAllCycles(req, res, next) {
  try {
    res.status(200).json({ data: await service.listAllCycles() });
  } catch (err) {
    next(err);
  }
}

async function getCycle(req, res, next) {
  try {
    res.status(200).json({ data: await service.getCycle(req.params.cycleId) });
  } catch (err) {
    next(err);
  }
}

async function listPublicCycles(req, res, next) {
  try {
    res.status(200).json({ data: await service.listPublicCycles() });
  } catch (err) {
    next(err);
  }
}

async function updateCycle(req, res, next) {
  try {
    res.status(200).json({ data: await service.updateCycle(req.params.cycleId, req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function activateCycle(req, res, next) {
  try {
    res.status(200).json({ data: await service.activateCycle(req.params.cycleId, req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function closeCycle(req, res, next) {
  try {
    res.status(200).json({ data: await service.closeCycle(req.params.cycleId, req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function reopenCycle(req, res, next) {
  try {
    res.status(200).json({ data: await service.reopenCycle(req.params.cycleId, req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCycle,
  listAllCycles,
  getCycle,
  listPublicCycles,
  updateCycle,
  activateCycle,
  closeCycle,
  reopenCycle,
};