'use strict';
const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authRateLimit } = require('../middleware/rateLimiter');

const pwRules = body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
  .matches(/[0-9]/).withMessage('Password must contain a number');

router.post('/register', authRateLimit, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name required (2–50 chars)'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name required (2–50 chars)'),
  pwRules,
  body('country').optional().isString(),
  body('phone').optional().isMobilePhone(),
], validate, ctrl.register);

router.post('/login', authRateLimit, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, ctrl.login);

router.post('/refresh',         [body('refreshToken').notEmpty()], validate, ctrl.refreshToken);
router.post('/logout',          authenticate, ctrl.logout);
router.get ('/verify/:token',   ctrl.verifyEmail);

router.post('/forgot-password', authRateLimit, [
  body('email').isEmail().normalizeEmail(),
], validate, ctrl.forgotPassword);

router.post('/reset-password', [
  body('token').notEmpty(),
  pwRules.optional(), // reuse same rule on 'password' field
  body('password').isLength({ min: 8 }),
], validate, ctrl.resetPassword);

router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, ctrl.changePassword);

router.post('/send-otp',   authenticate, [body('phone').isMobilePhone()], validate, ctrl.sendOTP);
router.post('/verify-otp', authenticate, [body('phone').isMobilePhone(), body('otp').isLength({ min: 6, max: 6 })], validate, ctrl.verifyPhoneOTP);

module.exports = router;
