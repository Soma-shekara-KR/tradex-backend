'use strict';
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function generateRef() {
  return `TRX-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

const Transaction = {

  async findById(id) {
    const { rows } = await query(`SELECT * FROM transactions WHERE id=$1`, [id]);
    return rows[0] || null;
  },

  async findByReference(ref) {
    const { rows } = await query(`SELECT * FROM transactions WHERE reference=$1`, [ref]);
    return rows[0] || null;
  },

  async findByUser(userId, { type, status, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const cond = ['user_id=$1']; const vals = [userId]; let i = 2;
    if (type)   { cond.push(`type=$${i++}`);   vals.push(type); }
    if (status) { cond.push(`status=$${i++}`); vals.push(status); }
    const where = cond.join(' AND ');
    const { rows } = await query(
      `SELECT * FROM transactions WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...vals, limit, offset]
    );
    const { rows: cnt } = await query(`SELECT COUNT(*) FROM transactions WHERE ${where}`, vals);
    return { transactions: rows, total: parseInt(cnt[0].count, 10) };
  },

  async create({ userId, accountId, type, method, amount, fee = 0, currency = 'USD', externalRef, stripePiId, notes }) {
    const { rows } = await query(
      `INSERT INTO transactions (id, user_id, account_id, type, status, method, amount, fee, currency, reference, external_ref, stripe_pi_id, notes)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [uuidv4(), userId, accountId || null, type, method, amount, fee, currency,
       generateRef(), externalRef || null, stripePiId || null, notes || null]
    );
    return rows[0];
  },

  async updateStatus(id, status, { processedBy, externalRef, cryptoTxhash } = {}) {
    const { rows } = await query(
      `UPDATE transactions
       SET status=$1, processed_by=$2, processed_at=CASE WHEN $1 IN ('completed','failed','cancelled') THEN NOW() ELSE processed_at END,
           external_ref=COALESCE($3, external_ref), crypto_txhash=COALESCE($4, crypto_txhash)
       WHERE id=$5 RETURNING *`,
      [status, processedBy || null, externalRef || null, cryptoTxhash || null, id]
    );
    return rows[0] || null;
  },

  async getAll({ page = 1, limit = 20, type, status, userId }) {
    const offset = (page - 1) * limit;
    const cond = ['1=1']; const vals = []; let i = 1;
    if (type)   { cond.push(`t.type=$${i++}`);    vals.push(type); }
    if (status) { cond.push(`t.status=$${i++}`);  vals.push(status); }
    if (userId) { cond.push(`t.user_id=$${i++}`); vals.push(userId); }
    const where = cond.join(' AND ');
    const { rows } = await query(
      `SELECT t.*, u.email, u.first_name, u.last_name
       FROM transactions t JOIN users u ON u.id=t.user_id
       WHERE ${where} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...vals, limit, offset]
    );
    const { rows: cnt } = await query(
      `SELECT COUNT(*) FROM transactions t WHERE ${where}`, vals
    );
    return { transactions: rows, total: parseInt(cnt[0].count, 10) };
  },

  async getSummary(userId) {
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type='deposit'    AND status='completed'), 0) AS total_deposited,
         COALESCE(SUM(amount) FILTER (WHERE type='withdrawal' AND status='completed'), 0) AS total_withdrawn,
         COUNT(*)            FILTER (WHERE type='deposit'    AND status='completed')       AS deposit_count,
         COUNT(*)            FILTER (WHERE type='withdrawal' AND status='completed')       AS withdrawal_count
       FROM transactions WHERE user_id=$1`, [userId]
    );
    return rows[0];
  },
};

module.exports = Transaction;
