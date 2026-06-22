'use strict';
require('express-async-errors');
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const compression = require('compression');
const path       = require('path');

const { connectDB }       = require('./config/database');
const { connectRedis }    = require('./config/redis');
const { initSocket }      = require('./config/socket');
const errorHandler        = require('./middleware/errorHandler');
const requestLogger       = require('./middleware/requestLogger');
const { globalRateLimit } = require('./middleware/rateLimiter');
const logger              = require('./utils/logger');

// ── Route imports ────────────────────────────────────
const authRoutes       = require('./routes/auth.routes');
const userRoutes       = require('./routes/user.routes');
const accountRoutes    = require('./routes/account.routes');
const tradeRoutes      = require('./routes/trade.routes');
const transactionRoutes = require('./routes/transaction.routes');
const marketRoutes     = require('./routes/market.routes');
const kycRoutes        = require('./routes/kyc.routes');
const adminRoutes      = require('./routes/admin.routes');
const webhookRoutes    = require('./routes/webhook.routes');

const app = express();

// ── Security & parsing ───────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // set your own CSP in production
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Stripe webhooks need raw body — mount BEFORE json middleware
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(requestLogger);
app.use(globalRateLimit);

// ── Static files ─────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Health check ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TradeX API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ───────────────────────────────────────
const API = `/api/${process.env.API_VERSION || 'v1'}`;

app.use(`${API}/auth`,         authRoutes);
app.use(`${API}/users`,        userRoutes);
app.use(`${API}/accounts`,     accountRoutes);
app.use(`${API}/trades`,       tradeRoutes);
app.use(`${API}/transactions`, transactionRoutes);
app.use(`${API}/markets`,      marketRoutes);
app.use(`${API}/kyc`,          kycRoutes);
app.use(`${API}/admin`,        adminRoutes);
app.use(`${API}/webhooks`,     webhookRoutes);

// ── 404 handler ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Global error handler ─────────────────────────────
app.use(errorHandler);

// ── Boot ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;

async function start() {
  try {
    await connectDB();
    await connectRedis();

    const server = app.listen(PORT, () => {
      logger.info(`🚀 TradeX API running on port ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`📡 API base: http://localhost:${PORT}${API}`);
    });

    initSocket(server);

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = app; // for testing
