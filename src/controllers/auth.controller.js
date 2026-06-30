'use strict';
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const User     = require('../models/user.model');
const Account  = require('../models/account.model');
const { signToken, signRefreshToken, verifyRefreshToken, secondsUntilExpiry } = require('../utils/jwt');
const { blacklistToken, storeOTP, verifyOTP } = require('../config/redis');
const { success, created, badRequest, unauthorized, notFound, conflict } = require('../utils/response');
const EmailService  = require('../services/email.service');
const logger        = require('../utils/logger');

// â”€â”€ Register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function register(req, res) {
  const { email, password, firstName, lastName, phone, country, referralCode } = req.body;

  const existing = await User.findByEmail(email);
  if (existing) return conflict(res, 'An account with this email already exists');

  let referredBy = null;
  if (referralCode) {
    const referrer = await User.findByEmail(referralCode); // using code lookup
    if (referrer) referredBy = referrer.id;
  }

  const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12);
  const user = await User.create({ email, passwordHash, firstName, lastName, phone, country, referredBy });

  // Create default Standard + Demo accounts
  await Account.create({ userId: user.id, type: 'standard', currency: 'USD', leverage: 2000, isDemo: false });
  await Account.create({ userId: user.id, type: 'demo',     currency: 'USD', leverage: 2000, isDemo: true });

  // Send verification email
  const verifyToken = crypto.randomBytes(32).toString('hex');
  await User.setEmailVerifyToken(user.id, verifyToken);
  await EmailService.sendVerificationEmail(user.email, user.first_name, verifyToken);

  logger.info(`New user registered: ${user.email}`);
  return created(res, { userId: user.id, email: user.email }, 'Account created. Please verify your email.');
}

// â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function login(req, res) {
  const { email, password } = req.body;
  const rawIp = req.headers['x-forwarded-for'] || req.ip || '';
  const ip = rawIp.split(',')[0].trim();

  const user = await User.findByEmail(email);
  if (!user) return unauthorized(res, 'Invalid email or password');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return unauthorized(res, 'Invalid email or password');

  if (user.status === 'suspended') return unauthorized(res, 'Your account has been suspended. Contact support.');
  if (user.status === 'banned')    return unauthorized(res, 'Your account has been banned.');

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken  = signToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store refresh token in DB
  await require('../config/database').query(
    `INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
     VALUES ($1,$2,$3,$4, NOW() + INTERVAL '30 days')`,
    [user.id, refreshToken, ip, req.headers['user-agent']]
  );

  await User.updateLastLogin(user.id, ip);

  logger.info(`User logged in: ${user.email} from ${ip}`);
  return success(res, {
    accessToken,
    refreshToken,
    user: {
      id:         user.id,
      email:      user.email,
      firstName:  user.first_name,
      lastName:   user.last_name,
      role:       user.role,
      status:     user.status,
      kycStatus:  user.kyc_status,
      avatarUrl:  user.avatar_url,
    },
  }, 'Login successful');
}

// â”€â”€ Refresh token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return badRequest(res, 'Refresh token required');

  let payload;
  try { payload = verifyRefreshToken(refreshToken); }
  catch { return unauthorized(res, 'Invalid or expired refresh token'); }

  const { rows } = await require('../config/database').query(
    `SELECT * FROM sessions WHERE refresh_token=$1 AND expires_at > NOW()`, [refreshToken]
  );
  if (!rows.length) return unauthorized(res, 'Session not found or expired');

  const user = await User.findById(payload.userId);
  if (!user || user.status !== 'active') return unauthorized(res, 'Account unavailable');

  const newPayload     = { userId: user.id, email: user.email, role: user.role };
  const newAccessToken = signToken(newPayload);

  return success(res, { accessToken: newAccessToken }, 'Token refreshed');
}

// â”€â”€ Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function logout(req, res) {
  const ttl = secondsUntilExpiry(req.token);
  await blacklistToken(req.token, ttl);

  const { refreshToken } = req.body;
  if (refreshToken) {
    await require('../config/database').query(
      `DELETE FROM sessions WHERE refresh_token=$1`, [refreshToken]
    );
  }
  return success(res, null, 'Logged out successfully');
}

// â”€â”€ Verify email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function verifyEmail(req, res) {
  const { token } = req.params;
  const user = await User.verifyEmail(token);
  if (!user) return badRequest(res, 'Invalid or expired verification link');
  return success(res, null, 'Email verified successfully. You can now log in.');
}

// â”€â”€ Forgot password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findByEmail(email);
  // Always return success to prevent email enumeration
  if (!user) return success(res, null, 'If this email exists, a reset link has been sent.');

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await User.setResetToken(user.id, token, expires);
  await EmailService.sendPasswordResetEmail(user.email, user.first_name, token);

  return success(res, null, 'Password reset email sent.');
}

// â”€â”€ Reset password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function resetPassword(req, res) {
  const { token, password } = req.body;
  const user = await User.findByResetToken(token);
  if (!user) return badRequest(res, 'Invalid or expired reset token');

  const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12);
  await User.setPassword(user.id, passwordHash);

  logger.info(`Password reset for user: ${user.email}`);
  return success(res, null, 'Password reset successfully. Please log in.');
}

// â”€â”€ Change password (authenticated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findByIdFull(req.user.userId);

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return badRequest(res, 'Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await User.setPassword(user.id, passwordHash);

  return success(res, null, 'Password changed successfully');
}

// â”€â”€ Send OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendOTP(req, res) {
  const { phone } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await storeOTP(phone, otp);
  // In production: await SmsService.send(phone, `Your TradeX OTP: ${otp}`);
  logger.info(`OTP generated for ${phone}: ${otp}`); // remove in production
  return success(res, null, 'OTP sent to your phone');
}

// â”€â”€ Verify OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function verifyPhoneOTP(req, res) {
  const { phone, otp } = req.body;
  const valid = await verifyOTP(phone, otp);
  if (!valid) return badRequest(res, 'Invalid or expired OTP');

  await User.update(req.user.userId, { phone, phone_verified: true });
  return success(res, null, 'Phone verified successfully');
}

module.exports = { register, login, refreshToken, logout, verifyEmail, forgotPassword, resetPassword, changePassword, sendOTP, verifyPhoneOTP };

