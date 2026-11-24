// src/utils/password.js
// Password rules, hashing, and checking. Nothing else in the app touches raw passwords.

const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;     // work factor: 2^12 rounds. Raise it over time as computers get faster
const MIN_LENGTH = 10;
const MAX_BYTES = 72;       // bcrypt silently ignores anything past 72 bytes, so we reject longer passwords

// Returns a list of problems. An empty list means the password is acceptable.
// This policy is a sensible default and should be confirmed by NTIC.
function checkPasswordPolicy(password) {
  const problems = [];

  if (typeof password !== 'string') {
    return ['Password is required'];
  }
  if (password.length < MIN_LENGTH) {
    problems.push(`Password must be at least ${MIN_LENGTH} characters long`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    problems.push(`Password is too long (maximum ${MAX_BYTES} bytes)`);
  }
  if (!/[A-Za-z]/.test(password)) {
    problems.push('Password must contain at least one letter');
  }
  if (!/[0-9]/.test(password)) {
    problems.push('Password must contain at least one number');
  }

  return problems;
}

// Turn a plain password into a hash that is safe to store in users.password_hash
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

// true if the plain password matches the stored hash, otherwise false
async function verifyPassword(plainPassword, storedHash) {
  if (typeof plainPassword !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  return bcrypt.compare(plainPassword, storedHash);
}

module.exports = { checkPasswordPolicy, hashPassword, verifyPassword };