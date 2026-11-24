// src/modules/emailTemplates/emailTemplates.controller.js
const service = require('./emailTemplates.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const handler = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await fn(req) }); } catch (err) { next(err); }
};

module.exports = {
  list: handler(() => service.list()),
  get: handler((req) => service.get(req.params.key)),
  versions: handler((req) => service.versions(req.params.key)),
  save: handler((req) => service.save(req.params.key, req.body, contextOf(req))),
  preview: handler((req) => service.preview(req.params.key, req.body)),
};
