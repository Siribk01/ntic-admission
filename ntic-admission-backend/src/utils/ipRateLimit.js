// src/utils/ipRateLimit.js
// A small "too many requests" guard for public endpoints (forgot password, verify email, ...).
// It counts requests per IP address inside a time window, in this server's memory.
//   - It resets when the server restarts, and each server instance counts separately. That is fine as a first line of defence;
//     the per-account limits stored in the database are the strong ones.
//   - Behind a proxy or load balancer, set app.set('trust proxy', 1) so req.ip is the visitor's address, not the proxy's.

const AppError = require('./AppError');

function ipRateLimit({ limit, windowMs }) {
  const hits = new Map(); // ip -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10000) {
      for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip); // sweep old entries so memory cannot grow forever
    }
    const key = req.ip || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError('Too many requests. Please wait a few minutes and try again.', 429, 'RATE_LIMITED'));
    }
    return next();
  };
}

module.exports = { ipRateLimit };
