// src/modules/documents/documents.controller.js
const service = require('./documents.service');

async function listTypes(req, res, next) {
  try { res.status(200).json({ data: await service.listTypes() }); }
  catch (err) { next(err); }
}
async function listDocuments(req, res, next) {
  try { res.status(200).json({ data: await service.listDocuments(req.user, req.params.applicationId) }); }
  catch (err) { next(err); }
}
async function uploadDocument(req, res, next) {
  try {
    const { applicationId, typeCode } = req.params;
    res.status(200).json({ data: await service.uploadDocument(req.user, applicationId, typeCode, req.file) });
  } catch (err) { next(err); }
}
async function removeDocument(req, res, next) {
  try {
    await service.removeDocument(req.user, req.params.applicationId, req.params.typeCode);
    res.status(204).end();
  } catch (err) { next(err); }
}

// Streams the file. Sent as "inline" so photos open in the browser, never as a page the browser would run.
function sendFile({ document, stream }, res, next) {
  const safeName = document.originalName.replace(/[^\w.\- ]/g, '_');
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', document.sizeBytes);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  stream.on('error', (err) => {
    if (err.code === 'ENOENT') return next(Object.assign(new Error('File is missing on the server'), { statusCode: 500 }));
    return next(err);
  });
  stream.pipe(res);
}

async function downloadForParent(req, res, next) {
  try { sendFile(await service.openForParent(req.user, req.params.applicationId, req.params.typeCode), res, next); }
  catch (err) { next(err); }
}
async function downloadForStaff(req, res, next) {
  try { sendFile(await service.openForStaff(req.user, req.params.applicationId, req.params.typeCode), res, next); }
  catch (err) { next(err); }
}

module.exports = { listTypes, listDocuments, uploadDocument, removeDocument, downloadForParent, downloadForStaff };
