'use strict';
const { query, transaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Trade = {

  async findById(id) {
    const { rows } = await query(`SELECT * FROM trades WHERE id=$1`, [id]);
    return rows[0] || null;
  },

  async findByAccount(accountId, { status, page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;
    const cond = ['account_id=$1']; const vals = [accountId]; let i = 2;
    if (status) { cond.push(`status=$${i++}`); vals.push(status); }
    const { rows } = await query(
      `SELECT * FROM trades WHERE ${cond.join(' AND ')} ORDER BY opened_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...vals, limit, offset]
    );
    const { rows: cnt } = await query(
      `SELECT COUNT(*) FROM trades WHERE ${cond.join(' AND ')}`, vals
    );
    return { trades: rows, total: parseInt(cnt[0].count, 10) };
  },

  async open({ accountId, userId, symbol, side, volume, openPrice, stopLoss, takeProfit, marginUsed, commission = 0, comment }) {
    const { rows } = await query(
      `INSERT INTO trades (id,account_id,user_id,symbol,side,status,volume,open_price,stop_loss,take_profit,margin_used,commission,comment)
       VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [uuidv4(), accountId, userId, symbol, side, volume, openPrice, stopLoss || null, takeProfit || null, marginUsed, commission, comment || null]
    );
    return rows[0];
  },

  async close(id, closePrice, profitLoss, pips, swap = 0) {
    const { rows } = await query(
      `UPDATE trades
       SET status='closed', close_price=$1, profit_loss=$2, pips=$3, swap=$4, closed_at=NOW()
       WHERE id=$5 AND status='open' RETURNING *`,
      [closePrice, profitLoss, pips, swap, id]
    );
    return rows[0] || null;
  },

  async updateSLTP(id, userId, stopLoss, takeProfit) {
    const { rows } = await query(
      `UPDATE trades SET stop_loss=$1, take_profit=$2
       WHERE id=$3 AND user_id=$4 AND status='open' RETURNING *`,
      [stopLoss, takeProfit, id, userId]
    );
    return rows[0] || null;
  },

  async getStats(accountId) {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status='open')    AS open_count,
         COUNT(*) FILTER (WHERE status='closed')  AS closed_count,
         COALESCE(SUM(profit_loss) FILTER (WHERE status='closed' AND profit_loss > 0), 0) AS total_profit,
         COALESCE(SUM(profit_loss) FILTER (WHERE status='closed' AND profit_loss < 0), 0) AS total_loss,
         COALESCE(SUM(profit_loss) FILTER (WHERE status='open'), 0)   AS unrealised_pnl,
         COALESCE(SUM(commission), 0)             AS total_commission,
         COALESCE(SUM(swap), 0)                   AS total_swap,
         COUNT(*) FILTER (WHERE status='closed' AND profit_loss > 0) AS winning_trades,
         COUNT(*) FILTER (WHERE status='closed' AND profit_loss < 0) AS losing_trades
       FROM trades WHERE account_id=$1`, [accountId]
    );
    return rows[0];
  },

  async getOpenByUser(userId) {
    const { rows } = await query(
      `SELECT t.*, ta.account_number, ta.currency
       FROM trades t JOIN trading_accounts ta ON ta.id=t.account_id
       WHERE t.user_id=$1 AND t.status='open' ORDER BY t.opened_at DESC`, [userId]
    );
    return rows;
  },
};

module.exports = Trade;
