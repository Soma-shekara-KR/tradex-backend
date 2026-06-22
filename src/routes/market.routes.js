// ── market.routes.js
'use strict';
const router = require('express').Router();
const { body, query } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/market.controller');

// Public endpoints
router.get('/prices',         ctrl.getPrices);
router.get('/price/:symbol',  ctrl.getPrice);
router.get('/instruments',    ctrl.getInstruments);
router.get('/candles/:symbol',ctrl.getCandles);

// Auth required for alerts
router.use(authenticate);
router.get ('/alerts',    ctrl.getAlerts);
router.post('/alerts', [
  body('symbol').trim().isLength({ min: 3 }),
  body('targetPrice').isFloat({ min: 0 }),
  body('direction').isIn(['above','below']),
], validate, ctrl.createAlert);
router.delete('/alerts/:id', ctrl.deleteAlert);

module.exports = router;
