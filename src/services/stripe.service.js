'use strict';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const logger = require('../utils/logger');

const StripeService = {

  /**
   * Create a Payment Intent for a card deposit
   * @param {number} amount    Amount in major currency units (e.g. dollars)
   * @param {string} currency  ISO currency code
   * @param {object} metadata  { userId, accountId, transactionId }
   */
  async createPaymentIntent(amount, currency = 'USD', metadata = {}) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe uses smallest currency unit (cents)
        currency: currency.toLowerCase(),
        metadata,
        automatic_payment_methods: { enabled: true },
      });
      return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
    } catch (err) {
      logger.error(`Stripe createPaymentIntent failed: ${err.message}`);
      throw err;
    }
  },

  async retrievePaymentIntent(id) {
    return stripe.paymentIntents.retrieve(id);
  },

  async refund(paymentIntentId, amount = null) {
    const params = { payment_intent: paymentIntentId };
    if (amount) params.amount = Math.round(amount * 100);
    return stripe.refunds.create(params);
  },

  /**
   * Create or fetch a Stripe customer for saved cards
   */
  async getOrCreateCustomer(userId, email, name) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length) return existing.data[0];
    return stripe.customers.create({ email, name, metadata: { userId } });
  },

  /**
   * Verify webhook signature — used in webhook.routes.js
   */
  constructWebhookEvent(rawBody, signature) {
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  },
};

module.exports = StripeService;
