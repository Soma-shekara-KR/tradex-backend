'use strict';
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error({
    message: err.message,
    stack:   err.stack,
    url:     req.originalUrl,
    method:  req.method,
    ip:      req.ip,
    userId:  req.user?.userId,
  });

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: err.errors });
  }

  // PostgreSQL unique violation
  if (err.code === '23505') {
    const field = err.detail?.match(/\((.+?)\)/)?.[1] || 'field';
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Related record not found' });
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Maximum 5MB allowed.' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Stripe errors
  if (err.type && err.type.startsWith('Stripe')) {
    return res.status(402).json({ success: false, message: err.message });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message    = statusCode < 500 ? err.message : 'Internal server error';

  res.status(statusCode).json({ success: false, message, debug: { realMessage: err.message, stack: err.stack ? err.stack.split('\n').slice(0,5) : null } });
}

module.exports = errorHandler;

