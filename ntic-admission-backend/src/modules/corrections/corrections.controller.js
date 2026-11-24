// src/modules/corrections/corrections.controller.js
const service = require('./corrections.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const handler = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await fn(req) }); } catch (err) { next(err); }
};

module.exports = {
  create: handler((req) => service.createForParent(req.params.applicationId, req.body, contextOf(req)), 201),
  listMine: handler((req) => service.listForParent(req.params.applicationId, req.user)),
  cancel: handler((req) => service.cancelForParent(req.params.applicationId, req.params.correctionId, contextOf(req))),
  listStaff: handler((req) => service.listForStaff(req.query, req.user)),
  approve: handler((req) => service.approve(req.params.correctionId, req.body, contextOf(req))),
  reject: handler((req) => service.reject(req.params.correctionId, req.body, contextOf(req))),
};
