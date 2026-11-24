// src/modules/audit/audit.controller.js
const service = require('./audit.service');

async function listAuditLogs(req, res, next) {
  try {
    const { items, page } = await service.listLogs(req.query);
    res.status(200).json({ data: items, page });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs };