// src/config/env.js
// Loads settings from .env, validates them, and exports them as one object.

require('dotenv').config();

// Settings the app cannot run without. We add to this list as we build.
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const missing = REQUIRED.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missing.join(', ')}\n` +
      'Add them to your .env file and restart the server.'
  );
  process.exit(1); // stop immediately; do not start half-configured
}

// A short secret can be guessed or brute-forced, which would let someone forge login tokens
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long. Generate a longer random one.');
  process.exit(1);
}

const port = Number(process.env.PORT) || 5000;

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
};

// Object.freeze stops any other file from changing a setting by accident
module.exports = Object.freeze(env);