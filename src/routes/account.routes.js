'use strict';
const router  = require('express').Router();
const Account = require('../models/account.model');
const { authenticate } = require('../middleware/auth');
const { success, notFound, forbidden } = require('../utils/response');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

router.use(authenticate);

// List all my accounts
router.get('/', async (req, res) => {
  const accounts = await Account.getStats(req.user.userId);
  return success(res, accounts);
});

// Get one account
router.get('/:id', async (req, res) => {
  const account = await Account.findById(req.params.id);
  if (!account) return notFound(res, 'Account not found');
  if (account.user_id !== req.user.userId) return forbidden(res);
  return success(res, account);
});

// Create additional account
router.post('/', [
  body('type').isIn(['standard','pro','raw_spread','demo']),
  body('currency').optional().isIn(['USD','EUR','GBP']),
  body('leverage').optional().isInt({ min: 1, max: 2000 }),
  body('platform').optional().isIn(['MT5','MT4','web']),
], validate, async (req, res) => {
  const { type, currency, leverage, platform } = req.body;
  const account = await Account.create({
    userId: req.user.userId,
    type,
    currency:  currency  || 'USD',
    leverage:  leverage  || 2000,
    isDemo:    type === 'demo',
    platform:  platform  || 'MT5',
  });
  return res.status(201).json({ success: true, message: 'Account created', data: account });
});

module.exports = router;
