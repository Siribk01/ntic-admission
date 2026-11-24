// src/modules/results/results.controller.js
const service = require('./results.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const wrap = (handler, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await handler(req) }); } catch (err) { next(err); }
};

module.exports = {
  setAttendance: wrap((req) => service.setAttendance(req.params.applicationId, req.body, contextOf(req))),
  getRoster: wrap((req) => service.getRoster(req.params.slotId, req.user)),
  bulkAttendance: wrap((req) => service.bulkAttendance(req.params.slotId, req.body, contextOf(req))),
  getResult: wrap((req) => service.getResult(req.params.applicationId, req.user)),
  enterResult: wrap((req) => service.enterResult(req.params.applicationId, req.body, contextOf(req))),
  reviewResult: wrap((req) => service.reviewResult(req.params.applicationId, contextOf(req))),
  importResults: wrap((req) => service.importResults(req.file, req.query, contextOf(req))),
};
