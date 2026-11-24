// src/modules/decisions/decisions.controller.js
const service = require('./decisions.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const wrap = (handler, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await handler(req) }); } catch (err) { next(err); }
};
const id = (req) => req.params.applicationId;

module.exports = {
  listApplications: wrap((req) => service.listApplications(req.query, req.user)),
  getApplicationForStaff: wrap((req) => service.getApplicationForStaff(id(req), req.user)),
  requestInformation: wrap((req) => service.requestInformation(id(req), req.body, contextOf(req))),
  sendForDecision: wrap((req) => service.sendForDecision(id(req), req.body, contextOf(req))),
  decide: wrap((req) => service.decide(id(req), req.body, contextOf(req))),
  reopen: wrap((req) => service.reopen(id(req), req.body, contextOf(req))),
  getStatusForParent: wrap((req) => service.getStatusForParent(id(req), req.user)),
  respondToInformationRequest: wrap((req) => service.respondToInformationRequest(id(req), req.body, contextOf(req))),
  withdraw: wrap((req) => service.withdraw(id(req), req.body, contextOf(req))),
  acceptOffer: wrap((req) => service.respondToOffer(id(req), true, contextOf(req))),
  declineOffer: wrap((req) => service.respondToOffer(id(req), false, contextOf(req))),
};
