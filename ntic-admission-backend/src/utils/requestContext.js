// src/utils/requestContext.js
// Pulls the "where did this come from" details out of a request, for the audit log.

function getRequestContext(req) {
  const userAgent = (req.get('user-agent') || '').slice(0, 255);
  return {
    ip: req.ip || null,
    userAgent: userAgent || null,
  };
}

module.exports = { getRequestContext };