// src/modules/onlinePayments/onlinePayments.controller.js
const service = require('./onlinePayments.service');
const { forProvider, activeGateway } = require('./gateways');
const { getRequestContext } = require('../../utils/requestContext');
const { validate } = require('../../utils/validate');
const { simulateSchema } = require('./onlinePayments.validation');
const AppError = require('../../utils/AppError');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const wrap = (handler, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await handler(req) }); } catch (err) { next(err); }
};
const appId = (req) => req.params.applicationId;

module.exports = {
  // parent
  initiatePayment: wrap((req) => service.initiatePayment(appId(req), req.body, req.user), 201),
  listAttempts: wrap((req) => service.listAttemptsForParent(appId(req), req.user)),
  getAttempt: wrap((req) => service.getAttemptForParent(appId(req), req.params.reference, req.user)),
  verifyAttempt: wrap((req) => service.verifyForParent(appId(req), req.params.reference, req.user)),
  submitClaim: wrap((req) => service.submitClaim(appId(req), req.body, req.user), 201),
  listMyClaims: wrap((req) => service.listClaimsForParent(appId(req), req.user)),
  // staff
  listAttemptsForStaff: wrap((req) => service.listAttemptsForStaff(req.query, req.user)),
  settleForStaff: wrap((req) => service.settleForStaff(req.params.attemptId, contextOf(req))),
  listClaimsForStaff: wrap((req) => service.listClaimsForStaff(req.query, req.user)),
  confirmClaim: wrap((req) => service.confirmClaim(req.params.claimId, contextOf(req))),
  rejectClaim: wrap((req) => service.rejectClaim(req.params.claimId, req.body, contextOf(req))),

  // gateway -> us. Receives the RAW body (see webhooks.routes.js), because the signature is calculated over exact bytes.
  async webhook(req, res, next) {
    try {
      const { httpStatus, body } = await service.handleWebhook(req.params.provider, req.body, req.headers);
      res.status(httpStatus).json(body);
    } catch (err) { next(err); }
  },

  // Development only: pretend the parent paid, without any real gateway. Only works with PAYMENT_PROVIDER=mock.
  async simulateMock(req, res, next) {
    try {
      const gateway = activeGateway();
      if (!gateway || gateway.name !== 'mock' || process.env.NODE_ENV === 'production') throw AppError.notFound('Not found');
      const data = validate(simulateSchema, req.body);
      if (data.broken !== undefined) forProvider('mock').setBroken(data.broken);
      if (!data.reference) return res.json({ data: { broken: data.broken } });
      if (!forProvider('mock').simulate(data.reference, data)) throw AppError.notFound('Unknown payment reference');
      if (!data.webhook) return res.json({ data: { simulated: true } });
      const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: Date.now(), reference: data.reference } }));
      const result = await service.handleWebhook('mock', raw, { 'x-mock-signature': forProvider('mock').sign(raw) });
      return res.status(result.httpStatus).json({ data: { simulated: true, webhook: result.body } });
    } catch (err) { return next(err); }
  },
};
