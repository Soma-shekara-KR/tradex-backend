'use strict';
const Trade   = require('../models/trade.model');
const Account = require('../models/account.model');
const { transaction } = require('../config/database');
const { success, created, badRequest, notFound, forbidden } = require('../utils/response');
const { emitToUser } = require('../config/socket');
const MarketService  = require('../services/market.service');
const logger = require('../utils/logger');

// Calculate required margin
function calcMargin(price, volume, leverage) {
  return parseFloat(((price * volume * 100000) / leverage).toFixed(2));
}

// Calculate P&L
function calcPnL(side, volume, openPrice, closePrice) {
  const diff = side === 'buy' ? closePrice - openPrice : openPrice - closePrice;
  return parseFloat((diff * volume * 100000).toFixed(2));
}

async function openTrade(req, res) {
  const { accountId, symbol, side, volume, stopLoss, takeProfit, comment } = req.body;

  const account = await Account.findById(accountId);
  if (!account)                       return notFound(res, 'Trading account not found');
  if (account.user_id !== req.user.userId) return forbidden(res, 'Not your account');
  if (account.status !== 'active')    return badRequest(res, 'Account is not active');

  // Get current market price
  const marketPrice = await MarketService.getPrice(symbol);
  if (!marketPrice) return badRequest(res, `No price available for ${symbol}`);

  const openPrice  = side === 'buy' ? marketPrice.ask : marketPrice.bid;
  const marginUsed = calcMargin(openPrice, volume, account.leverage);

  if (account.free_margin < marginUsed) {
    return badRequest(res, `Insufficient margin. Required: $${marginUsed}, Available: $${account.free_margin}`);
  }

  const trade = await transaction(async (client) => {
    const t = await Trade.open({
      accountId, userId: req.user.userId, symbol, side, volume,
      openPrice, stopLoss, takeProfit, marginUsed, comment,
    });
    await Account.updateMargin(accountId, marginUsed, client);
    return t;
  });

  emitToUser(req.user.userId, 'trade:opened', trade);
  logger.info(`Trade opened: ${symbol} ${side} ${volume} lots by user ${req.user.userId}`);

  return created(res, trade, 'Trade opened successfully');
}

async function closeTrade(req, res) {
  const { id } = req.params;

  const trade = await Trade.findById(id);
  if (!trade) return notFound(res, 'Trade not found');
  if (trade.user_id !== req.user.userId) return forbidden(res, 'Not your trade');
  if (trade.status !== 'open') return badRequest(res, 'Trade is already closed');

  const marketPrice = await MarketService.getPrice(trade.symbol);
  const closePrice  = trade.side === 'buy' ? marketPrice.bid : marketPrice.ask;
  const profitLoss  = calcPnL(trade.side, trade.volume, trade.open_price, closePrice);
  const pips        = parseFloat(((closePrice - trade.open_price) * (trade.side === 'buy' ? 1 : -1) / 0.0001).toFixed(1));

  const closed = await transaction(async (client) => {
    const t = await Trade.close(id, closePrice, profitLoss, pips);
    // Return margin + apply P&L to balance
    await Account.updateMargin(trade.account_id, -trade.margin_used, client);
    await Account.updateBalance(trade.account_id, profitLoss, client);
    return t;
  });

  emitToUser(req.user.userId, 'trade:closed', { ...closed, profitLoss });
  logger.info(`Trade closed: ${trade.symbol} P&L: ${profitLoss} by user ${req.user.userId}`);

  return success(res, closed, `Trade closed. P&L: ${profitLoss >= 0 ? '+' : ''}$${profitLoss}`);
}

async function modifyTrade(req, res) {
  const { id } = req.params;
  const { stopLoss, takeProfit } = req.body;

  const trade = await Trade.findById(id);
  if (!trade) return notFound(res, 'Trade not found');
  if (trade.user_id !== req.user.userId) return forbidden(res, 'Not your trade');
  if (trade.status !== 'open') return badRequest(res, 'Can only modify open trades');

  const updated = await Trade.updateSLTP(id, req.user.userId, stopLoss, takeProfit);
  return success(res, updated, 'Trade modified');
}

async function getOpenTrades(req, res) {
  const trades = await Trade.getOpenByUser(req.user.userId);
  return success(res, trades);
}

async function getTradeHistory(req, res) {
  const { accountId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const account = await Account.findById(accountId);
  if (!account || account.user_id !== req.user.userId) return forbidden(res);

  const { trades, total } = await Trade.findByAccount(accountId, { status: 'closed', page, limit });
  return success(res, { trades, total });
}

async function getTradeStats(req, res) {
  const { accountId } = req.params;
  const account = await Account.findById(accountId);
  if (!account || account.user_id !== req.user.userId) return forbidden(res);

  const stats = await Trade.getStats(accountId);
  const winRate = stats.closed_count > 0
    ? parseFloat(((stats.winning_trades / stats.closed_count) * 100).toFixed(1)) : 0;

  return success(res, { ...stats, winRate });
}

module.exports = { openTrade, closeTrade, modifyTrade, getOpenTrades, getTradeHistory, getTradeStats };
