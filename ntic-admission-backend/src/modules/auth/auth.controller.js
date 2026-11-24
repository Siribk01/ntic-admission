// src/modules/auth/auth.controller.js
// HTTP only: read the request, call the service, send the response.

const service = require('./auth.service');
const { getRequestContext } = require('../../utils/requestContext');

async function register(req, res, next) {
  try {
    const user = await service.registerApplicant(req.body, getRequestContext(req));
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await service.login(req.body, getRequestContext(req));
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

// Returns the signed-in user (set by the authenticate middleware)
async function me(req, res) {
  res.status(200).json({ data: req.user });
}

module.exports = { register, login, me };