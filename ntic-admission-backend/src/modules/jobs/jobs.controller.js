// src/modules/jobs/jobs.controller.js
const service = require('./jobs.service');
const scheduler = require('./jobs.scheduler');
const { getRequestContext } = require('../../utils/requestContext');

async function getStatus(req, res, next) {
  try { res.status(200).json({ data: { scheduled: scheduler.isScheduled(), ...(await service.getStatus()) } }); }
  catch (err) { next(err); }
}
async function runNow(req, res, next) {
  try {
    res.status(200).json({ data: { results: await service.runNow(req.body, { actor: req.user, ...getRequestContext(req) }) } });
  } catch (err) { next(err); }
}

module.exports = { getStatus, runNow };
