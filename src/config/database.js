'use strict';
const { Pool } = require('pg');
const logger   = require('../utils/logger');
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME     || 'tradex_db',
      user:     process.env.DB_USER     || 'tradex_user',
      password: process.env.DB_PASSWORD || '',
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      min:      parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max:      parseInt(process.env.DB_POOL_MAX, 10) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
});
async function connectDB() {
  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT NOW() as now, version() as version');
    client.release();
    logger.info(`✅ PostgreSQL connected — ${rows[0].version.split(' ').slice(0,2).join(' ')}`);
  } catch (err) {
    logger.error('❌ PostgreSQL connection failed:', err.message);
    throw err;
  }
}
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`DB query [${duration}ms]: ${text.substring(0, 80)}`);
    }
    return result;
  } catch (err) {
    logger.error(`DB query error: ${err.message}\nSQL: ${text}`);
    throw err;
  }
}
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
module.exports = { connectDB, query, transaction, pool };
