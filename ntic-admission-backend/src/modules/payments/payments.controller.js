// src/modules/payments/payments.controller.js
const service = require('./payments.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });

async function createPayment(req, res, next) {
  try { res.status(201).json({ data: await service.createPayment(req.body, contextOf(req)) }); }
  catch (err) { next(err); }
}
async function reversePayment(req, res, next) {
  try { res.status(200).json({ data: await service.reversePayment(req.params.paymentId, req.body, contextOf(req)) }); }
  catch (err) { next(err); }
}
async function listPaymentsForStaff(req, res, next) {
  try { res.status(200).json({ data: await service.listPaymentsForStaff(req.query, req.user) }); }
  catch (err) { next(err); }
}
async function listMyPayments(req, res, next) {
  try { res.status(200).json({ data: await service.listMyPayments(req.query, req.user) }); }
  catch (err) { next(err); }
}

module.exports = { createPayment, reversePayment, listPaymentsForStaff, listMyPayments };
