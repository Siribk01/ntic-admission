// src/middleware/rateLimiter.js
// Limits how many requests one IP address can make to sensitive routes in a time window.

const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');
const AppError = require('../utils/AppError');

// In development the limits are much higher, so normal testing is not blocked
function makeLimiter({ windowMinutes, productionMax, developmentMax, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: env.isProduction ? productionMax : developmentMax,
    standardHeaders: 'draft-7', // sends RateLimit headers and Retry-After so clients know when to retry
    legacyHeaders: false,
    // Hand the error to our normal error handler so the response has the same shape as every other error
    handler: (req, res, next) => next(AppError.tooManyRequests(message, 'RATE_LIMITED')),
  });
}

// Sign-in: stops one source trying passwords against many accounts
const loginLimiter = makeLimiter({
  windowMinutes: 15,
  productionMax: 10,
  developmentMax: 50,
  message: 'Too many sign-in attempts from this network. Please try again in a few minutes.',
});

// Sign-up: stops mass creation of fake accounts
const registerLimiter = makeLimiter({
  windowMinutes: 60,
  productionMax: 10,
  developmentMax: 50,
  message: 'Too many sign-up attempts from this network. Please try again later.',
});

module.exports = { loginLimiter, registerLimiter };