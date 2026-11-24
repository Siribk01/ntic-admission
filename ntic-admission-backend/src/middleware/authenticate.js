// src/middleware/authenticate.js
// Protects a route. Reads "Authorization: Bearer <token>", verifies it, loads the user,
// and attaches the user to req.user. Anything wrong -> 401.

const { verifyAccessToken } = require('../utils/tokens');
const usersRepo = require('../modules/users/users.repository');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    // 1. Pull the token out of the header: "Authorization: Bearer eyJhbGci..."
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw AppError.unauthorized('Authentication required');
    }

    // 2. Check the signature and expiry
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        // A distinct code lets the React app know it should refresh the token or sign in again
        throw new AppError('Your session has expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
      }
      throw AppError.unauthorized('Invalid authentication token');
    }

    // 3. Load the CURRENT user from the database (never trust role data from the token)
    const user = await usersRepo.findById(payload.sub);
    if (!user || !user.isActive) {
      throw AppError.unauthorized('Authentication required');
    }

    // 4. Make the user available to the controller
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };