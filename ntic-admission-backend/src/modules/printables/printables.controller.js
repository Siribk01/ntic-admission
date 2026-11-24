// src/modules/printables/printables.controller.js
const service = require('./printables.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });

// A PDF is shown in the browser (inline) and never cached by shared caches: it holds a child's personal details
function sendPdf(res, { filename, buffer }) {
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Content-Length': buffer.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }).end(buffer);
}
const pdfHandler = (fn) => async (req, res, next) => {
  try { sendPdf(res, await fn(req)); } catch (err) { next(err); }
};
const jsonHandler = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await fn(req) }); } catch (err) { next(err); }
};

module.exports = {
  // parent
  receiptForParent: pdfHandler((req) => service.receiptForParent(req.params.applicationId, req.params.paymentId, req.user)),
  examCardForParent: pdfHandler((req) => service.examCardForParent(req.params.applicationId, req.user)),
  offerLetterForParent: pdfHandler((req) => service.offerLetterForParent(req.params.applicationId, req.user)),
  // staff
  receiptForStaff: pdfHandler((req) => service.receiptForStaff(req.params.paymentId, req.user)),
  examCardForStaff: pdfHandler((req) => service.examCardForStaff(req.params.applicationId, req.user)),
  offerLetterForStaff: pdfHandler((req) => service.offerLetterForStaff(req.params.applicationId, req.user)),
  resetOfferLetter: jsonHandler((req) => service.resetOfferLetter(req.params.applicationId, contextOf(req))),
  // templates
  listTemplates: jsonHandler(() => service.listTemplates()),
  getTemplate: jsonHandler((req) => service.getTemplate(req.params.key)),
  listVersions: jsonHandler((req) => service.listVersions(req.params.key)),
  updateTemplate: jsonHandler((req) => service.updateTemplate(req.params.key, req.body, contextOf(req))),
  previewTemplate: pdfHandler((req) => service.previewTemplate(req.params.key, req.body)),
};
