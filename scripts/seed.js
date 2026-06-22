'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME     || 'tradex_db',
  user:     process.env.DB_USER     || 'tradex_user',
  password: process.env.DB_PASSWORD || '',
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding database...');

    const adminId = uuidv4();
    const userId1 = uuidv4();
    const userId2 = uuidv4();
    const adminHash = await bcrypt.hash('Admin@123456', 12);
    const userHash  = await bcrypt.hash('User@123456', 12);

    // ── Admin user ───────────────────────────────────
    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, status,
        kyc_status, email_verified, phone, country, referral_code)
      VALUES ($1,$2,$3,$4,$5,'admin','active','approved',true,'+442012345678','UK','ADMIN001')
      ON CONFLICT (email) DO NOTHING`,
      [adminId, 'admin@tradex.com', adminHash, 'Admin', 'TradeX']
    );

    // ── Demo users ───────────────────────────────────
    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, status,
        kyc_status, email_verified, phone, country, referral_code)
      VALUES ($1,$2,$3,$4,$5,'user','active','approved',true,'+919876543210','India','REF10001')
      ON CONFLICT (email) DO NOTHING`,
      [userId1, 'john@example.com', userHash, 'John', 'Smith']
    );

    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, status,
        kyc_status, email_verified, phone, country, referral_code)
      VALUES ($1,$2,$3,$4,$5,'user','active','pending',false,'+971501234567','UAE','REF10002')
      ON CONFLICT (email) DO NOTHING`,
      [userId2, 'sarah@example.com', userHash, 'Sarah', 'Ahmed']
    );

    // ── Trading accounts ─────────────────────────────
    const acc1 = uuidv4();
    const acc2 = uuidv4();
    const acc3 = uuidv4();

    await client.query(`
      INSERT INTO trading_accounts (id, user_id, account_number, type, status, currency, balance, equity, leverage, is_demo, platform)
      VALUES
        ($1, $4, 'TX-1084821', 'standard', 'active', 'USD', 12450.00, 13210.80, 2000, false, 'MT5'),
        ($2, $4, 'TX-1084822', 'demo',     'active', 'USD', 10000.00, 10000.00, 2000, true,  'MT5'),
        ($3, $5, 'TX-1084823', 'pro',      'active', 'USD', 5000.00,  5000.00,  1000, false, 'MT5')
      ON CONFLICT (account_number) DO NOTHING`,
      [acc1, acc2, acc3, userId1, userId2]
    );

    // ── Sample transactions ───────────────────────────
    const txRefs = ['TRX-8821047','TRX-8819334','TRX-8814821','TRX-8809211'];
    const txData = [
      [userId1, acc1, 'deposit',    'completed', 'card',     500.00,  0,   txRefs[0]],
      [userId1, acc1, 'withdrawal', 'completed', 'bank_wire',200.00,  0,   txRefs[1]],
      [userId1, acc1, 'deposit',    'completed', 'crypto',   1000.00, 0,   txRefs[2]],
      [userId1, acc1, 'deposit',    'completed', 'card',     2000.00, 0,   txRefs[3]],
    ];

    for (const [uid, aid, type, status, method, amount, fee, ref] of txData) {
      await client.query(`
        INSERT INTO transactions (user_id, account_id, type, status, method, amount, fee, currency, reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$8) ON CONFLICT (reference) DO NOTHING`,
        [uid, aid, type, status, method, amount, fee, ref]
      );
    }

    // ── Sample open trades ────────────────────────────
    await client.query(`
      INSERT INTO trades (account_id, user_id, symbol, side, status, volume, open_price, stop_loss, take_profit, margin_used)
      VALUES
        ($1,$2,'XAUUSD','buy','open',0.50,2330.10,2310.00,2360.00,58.25),
        ($1,$2,'EURUSD','buy','open',1.00,1.08600,1.08200,1.09000,54.30),
        ($1,$2,'BTCUSD','sell','open',0.10,68100,69000,66000,340.50)
      ON CONFLICT DO NOTHING`,
      [acc1, userId1]
    );

    // ── Notifications ─────────────────────────────────
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES
        ($1,'deposit','Deposit received','Your deposit of $500.00 has been credited to your account.'),
        ($1,'kyc','KYC approved','Your identity has been verified. Full account access enabled.'),
        ($1,'trade','Trade opened','XAUUSD Buy 0.5 lots opened at 2330.10')`,
      [userId1]
    );

    console.log('✅ Seed complete');
    console.log('');
    console.log('👤 Admin:  admin@tradex.com  / Admin@123456');
    console.log('👤 User 1: john@example.com  / User@123456');
    console.log('👤 User 2: sarah@example.com / User@123456');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
