'use strict';
const Transaction = require('../models/transaction.model');
const Account     = require('../models/account.model');
const { transaction: dbTx } = require('../config/database');
const StripeService = require('../services/stripe.service');
const { success, created, badRequest, notFound, forbidden, paginated } = require('../utils/response');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');

// ── Deposit via Stripe ────────────────────────────────
async function createDeposit(req, res) {
  const { accountId, amount, method = 'card', currency = 'USD' } = req.body;

  if (amount < 10) return badRequest(res, 'Minimum deposit is $10');

  const account = await Account.findById(accountId);
  if (!account) return notFound(res, 'Account not found');
  if (account.user_id !== req.user.userId) return forbidden(res);

  // Create pending transaction record
  const tx = await Transaction.create({
    userId: req.user.userId, accountId, type: 'deposit',
    method, amount, currency,
  });

  // Create Stripe Payment Intent
  let stripeData = null;
  if (method === 'card') {
    stripeData = await StripeService.createPaymentIntent(amount, currency, {
      userId:      req.user.userId,
      accountId,
      transactionId: tx.id,
    });
    // Store Stripe PI id on transaction
    await Transaction.updateStatus(tx.id, 'processing', { externalRef: stripeData.id });
  }

  logger.info(`Deposit initiated: $${amount} for user ${req.user.userId}`);
  return created(res, {
    transaction:    tx,
    clientSecret:   stripeData?.clientSecret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  }, 'Deposit initiated');
}

// ── Stripe webhook confirms payment ──────────────────
async function confirmDeposit(transactionId) {
  const tx = await Transaction.findById(transactionId);
  if (!tx || tx.type !== 'deposit') return;

  await dbTx(async (client) => {
    await Transaction.updateStatus(tx.id, 'completed');
    await Account.updateBalance(tx.account_id, tx.amount, client);
  });

  emitToUser(tx.user_id, 'deposit:confirmed', { amount: tx.amount, reference: tx.reference });
  logger.info(`Deposit confirmed: $${tx.amount} for transaction ${tx.id}`);
}

// ── Withdrawal request ───────────────────────────────
async function createWithdrawal(req, res) {
  const { accountId, amount, method = 'bank_wire', bankName, bankAccount, cryptoAddress, notes } = req.body;

  if (amount < 10) return badRequest(res, 'Minimum withdrawal is $10');

  const account = await Account.findById(accountId);
  if (!account) return notFound(res, 'Account not found');
  if (account.user_id !== req.user.userId) return forbidden(res);
  if (account.is_demo) return badRequest(res, 'Cannot withdraw from demo account');
  if (account.balance < amount) return badRequest(res, `Insufficient balance. Available: $${account.balance}`);

  const tx = await dbTx(async (client) => {
    const t = await Transaction.create({
      userId: req.user.userId, accountId, type: 'withdrawal',
      method, amount, currency: account.currency,
      notes: notes || `${method} withdrawal`,
    });
    await Account.updateBalance(accountId, -amount, client);
    return t;
  });

  emitToUser(req.user.userId, 'withdrawal:created', { amount, reference: tx.reference });
  logger.info(`Withdrawal requested: $${amount} by user ${req.user.userId}`);

  return created(res, tx, 'Withdrawal request submitted. Processing within 24 hours.');
}

// ── Get transaction history ──────────────────────────
async function getHistory(req, res) {
  const { type, status, page = 1, limit = 20 } = req.query;
  const { transactions, total } = await Transaction.findByUser(
    req.user.userId, { type, status, page: +page, limit: +limit }
  );
  return paginated(res, transactions, total, page, limit);
}

// ── Get summary ──────────────────────────────────────
async function getSummary(req, res) {
  const summary = await Transaction.getSummary(req.user.userId);
  return success(res, summary);
}

// ── Admin: get all transactions ──────────────────────
async function getAllTransactions(req, res) {
  const { type, status, userId, page = 1, limit = 20 } = req.query;
  const { transactions, total } = await Transaction.getAll({ type, status, userId, page: +page, limit: +limit });
  return paginated(res, transactions, total, page, limit);
}

// ── Admin: process withdrawal ─────────────────────────
async function processWithdrawal(req, res) {
  const { id } = req.params;
  const { action, notes } = req.body; // 'approve' | 'reject'

  const tx = await Transaction.findById(id);
  if (!tx) return notFound(res, 'Transaction not found');
  if (tx.type !== 'withdrawal') return badRequest(res, 'Not a withdrawal');
  if (tx.status !== 'pending')  return badRequest(res, 'Transaction already processed');

  if (action === 'approve') {
    await Transaction.updateStatus(id, 'completed', { processedBy: req.user.userId });
    emitToUser(tx.user_id, 'withdrawal:approved', { amount: tx.amount, reference: tx.reference });
  } else if (action === 'reject') {
    // Refund balance
    await dbTx(async (client) => {
      await Transaction.updateStatus(id, 'failed', { processedBy: req.user.userId });
      await Account.updateBalance(tx.account_id, tx.amount, client);
    });
    emitToUser(tx.user_id, 'withdrawal:rejected', { amount: tx.amount, reference: tx.reference });
  } else {
    return badRequest(res, 'Action must be approve or reject');
  }

  return success(res, null, `Withdrawal ${action}d`);
}

module.exports = { createDeposit, confirmDeposit, createWithdrawal, getHistory, getSummary, getAllTransactions, processWithdrawal };
