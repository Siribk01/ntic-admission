// src/modules/settings/settings.controller.js
const service = require('./settings.service');
const { getRequestContext } = require('../../utils/requestContext');

async function listSettings(req, res, next) {
  try { res.status(200).json({ data: await service.listSettings() }); }
  catch (err) { next(err); }
}
async function updateSettings(req, res, next) {
  try {
    res.status(200).json({ data: await service.updateSettings(req.body, { actor: req.user, ...getRequestContext(req) }) });
  } catch (err) { next(err); }
}

module.exports = { listSettings, updateSettings };
