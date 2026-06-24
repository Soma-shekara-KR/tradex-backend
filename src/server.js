// TradeX API Server v2
'use strict';
process.on('uncaughtException', (err) => { console.error('UNCAUGHT:', err.message, err.stack); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('UNHANDLED:', reason); process.exit(1); });
const fs = require('fs');
const dotenv = require('dotenv');
if (fs.existsSync('/etc/secrets/.env')) { dotenv.config({ path: '/etc/secrets/.env' }); } else { dotenv.config(); }
console.log('DB_HOST:', process.env.DB_HOST || 'NOT SET');
console.log('PORT:', process.env.PORT || 'NOT SET');
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initSocket } = require('./config/socket');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { globalRateLimit } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const accountRoutes = require('./routes/account.routes');
const tradeRoutes = require('./routes/trade.routes');
const transactionRoutes = require('./routes/transaction.routes');
const marketRoutes = require('./routes/market.routes');
const kycRoutes = require('./routes/kyc.routes');
const adminRoutes = require('./routes/admin.routes');
const webhookRoutes = require('./routes/webhook.routes');
const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Requested-With'] }));
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(requestLogger);
app.use(globalRateLimit);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.get('/health', (req, res) => { res.json({ status: 'ok', service: 'TradeX API', timestamp: new Date().toISOString() }); });
const API = '/api/v1';
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/accounts`, accountRoutes);
app.use(`${API}/trades`, tradeRoutes);
app.use(`${API}/transactions`, transactionRoutes);
app.use(`${API}/markets`, marketRoutes);
app.use(`${API}/kyc`, kycRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/webhooks`, webhookRoutes);
app.use((req, res) => { res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` }); });
app.use(errorHandler);
const PORT = parseInt(process.env.PORT, 10) || 5000;
async function start() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Connecting to Redis...');
    await connectRedis();
    const server = app.listen(PORT, '0.0.0.0', () => { logger.info(`TradeX API running on port ${PORT}`); console.log(`TradeX API running on port ${PORT}`); });
    initSocket(server);
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
    process.on('SIGINT', () => server.close(() => process.exit(0)));
  } catch (err) {
    console.error('STARTUP FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}
start();
module.exports = app;

