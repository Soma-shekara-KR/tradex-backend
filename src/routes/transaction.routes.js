'use strict';
const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { depositRateLimit } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/transaction.controller');

router.use(authenticate);

router.get ('/',           ctrl.getHistory);
router.get ('/summary',    ctrl.getSummary);

router.post('/deposit', depositRateLimit, [
  body('accountId').isUUID(),
  body('amount').isFloat({ min: 10 }),
  body('method').optional().isIn(['card','bank_wire','crypto','neteller','skrill','upi']),
  body('currency').optional().isIn(['USD','EUR','GBP']),
], validate, ctrl.createDeposit);

router.post('/withdraw', [
  body('accountId').isUUID(),
  body('amount').isFloat({ min: 10 }),
  body('method').optional().isIn(['bank_wire','crypto','neteller','skrill']),
], validate, ctrl.createWithdrawal);

// Admin only
router.get ('/admin',             authorize('admin'), ctrl.getAllTransactions);
router.put ('/admin/:id/process', authorize('admin'), [
  body('action').isIn(['approve','reject']),
], validate, ctrl.processWithdrawal);

module.exports = router;
