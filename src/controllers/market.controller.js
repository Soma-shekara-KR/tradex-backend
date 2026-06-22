'use strict';
const MarketService = require('../services/market.service');
const { query }     = require('../config/database');
const { success, created, badRequest, notFound } = require('../utils/response');
const { v4: uuidv4 } = require('uuid');

async function getPrices(req, res) {
  const { symbols } = req.query;
  const list = symbols ? symbols.split(',').map(s => s.trim().toUpperCase()) : null;
  const prices = await MarketService.getAllPrices(list);
  return success(res, prices);
}

async function getPrice(req, res) {
  const { symbol } = req.params;
  const price = await MarketService.getPrice(symbol.toUpperCase());
  if (!price) return notFound(res, `No price data for ${symbol}`);
  return success(res, price);
}

async function getInstruments(req, res) {
  const { category } = req.query;
  const instruments = await MarketService.getInstruments(category);
  return success(res, instruments);
}

async function getCandles(req, res) {
  const { symbol } = req.params;
  const { interval = '1h', limit = 100 } = req.query;
  const candles = await MarketService.getCandles(symbol.toUpperCase(), interval, parseInt(limit));
  return success(res, candles);
}

// ── Price alerts ──────────────────────────────────────
async function createAlert(req, res) {
  const { symbol, targetPrice, direction } = req.body;
  const { rows } = await query(
    `INSERT INTO price_alerts (id, user_id, symbol, target_price, direction)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [uuidv4(), req.user.userId, symbol.toUpperCase(), targetPrice, direction]
  );
  return created(res, rows[0], 'Price alert created');
}

async function getAlerts(req, res) {
  const { rows } = await query(
    `SELECT * FROM price_alerts WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.userId]
  );
  return success(res, rows);
}

async function deleteAlert(req, res) {
  await query(
    `DELETE FROM price_alerts WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.userId]
  );
  return success(res, null, 'Alert deleted');
}

module.exports = { getPrices, getPrice, getInstruments, getCandles, createAlert, getAlerts, deleteAlert };
