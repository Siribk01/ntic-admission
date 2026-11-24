// src/middleware/upload.js
// Reads ONE file from a multipart/form-data request (field name "file") into memory.
// The hard ceiling here is the biggest limit any document type may have (5 MB);
// the exact per-type limit is checked in the service.

const multer = require('multer');
const AppError = require('../utils/AppError');

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
}).single('file');

function uploadSingleFile(req, res, next) {
  parser(req, res, (err) => {
    if (!err) {
      if (!req.file) {
        return next(AppError.validation([{ field: 'file', message: 'Choose a file to upload (form field name: file)' }]));
      }
      return next();
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(AppError.validation([{ field: 'file', message: 'The file is too large (maximum 5 MB)' }]));
    }
    if (err.name === 'MulterError') {
      return next(AppError.validation([{ field: 'file', message: 'Upload exactly one file in the field named "file"' }]));
    }
    return next(AppError.badRequest('The upload could not be read'));
  });
}

module.exports = { uploadSingleFile };
