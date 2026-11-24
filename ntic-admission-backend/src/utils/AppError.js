// src/utils/AppError.js
// An error we expect and can explain to the user (wrong input, not found, not allowed).

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode; // HTTP status to send back
    this.code = code;             // short machine-readable label, e.g. NOT_FOUND
    this.details = details;       // optional extra info, e.g. a list of field errors
    this.isOperational = true;    // "this is an expected error, not a bug"
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Invalid request') {
    return new AppError(message, 400, 'BAD_REQUEST');
  }

  // details: [{ field: 'email', message: 'Enter a valid email address' }, ...]
  static validation(details, message = 'Please correct the highlighted fields') {
    return new AppError(message, 422, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message = 'This conflicts with existing data') {
    return new AppError(message, 409, 'CONFLICT');
  }

    static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new AppError(message, 429, code);
  }
}

module.exports = AppError;