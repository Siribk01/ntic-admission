// src/modules/documents/documents.service.js
// Uploading, replacing, removing and downloading application documents.

const repo = require('./documents.repository');
const storage = require('../../utils/fileStorage');
const { withTransaction } = require('../../db/pool');
const { assertUuid } = require('../../utils/ids');
const { getCampusScope } = require('../../utils/campusScope');
const AppError = require('../../utils/AppError');

// Documents can be changed while drafting, and when NTIC has asked for more information
const EDITABLE_STATUSES = ['draft', 'information_required'];
const CODE_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
const publicView = ({ storedName, ...rest }) => rest; // the disk name is never shown to anyone

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const MIME_LABEL = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'application/pdf': 'PDF' };

function assertCode(code) {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) throw AppError.badRequest('Document type is not valid');
}

// A parent's own application, or 404 (also when it belongs to someone else)
async function requireOwnApplication(parent, applicationId) {
  assertUuid(applicationId, 'Application id');
  const application = await repo.findApplicationOwnerAndCampus(applicationId);
  if (!application || application.parentUserId !== parent.id) throw AppError.notFound('Application not found');
  return application;
}

async function listTypes() {
  return repo.listActiveTypes();
}

async function listDocuments(parent, applicationId) {
  await requireOwnApplication(parent, applicationId);
  return (await repo.listForApplication(applicationId)).map(publicView);
}

async function uploadDocument(parent, applicationId, code, file) {
  assertUuid(applicationId, 'Application id');
  assertCode(code);

  const type = await repo.findActiveTypeByCode(code);
  if (!type) throw AppError.notFound('Document type not found');

  // Per-type size limit, then the real file type from its content
  if (file.size > type.maxBytes) {
    throw AppError.validation([{ field: 'file', message: `The file is too large. Maximum for this document is ${kb(type.maxBytes)}` }]);
  }
  const detected = storage.detectType(file.buffer);
  if (!detected || !type.allowedMimes.includes(detected.mime)) {
    const allowed = type.allowedMimes.map((m) => MIME_LABEL[m]).join(', ');
    throw AppError.validation([{ field: 'file', message: `This file type is not accepted for this document. Allowed: ${allowed}` }]);
  }

  // Write the file first, then the database row. If the database step fails we delete the new file.
  const saved = await storage.save(file.buffer, detected.ext);
  let replaced = null;
  try {
    await withTransaction(async (client) => {
      const application = await repo.lockApplicationForUpload(applicationId, client);
      if (!application || application.parentUserId !== parent.id) throw AppError.notFound('Application not found');
      if (!EDITABLE_STATUSES.includes(application.status)) {
        throw new AppError('Documents can only be changed while the application is a draft or NTIC has asked for more information', 409, 'INVALID_STATE');
      }
      replaced = await repo.findByApplicationAndCode(applicationId, code, client);
      await repo.upsert(
        {
          applicationId,
          typeId: type.id,
          originalName: String(file.originalname || 'upload').slice(0, 200),
          storedName: saved.storedName,
          mimeType: detected.mime,
          sizeBytes: file.size,
          sha256: saved.sha256,
          uploadedBy: parent.id,
        },
        client
      );
    });
  } catch (err) {
    await storage.remove(saved.storedName);
    throw err;
  }
  // Only after the database accepted the new file do we delete the one it replaced
  if (replaced) await storage.remove(replaced.storedName);
  return publicView(await repo.findByApplicationAndCode(applicationId, code));
}

async function removeDocument(parent, applicationId, code) {
  assertUuid(applicationId, 'Application id');
  assertCode(code);
  let removed = null;
  await withTransaction(async (client) => {
    const application = await repo.lockApplicationForUpload(applicationId, client);
    if (!application || application.parentUserId !== parent.id) throw AppError.notFound('Application not found');
    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw new AppError('Documents can only be changed while the application is a draft or NTIC has asked for more information', 409, 'INVALID_STATE');
    }
    removed = await repo.findByApplicationAndCode(applicationId, code, client);
    if (!removed) throw AppError.notFound('Document not found');
    await repo.deleteById(removed.id, client);
  });
  await storage.remove(removed.storedName);
}

// Returns { document, stream } for the controller to send. Parent: own application only.
async function openForParent(parent, applicationId, code) {
  await requireOwnApplication(parent, applicationId);
  return openDocument(applicationId, code);
}

// Staff: only for applications at their campuses (central admin: all). Other campus = 404.
async function openForStaff(actor, applicationId, code) {
  assertUuid(applicationId, 'Application id');
  const application = await repo.findApplicationOwnerAndCampus(applicationId);
  const scope = await getCampusScope(actor);
  if (!application || (scope && !scope.includes(application.campusId))) throw AppError.notFound('Application not found');
  return openDocument(applicationId, code);
}

async function openDocument(applicationId, code) {
  assertCode(code);
  const document = await repo.findByApplicationAndCode(applicationId, code);
  if (!document) throw AppError.notFound('Document not found');
  return { document, stream: storage.openRead(document.storedName) };
}

module.exports = { listTypes, listDocuments, uploadDocument, removeDocument, openForParent, openForStaff };
