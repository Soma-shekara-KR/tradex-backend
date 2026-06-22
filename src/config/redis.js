'use strict';
const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

async function connectRedis() {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        tls: process.env.REDIS_TLS === 'true',
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => logger.error('Redis error:', err.message));
    redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

    await redisClient.connect();
    await redisClient.ping();
    logger.info('✅ Redis connected');
  } catch (err) {
    logger.warn(`⚠️  Redis unavailable (${err.message}) — continuing without cache`);
    redisClient = null; // graceful degradation
  }
}

const getClient = () => redisClient;

// ── Helpers ──────────────────────────────────────────

async function setEx(key, ttlSeconds, value) {
  if (!redisClient) return;
  await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
}

async function get(key) {
  if (!redisClient) return null;
  const raw = await redisClient.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function del(key) {
  if (!redisClient) return;
  await redisClient.del(key);
}

async function delPattern(pattern) {
  if (!redisClient) return;
  const keys = await redisClient.keys(pattern);
  if (keys.length) await redisClient.del(keys);
}

// Store OTP with 10-min TTL
async function storeOTP(key, otp) {
  if (!redisClient) return;
  await redisClient.setEx(`otp:${key}`, 600, otp);
}

async function verifyOTP(key, otp) {
  if (!redisClient) return false;
  const stored = await redisClient.get(`otp:${key}`);
  if (stored === String(otp)) {
    await redisClient.del(`otp:${key}`);
    return true;
  }
  return false;
}

// Blacklist JWT on logout
async function blacklistToken(token, expiresInSeconds) {
  if (!redisClient) return;
  await redisClient.setEx(`blacklist:${token}`, expiresInSeconds, '1');
}

async function isTokenBlacklisted(token) {
  if (!redisClient) return false;
  return !!(await redisClient.get(`blacklist:${token}`));
}

module.exports = {
  connectRedis, getClient,
  setEx, get, del, delPattern,
  storeOTP, verifyOTP,
  blacklistToken, isTokenBlacklisted,
};
