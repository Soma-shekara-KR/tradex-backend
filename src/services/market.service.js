'use strict';
const { get, setEx } = require('../config/redis');
const logger = require('../utils/logger');

// In-memory price store (seeded with realistic values)
const livePrices = {
  EURUSD: { bid:1.08736, ask:1.08747, category:'forex' },
  GBPUSD: { bid:1.27108, ask:1.27121, category:'forex' },
  USDJPY: { bid:154.310, ask:154.322, category:'forex' },
  AUDUSD: { bid:0.65410, ask:0.65422, category:'forex' },
  USDCAD: { bid:1.36420, ask:1.36432, category:'forex' },
  USDCHF: { bid:0.90210, ask:0.90222, category:'forex' },
  NZDUSD: { bid:0.60110, ask:0.60122, category:'forex' },
  XAUUSD: { bid:2341.40, ask:2341.54, category:'metals' },
  XAGUSD: { bid:29.241,  ask:29.258,  category:'metals' },
  USOIL:  { bid:78.29,   ask:78.32,   category:'energy' },
  UKOIL:  { bid:82.11,   ask:82.15,   category:'energy' },
  US30:   { bid:38938,   ask:38944,   category:'indices' },
  US500:  { bid:5234,    ask:5236,    category:'indices' },
  USTEC:  { bid:18241,   ask:18245,   category:'indices' },
  BTCUSD: { bid:67390,   ask:67450,   category:'crypto' },
  ETHUSD: { bid:3408,    ask:3416,    category:'crypto' },
  SOLUSD: { bid:168.40,  ask:168.90,  category:'crypto' },
  AAPL:   { bid:189.43,  ask:189.47,  category:'stocks' },
  TSLA:   { bid:172.28,  ask:172.32,  category:'stocks' },
  AMZN:   { bid:184.51,  ask:184.56,  category:'stocks' },
  MSFT:   { bid:420.10,  ask:420.18,  category:'stocks' },
};

// Simulate small price movements every second
setInterval(() => {
  for (const [sym, price] of Object.entries(livePrices)) {
    const move  = (Math.random() - 0.5) * price.bid * 0.0002;
    const spread = price.ask - price.bid;
    price.bid   = parseFloat((price.bid + move).toFixed(price.bid > 100 ? 2 : 5));
    price.ask   = parseFloat((price.bid + spread).toFixed(price.bid > 100 ? 2 : 5));
    price.change = parseFloat(move.toFixed(5));
    price.ts     = Date.now();
  }
}, 1000);

const MarketService = {

  async getPrice(symbol) {
    // 1. Check Redis cache for real price
    const cached = await get(`price:${symbol}`);
    if (cached) return cached;
    // 2. Fall back to in-memory simulated price
    return livePrices[symbol] || null;
  },

  async getAllPrices(symbols = null) {
    const src = symbols
      ? Object.fromEntries(symbols.filter(s => livePrices[s]).map(s => [s, livePrices[s]]))
      : livePrices;
    return src;
  },

  getInstruments(category = null) {
    const instruments = [
      { symbol:'EURUSD', name:'Euro / US Dollar',      category:'forex',   leverage:2000, spread:0.1,  minLot:0.01 },
      { symbol:'GBPUSD', name:'Pound / US Dollar',     category:'forex',   leverage:2000, spread:0.13, minLot:0.01 },
      { symbol:'USDJPY', name:'US Dollar / Yen',       category:'forex',   leverage:2000, spread:0.12, minLot:0.01 },
      { symbol:'AUDUSD', name:'Aussie / US Dollar',    category:'forex',   leverage:2000, spread:0.12, minLot:0.01 },
      { symbol:'USDCAD', name:'Dollar / Canadian',     category:'forex',   leverage:2000, spread:0.14, minLot:0.01 },
      { symbol:'XAUUSD', name:'Gold / US Dollar',      category:'metals',  leverage:2000, spread:0.14, minLot:0.01 },
      { symbol:'XAGUSD', name:'Silver / US Dollar',    category:'metals',  leverage:1000, spread:0.02, minLot:0.01 },
      { symbol:'USOIL',  name:'US Crude Oil WTI',      category:'energy',  leverage:200,  spread:0.03, minLot:0.1  },
      { symbol:'UKOIL',  name:'UK Brent Crude',        category:'energy',  leverage:200,  spread:0.04, minLot:0.1  },
      { symbol:'US30',   name:'Dow Jones 30',          category:'indices', leverage:500,  spread:1.2,  minLot:0.1  },
      { symbol:'US500',  name:'S&P 500',               category:'indices', leverage:500,  spread:0.8,  minLot:0.1  },
      { symbol:'USTEC',  name:'NASDAQ 100',            category:'indices', leverage:500,  spread:1.5,  minLot:0.1  },
      { symbol:'BTCUSD', name:'Bitcoin / US Dollar',   category:'crypto',  leverage:100,  spread:20,   minLot:0.01 },
      { symbol:'ETHUSD', name:'Ethereum / US Dollar',  category:'crypto',  leverage:100,  spread:8,    minLot:0.01 },
      { symbol:'SOLUSD', name:'Solana / US Dollar',    category:'crypto',  leverage:50,   spread:0.5,  minLot:0.1  },
      { symbol:'AAPL',   name:'Apple Inc.',            category:'stocks',  leverage:20,   spread:0.12, minLot:1    },
      { symbol:'TSLA',   name:'Tesla Inc.',            category:'stocks',  leverage:20,   spread:0.11, minLot:1    },
      { symbol:'AMZN',   name:'Amazon.com Inc.',       category:'stocks',  leverage:20,   spread:0.13, minLot:1    },
      { symbol:'MSFT',   name:'Microsoft Corp.',       category:'stocks',  leverage:20,   spread:0.10, minLot:1    },
    ];
    if (category) return instruments.filter(i => i.category === category);
    return instruments;
  },

  // Generate synthetic OHLC candles (replace with real API in production)
  getCandles(symbol, interval = '1h', limit = 100) {
    const price  = livePrices[symbol]?.bid || 1.0;
    const candles = [];
    let   current = price;
    const now     = Date.now();
    const intervals = { '1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000 };
    const ms = intervals[interval] || 3600000;

    for (let i = limit; i >= 0; i--) {
      const open  = current;
      const move  = (Math.random() - 0.48) * current * 0.003;
      const close = parseFloat((open + move).toFixed(5));
      const high  = parseFloat((Math.max(open, close) + Math.random() * current * 0.001).toFixed(5));
      const low   = parseFloat((Math.min(open, close) - Math.random() * current * 0.001).toFixed(5));
      const volume = Math.floor(Math.random() * 5000 + 1000);
      candles.push({ time: now - i * ms, open, high, low, close, volume });
      current = close;
    }
    return candles;
  },

  // Called from production to cache real prices from TwelveData
  async cachePrice(symbol, data) {
    await setEx(`price:${symbol}`, 5, data);
    if (livePrices[symbol]) {
      livePrices[symbol].bid    = data.bid;
      livePrices[symbol].ask    = data.ask;
      livePrices[symbol].change = data.change;
    }
  },
};

module.exports = MarketService;
