// ── trade.routes.js ──────────────────────────────────
'use strict';
const express  = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/trade.controller');

const router = express.Router();
router.use(authenticate);

router.get ('/open',                    ctrl.getOpenTrades);
router.get ('/history/:accountId',      ctrl.getTradeHistory);
router.get ('/stats/:accountId',        ctrl.getTradeStats);
router.post('/', [
  body('accountId').isUUID(),
  body('symbol').trim().isLength({ min: 3, max: 10 }),
  body('side').isIn(['buy','sell']),
  body('volume').isFloat({ min: 0.01, max: 100 }),
  body('stopLoss').optional().isFloat(),
  body('takeProfit').optional().isFloat(),
], validate, ctrl.openTrade);
router.put ('/:id/close',               ctrl.closeTrade);
router.put ('/:id/modify', [
  body('stopLoss').optional().isFloat(),
  body('takeProfit').optional().isFloat(),
], validate, ctrl.modifyTrade);

module.exports = router;
