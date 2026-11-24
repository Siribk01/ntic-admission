// src/modules/account/account.controller.js
const service = require('./account.service');
const { getRequestContext } = require('../../utils/requestContext');

const wrap = (handler) => async (req, res, next) => {
  try { res.status(200).json({ data: await handler(req) }); } catch (err) { next(err); }
};

module.exports = {
  verifyEmail: wrap((req) => service.verifyEmail(req.body, getRequestContext(req))),
  resendVerification: wrap((req) => service.resendVerification(req.user.id)),
  getEmailStatus: wrap((req) => service.getEmailStatus(req.user.id)),
  forgotPassword: wrap((req) => service.forgotPassword(req.body, getRequestContext(req))),
  resetPassword: wrap((req) => service.resetPassword(req.body, getRequestContext(req))),
  changePassword: wrap((req) => service.changePassword(req.user.id, req.body, getRequestContext(req))),
};
