// src/modules/options/options.controller.js
const service = require('./options.service');

async function getOptions(req, res, next) {
  try { res.status(200).json({ data: await service.getOptions() }); } catch (err) { next(err); }
}

module.exports = { getOptions };
