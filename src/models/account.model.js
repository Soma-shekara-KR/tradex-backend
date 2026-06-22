'use strict';
const { query, transaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Account = {

  async findById(id) {
    const { rows } = await query(`SELECT * FROM trading_accounts WHERE id=$1`, [id]);
    return rows[0] || null;
  },

  async findByUserId(userId) {
    const { rows } = await query(
      `SELECT * FROM trading_accounts WHERE user_id=$1 ORDER BY created_at ASC`, [userId]
    );
    return rows;
  },

  async findByNumber(accountNumber) {
    const { rows } = await query(`SELECT * FROM trading_accounts WHERE account_number=$1`, [accountNumber]);
    return rows[0] || null;
  },

  async create({ userId, type = 'standard', currency = 'USD', leverage = 2000, isDemo = false, platform = 'MT5' }) {
    const { rows: seq } = await query(`SELECT nextval('account_number_seq') AS num`);
    const accountNumber = `TX-${seq[0].num}`;
    const balance = isDemo ? 10000.00 : 0.00;

    const { rows } = await query(
      `INSERT INTO trading_accounts (id, user_id, account_number, type, currency, balance, equity, leverage, is_demo, platform)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9) RETURNING *`,
      [uuidv4(), userId, accountNumber, type, currency, balance, leverage, isDemo, platform]
    );
    return rows[0];
  },

  async updateBalance(id, balanceDelta, client = null) {
    const db = client || { query: (sql, p) => query(sql, p) };
    const { rows } = await db.query(
      `UPDATE trading_accounts
       SET balance = balance + $1, equity = equity + $1
       WHERE id = $2 RETURNING *`,
      [balanceDelta, id]
    );
    return rows[0];
  },

  async updateMargin(id, marginDelta, client = null) {
    const db = client || { query: (sql, p) => query(sql, p) };
    const { rows } = await db.query(
      `UPDATE trading_accounts SET margin_used = margin_used + $1 WHERE id=$2 RETURNING *`,
      [marginDelta, id]
    );
    return rows[0];
  },

  async getStats(userId) {
    const { rows } = await query(
      `SELECT
         ta.id, ta.account_number, ta.type, ta.currency,
         ta.balance, ta.equity, ta.margin_used, ta.free_margin, ta.leverage, ta.is_demo,
         COUNT(t.id) FILTER (WHERE t.status='open')   AS open_trades,
         COUNT(t.id) FILTER (WHERE t.status='closed') AS closed_trades,
         COALESCE(SUM(t.profit_loss) FILTER (WHERE t.status='closed'), 0) AS total_pnl,
         COALESCE(SUM(t.profit_loss) FILTER (WHERE t.status='open'), 0)   AS unrealised_pnl
       FROM trading_accounts ta
       LEFT JOIN trades t ON t.account_id = ta.id
       WHERE ta.user_id = $1
       GROUP BY ta.id
       ORDER BY ta.created_at ASC`, [userId]
    );
    return rows;
  },

  async getAll({ page = 1, limit = 20, status, type }) {
    const offset = (page - 1) * limit;
    const cond = ['1=1']; const vals = []; let i = 1;
    if (status) { cond.push(`status=$${i++}`); vals.push(status); }
    if (type)   { cond.push(`type=$${i++}`);   vals.push(type); }
    const where = cond.join(' AND ');
    const { rows } = await query(
      `SELECT ta.*, u.email, u.first_name, u.last_name
       FROM trading_accounts ta JOIN users u ON u.id = ta.user_id
       WHERE ${where} ORDER BY ta.created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...vals, limit, offset]
    );
    const { rows: cnt } = await query(`SELECT COUNT(*) FROM trading_accounts WHERE ${where}`, vals);
    return { accounts: rows, total: parseInt(cnt[0].count, 10) };
  },
};

module.exports = Account;
