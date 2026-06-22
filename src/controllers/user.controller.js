'use strict';
const User        = require('../models/user.model');
const Account     = require('../models/account.model');
const Transaction = require('../models/transaction.model');
const { success, notFound, badRequest, paginated } = require('../utils/response');

async function getMe(req, res) {
  const user = await User.findById(req.user.userId);
  if (!user) return notFound(res, 'User not found');
  return success(res, user);
}

async function updateProfile(req, res) {
  const allowed = { first_name: req.body.firstName, last_name: req.body.lastName,
                    phone: req.body.phone, country: req.body.country, address: req.body.address,
                    date_of_birth: req.body.dateOfBirth };
  // remove undefined
  Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k]);
  const user = await User.update(req.user.userId, allowed);
  return success(res, user, 'Profile updated');
}

async function uploadAvatar(req, res) {
  if (!req.file) return badRequest(res, 'No file uploaded');
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  const user = await User.update(req.user.userId, { avatar_url: avatarUrl });
  return success(res, { avatarUrl: user.avatar_url }, 'Avatar updated');
}

async function getDashboard(req, res) {
  const userId   = req.user.userId;
  const accounts = await Account.getStats(userId);
  const { transactions } = await Transaction.findByUser(userId, { limit: 5 });
  const summary  = await Transaction.getSummary(userId);

  const mainAccount = accounts.find(a => !a.is_demo) || accounts[0] || {};

  return success(res, {
    accounts,
    recentTransactions: transactions,
    summary,
    stats: {
      balance:      mainAccount.balance        || 0,
      equity:       mainAccount.equity         || 0,
      freeMargin:   mainAccount.free_margin    || 0,
      marginUsed:   mainAccount.margin_used    || 0,
      openTrades:   mainAccount.open_trades    || 0,
      unrealisedPnl: mainAccount.unrealised_pnl || 0,
      totalDeposited: summary.total_deposited  || 0,
      totalWithdrawn: summary.total_withdrawn  || 0,
    },
  });
}

async function getNotifications(req, res) {
  const { rows } = await require('../config/database').query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.userId]
  );
  return success(res, rows);
}

async function markNotificationRead(req, res) {
  await require('../config/database').query(
    `UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.userId]
  );
  return success(res, null, 'Notification marked as read');
}

async function markAllNotificationsRead(req, res) {
  await require('../config/database').query(
    `UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.user.userId]
  );
  return success(res, null, 'All notifications marked as read');
}

module.exports = { getMe, updateProfile, uploadAvatar, getDashboard, getNotifications, markNotificationRead, markAllNotificationsRead };
