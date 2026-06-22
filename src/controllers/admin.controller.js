'use strict';
const User        = require('../models/user.model');
const Account     = require('../models/account.model');
const Transaction = require('../models/transaction.model');
const { query }   = require('../config/database');
const { success, badRequest, notFound, paginated } = require('../utils/response');

async function getDashboardStats(req, res) {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM users)                                             AS total_users,
      (SELECT COUNT(*) FROM users WHERE status='active')                       AS active_users,
      (SELECT COUNT(*) FROM users WHERE kyc_status='pending')                  AS pending_kyc,
      (SELECT COUNT(*) FROM users WHERE created_at > NOW()-INTERVAL '24h')     AS new_users_today,
      (SELECT COUNT(*) FROM trades WHERE status='open')                         AS open_trades,
      (SELECT COUNT(*) FROM trades WHERE created_at > NOW()-INTERVAL '24h')    AS trades_today,
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='deposit'  AND status='completed' AND created_at > NOW()-INTERVAL '24h') AS deposits_today,
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='withdrawal' AND status='pending') AS pending_withdrawals,
      (SELECT COALESCE(SUM(balance),0) FROM trading_accounts WHERE is_demo=false) AS total_aum
  `);
  return success(res, rows[0]);
}

async function getUsers(req, res) {
  const { page = 1, limit = 20, status, kyc_status, role, search } = req.query;
  const { users, total } = await User.getAll({ page: +page, limit: +limit, status, kyc_status, role, search });
  return paginated(res, users, total, page, limit);
}

async function getUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User not found');
  const accounts = await Account.findByUserId(req.params.id);
  const { transactions } = await Transaction.findByUser(req.params.id, { limit: 10 });
  return success(res, { user, accounts, recentTransactions: transactions });
}

async function updateUserStatus(req, res) {
  const { status } = req.body;
  const allowed = ['active','suspended','banned'];
  if (!allowed.includes(status)) return badRequest(res, 'Invalid status');
  const user = await User.update(req.params.id, { status });
  if (!user) return notFound(res, 'User not found');
  return success(res, user, `User status updated to ${status}`);
}

async function updateKycStatus(req, res) {
  const { kycStatus } = req.body;
  const allowed = ['not_submitted','pending','approved','rejected'];
  if (!allowed.includes(kycStatus)) return badRequest(res, 'Invalid KYC status');
  const user = await User.update(req.params.id, { kyc_status: kycStatus });
  return success(res, user, 'KYC status updated');
}

async function getAllAccounts(req, res) {
  const { page = 1, limit = 20, status, type } = req.query;
  const { accounts, total } = await Account.getAll({ page: +page, limit: +limit, status, type });
  return paginated(res, accounts, total, page, limit);
}

async function getAllTransactions(req, res) {
  const { page = 1, limit = 20, type, status, userId } = req.query;
  const { transactions, total } = await Transaction.getAll({ page: +page, limit: +limit, type, status, userId });
  return paginated(res, transactions, total, page, limit);
}

async function getAuditLogs(req, res) {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT al.*, u.email FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
     ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
  );
  const { rows: cnt } = await query(`SELECT COUNT(*) FROM audit_logs`);
  return paginated(res, rows, parseInt(cnt[0].count, 10), page, limit);
}

module.exports = { getDashboardStats, getUsers, getUser, updateUserStatus, updateKycStatus, getAllAccounts, getAllTransactions, getAuditLogs };
