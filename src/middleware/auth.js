'use strict';
const { verifyToken }        = require('../utils/jwt');
const { isTokenBlacklisted } = require('../config/redis');
const { unauthorized, forbidden } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Verify JWT access token on every protected route
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = header.split(' ')[1];

    // Check Redis blacklist (logout'd tokens)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) return unauthorized(res, 'Token has been revoked');

    const payload = verifyToken(token);
    req.user  = payload;   // { userId, email, role, accountId }
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError')  return unauthorized(res, 'Invalid token');
    logger.error('Auth middleware error:', err);
    return unauthorized(res, 'Authentication failed');
  }
}

/**
 * Role-based access control
 * Usage: authorize('admin') or authorize('admin', 'manager')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!roles.includes(req.user.role)) {
      return forbidden(res, `Role '${req.user.role}' is not allowed to access this resource`);
    }
    next();
  };
}

/**
 * Ensure the authenticated user owns the resource
 * Usage: after authenticate — checks req.user.userId === req.params.userId
 */
function ownerOrAdmin(req, res, next) {
  const targetId = req.params.userId || req.params.id;
  if (req.user.userId === targetId || req.user.role === 'admin') return next();
  return forbidden(res, 'You can only access your own resources');
}

module.exports = { authenticate, authorize, ownerOrAdmin };
