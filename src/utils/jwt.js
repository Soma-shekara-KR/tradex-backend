'use strict';
const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_SECRET          || 'changeme_access_secret_32chars!!';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET  || 'changeme_refresh_secret_32chars!';
const ACCESS_TTL     = process.env.JWT_EXPIRES_IN      || '7d';
const REFRESH_TTL    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function signToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

function decodeToken(token) {
  return jwt.decode(token);
}

/** Returns seconds until expiry (for Redis blacklist TTL) */
function secondsUntilExpiry(token) {
  try {
    const { exp } = jwt.decode(token);
    return Math.max(0, exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}

module.exports = {
  signToken, signRefreshToken,
  verifyToken, verifyRefreshToken,
  decodeToken, secondsUntilExpiry,
};
