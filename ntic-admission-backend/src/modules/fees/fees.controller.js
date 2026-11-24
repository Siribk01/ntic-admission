// src/modules/fees/fees.controller.js
const service = require('./fees.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });

async function createFeeRule(req, res, next) {
  try {
    res.status(201).json({ data: await service.createFeeRule(req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function listFeeRules(req, res, next) {
  try {
    res.status(200).json({ data: await service.listFeeRules(req.query) });
  } catch (err) {
    next(err);
  }
}

async function getFeeRule(req, res, next) {
  try {
    res.status(200).json({ data: await service.getFeeRule(req.params.ruleId) });
  } catch (err) {
    next(err);
  }
}

async function updateFeeRule(req, res, next) {
  try {
    res.status(200).json({ data: await service.updateFeeRule(req.params.ruleId, req.body, contextOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function listFeeGaps(req, res, next) {
  try {
    res.status(200).json({ data: await service.listFeeGaps() });
  } catch (err) {
    next(err);
  }
}

async function getQuote(req, res, next) {
  try {
    res.status(200).json({ data: await service.getQuote(req.query) });
  } catch (err) {
    next(err);
  }
}

module.exports = { createFeeRule, listFeeRules, getFeeRule, updateFeeRule, listFeeGaps, getQuote };