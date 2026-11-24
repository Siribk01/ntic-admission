// src/utils/ids.js
// Checking that a value from a URL or request really is a UUID.

const AppError = require('./AppError');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reject malformed ids BEFORE they reach PostgreSQL.
// Otherwise the database would throw "invalid input syntax for type uuid" -> a 500 error.
function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw AppError.badRequest(`${label} is not a valid id`);
  }
}

module.exports = { assertUuid };