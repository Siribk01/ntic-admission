// src/modules/reports/reports.controller.js
const service = require('./reports.service');
const { getRequestContext } = require('../../utils/requestContext');

async function dashboard(req, res, next) {
  try { res.status(200).json({ data: await service.getDashboard(req.query, req.user) }); } catch (err) { next(err); }
}

const exportHandler = (dataset, format) => async (req, res, next) => {
  try {
    const file = await service.exportDataset(dataset, format, req.query, { actor: req.user, ...getRequestContext(req) });
    res.status(200).set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': file.buffer.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Row-Count': String(file.rowCount),
    }).end(file.buffer);
  } catch (err) { next(err); }
};

module.exports = { dashboard, exportHandler };
