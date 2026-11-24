// src/utils/tokens.js
// Creating and checking login tokens (JWT). The token holds ONLY the user id.

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ALGORITHM = 'HS256';

// Returns the token string and how many seconds it stays valid
function signAccessToken(userId) {
  const token = jwt.sign({}, env.jwtSecret, {
    subject: userId,
    expiresIn: env.jwtExpiresIn,
    algorithm: ALGORITHM,
  });
  const { iat, exp } = jwt.decode(token);
  return { token, expiresInSeconds: exp - iat };
}

// Throws if the token is forged, tampered with, or expired. Returns the payload ({ sub, iat, exp })
function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}

module.exports = { signAccessToken, verifyAccessToken };