// src/middleware/authorize.js
// Allows a route only for certain roles. Always placed AFTER authenticate.
// Usage: router.post('/staff', authenticate, authorize(ROLES.CENTRAL_ADMIN), controller.createStaff)

const AppError = require('../utils/AppError');

function authorize(...allowedRoles) {
  return (req, res, next) => {
    // req.user is set by authenticate. If it is missing, a route was wired up without it: fail closed
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden());
    }
    next();
  };
}

module.exports = { authorize };