// src/modules/health/health.controller.js
const service = require('./health.service');

async function live(req, res) {
  const { httpStatus, body } = await service.liveness();
  res.status(httpStatus).set('Cache-Control', 'no-store').json(body);
}
async function report(req, res, next) {
  try { res.status(200).set('Cache-Control', 'no-store').json({ data: await service.report() }); } catch (err) { next(err); }
}

module.exports = { live, report };
