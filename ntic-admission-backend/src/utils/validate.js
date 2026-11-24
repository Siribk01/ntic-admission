// src/utils/validate.js
// Runs input through a zod schema. Returns clean data, or throws a 422 AppError
// listing every field problem at once.

const AppError = require('./AppError');

function validate(schema, input) {
  // A request with no body arrives as undefined: treat it as an empty object so the user sees field errors
  const result = schema.safeParse(input === undefined ? {} : input);

  if (result.success) {
    return result.data; // trimmed, lower-cased, and typed as the schema describes
  }

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));

  throw AppError.validation(details);
}

module.exports = { validate };