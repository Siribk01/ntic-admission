// src/modules/support/support.controller.js
const service = require('./support.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const handler = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await fn(req) }); } catch (err) { next(err); }
};

module.exports = {
  create: handler((req) => service.create(req.body, contextOf(req)), 201),
  listMine: handler((req) => service.listMine(req.user)),
  getMine: handler((req) => service.getMine(req.params.requestId, req.user)),
  replyAsParent: handler((req) => service.replyAsParent(req.params.requestId, req.body, contextOf(req)), 201),
  closeAsParent: handler((req) => service.closeAsParent(req.params.requestId, contextOf(req))),
  listStaff: handler((req) => service.listForStaff(req.query, req.user)),
  getStaff: handler((req) => service.getForStaff(req.params.requestId, req.user)),
  replyAsStaff: handler((req) => service.replyAsStaff(req.params.requestId, req.body, contextOf(req)), 201),
  closeAsStaff: handler((req) => service.closeAsStaff(req.params.requestId, contextOf(req))),
};
