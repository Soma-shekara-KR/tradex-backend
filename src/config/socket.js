'use strict';
const { Server } = require('socket.io');
const logger     = require('../utils/logger');
const { verifyToken } = require('../utils/jwt');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // ── Auth middleware ───────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ||
                  socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyToken(token);
      socket.userId = payload.userId;
      socket.userRole = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ────────────────────────────
  io.on('connection', (socket) => {
    logger.info(`Socket connected: user ${socket.userId}`);

    // Join user-specific room for private notifications
    socket.join(`user:${socket.userId}`);

    // Subscribe to market rooms
    socket.on('subscribe:market', (symbols) => {
      if (!Array.isArray(symbols)) return;
      symbols.forEach(sym => {
        socket.join(`market:${sym.toUpperCase()}`);
      });
    });

    socket.on('unsubscribe:market', (symbols) => {
      if (!Array.isArray(symbols)) return;
      symbols.forEach(sym => socket.leave(`market:${sym.toUpperCase()}`));
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: user ${socket.userId}`);
    });
  });

  // ── Broadcast helpers ─────────────────────────────
  startPriceBroadcast();

  logger.info('✅ Socket.io initialised');
  return io;
}

// Simulate live price updates every second
// In production, replace with real data feed (TwelveData WS / MT5 bridge)
const basePrices = {
  EURUSD: 1.08741, GBPUSD: 1.27108, USDJPY: 154.32,
  XAUUSD: 2341.50, XAGUSD: 29.24,
  BTCUSD: 67420,   ETHUSD: 3412,   SOLUSD: 168.40,
  USOIL:  78.32,   UKOIL:  82.11,
  US30:   38941,   US500:  5234,    USTEC: 18241,
};

function startPriceBroadcast() {
  if (!io) return;
  setInterval(() => {
    const prices = {};
    for (const [sym, base] of Object.entries(basePrices)) {
      const change = (Math.random() - 0.5) * base * 0.0003;
      basePrices[sym] = +(base + change).toFixed(sym.includes('USD') && base > 100 ? 2 : 5);
      prices[sym] = {
        symbol: sym,
        bid:    basePrices[sym],
        ask:    +(basePrices[sym] * 1.00005).toFixed(5),
        change: +change.toFixed(5),
        ts:     Date.now(),
      };
      io.to(`market:${sym}`).emit('price:update', prices[sym]);
    }
    // Broadcast all prices to anyone subscribed to 'market:ALL'
    io.to('market:ALL').emit('prices:all', prices);
  }, 1000);
}

function getIO()         { return io; }
function emitToUser(uid, event, data) { io?.to(`user:${uid}`).emit(event, data); }
function emitToAll(event, data)       { io?.emit(event, data); }

module.exports = { initSocket, getIO, emitToUser, emitToAll };
