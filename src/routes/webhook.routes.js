'use strict';
const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { confirmDeposit } = require('../controllers/transaction.controller');
const logger = require('../utils/logger');

// Stripe sends raw body — already mounted with express.raw() in server.js
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Stripe webhook signature invalid: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const transactionId = pi.metadata?.transactionId;
      if (transactionId) {
        await confirmDeposit(transactionId);
        logger.info(`Stripe payment confirmed: ${pi.id}`);
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      logger.warn(`Stripe payment failed: ${pi.id} — ${pi.last_payment_error?.message}`);
      // Optionally update transaction status to failed
      break;
    }
    default:
      logger.debug(`Unhandled Stripe event: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
