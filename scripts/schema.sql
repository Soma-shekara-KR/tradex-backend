-- ============================================================
--  TradeX Platform — Full PostgreSQL Schema
--  Run: node scripts/migrate.js
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMs ────────────────────────────────────────────────────

CREATE TYPE user_role        AS ENUM ('user','manager','admin');
CREATE TYPE user_status      AS ENUM ('pending','active','suspended','banned');
CREATE TYPE kyc_status       AS ENUM ('not_submitted','pending','approved','rejected');
CREATE TYPE account_type     AS ENUM ('standard','pro','raw_spread','demo');
CREATE TYPE account_status   AS ENUM ('active','inactive','suspended');
CREATE TYPE trade_side       AS ENUM ('buy','sell');
CREATE TYPE trade_status     AS ENUM ('open','closed','cancelled','pending');
CREATE TYPE tx_type          AS ENUM ('deposit','withdrawal','transfer','bonus','commission','adjustment');
CREATE TYPE tx_status        AS ENUM ('pending','processing','completed','failed','cancelled');
CREATE TYPE tx_method        AS ENUM ('card','bank_wire','crypto','neteller','skrill','upi','internal');
CREATE TYPE doc_type         AS ENUM ('passport','national_id','drivers_license','utility_bill','bank_statement','selfie');
CREATE TYPE notification_type AS ENUM ('trade','deposit','withdrawal','kyc','system','price_alert','margin_call');

-- ── USERS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  phone             VARCHAR(30),
  phone_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  country           VARCHAR(100),
  address           TEXT,
  date_of_birth     DATE,
  avatar_url        VARCHAR(500),
  role              user_role   NOT NULL DEFAULT 'user',
  status            user_status NOT NULL DEFAULT 'pending',
  kyc_status        kyc_status  NOT NULL DEFAULT 'not_submitted',
  two_fa_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  two_fa_secret     VARCHAR(100),
  referral_code     VARCHAR(20)  UNIQUE,
  referred_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  last_login_at     TIMESTAMPTZ,
  last_login_ip     INET,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  email_verify_token VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email   ON users(email);
CREATE INDEX idx_users_status  ON users(status);
CREATE INDEX idx_users_kyc     ON users(kyc_status);
CREATE INDEX idx_users_referral ON users(referral_code);

-- ── TRADING ACCOUNTS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trading_accounts (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number  VARCHAR(20)   NOT NULL UNIQUE,
  type            account_type  NOT NULL DEFAULT 'standard',
  status          account_status NOT NULL DEFAULT 'active',
  currency        VARCHAR(10)   NOT NULL DEFAULT 'USD',
  balance         NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  equity          NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  margin_used     NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  free_margin     NUMERIC(18,2) GENERATED ALWAYS AS (equity - margin_used) STORED,
  leverage        INTEGER       NOT NULL DEFAULT 2000,
  is_demo         BOOLEAN       NOT NULL DEFAULT FALSE,
  platform        VARCHAR(30)   NOT NULL DEFAULT 'MT5',
  mt5_login       VARCHAR(30),
  mt5_password    VARCHAR(100),
  mt5_server      VARCHAR(100),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user   ON trading_accounts(user_id);
CREATE INDEX idx_accounts_number ON trading_accounts(account_number);

-- ── KYC DOCUMENTS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kyc_documents (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type        doc_type    NOT NULL,
  file_url        VARCHAR(500) NOT NULL,
  file_name       VARCHAR(255),
  file_size       INTEGER,
  mime_type       VARCHAR(100),
  status          kyc_status  NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by     UUID        REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  sumsub_id       VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_user   ON kyc_documents(user_id);
CREATE INDEX idx_kyc_status ON kyc_documents(status);

-- ── TRADES ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trades (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID          NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          VARCHAR(20)   NOT NULL,
  side            trade_side    NOT NULL,
  status          trade_status  NOT NULL DEFAULT 'open',
  volume          NUMERIC(10,2) NOT NULL,
  open_price      NUMERIC(18,5) NOT NULL,
  close_price     NUMERIC(18,5),
  stop_loss       NUMERIC(18,5),
  take_profit     NUMERIC(18,5),
  margin_used     NUMERIC(18,2) NOT NULL DEFAULT 0,
  commission      NUMERIC(18,2) NOT NULL DEFAULT 0,
  swap            NUMERIC(18,2) NOT NULL DEFAULT 0,
  profit_loss     NUMERIC(18,2),
  pips            NUMERIC(10,2),
  platform        VARCHAR(30)   DEFAULT 'web',
  comment         TEXT,
  opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_account  ON trades(account_id);
CREATE INDEX idx_trades_user     ON trades(user_id);
CREATE INDEX idx_trades_symbol   ON trades(symbol);
CREATE INDEX idx_trades_status   ON trades(status);
CREATE INDEX idx_trades_opened   ON trades(opened_at DESC);

-- ── TRANSACTIONS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transactions (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id      UUID          REFERENCES trading_accounts(id) ON DELETE SET NULL,
  type            tx_type       NOT NULL,
  status          tx_status     NOT NULL DEFAULT 'pending',
  method          tx_method     NOT NULL DEFAULT 'card',
  amount          NUMERIC(18,2) NOT NULL,
  fee             NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(18,2) GENERATED ALWAYS AS (amount - fee) STORED,
  currency        VARCHAR(10)   NOT NULL DEFAULT 'USD',
  reference       VARCHAR(100)  UNIQUE NOT NULL,
  external_ref    VARCHAR(255),    -- Stripe payment intent / bank ref
  stripe_pi_id    VARCHAR(255),
  crypto_address  VARCHAR(255),
  crypto_txhash   VARCHAR(255),
  bank_name       VARCHAR(255),
  bank_account    VARCHAR(100),
  notes           TEXT,
  processed_by    UUID          REFERENCES users(id),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_user      ON transactions(user_id);
CREATE INDEX idx_tx_account   ON transactions(account_id);
CREATE INDEX idx_tx_status    ON transactions(status);
CREATE INDEX idx_tx_type      ON transactions(type);
CREATE INDEX idx_tx_reference ON transactions(reference);
CREATE INDEX idx_tx_created   ON transactions(created_at DESC);

-- ── PRICE ALERTS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          VARCHAR(20)   NOT NULL,
  target_price    NUMERIC(18,5) NOT NULL,
  direction       VARCHAR(10)   NOT NULL CHECK (direction IN ('above','below')),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  triggered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user   ON price_alerts(user_id);
CREATE INDEX idx_alerts_symbol ON price_alerts(symbol);
CREATE INDEX idx_alerts_active ON price_alerts(is_active);

-- ── NOTIFICATIONS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            notification_type NOT NULL,
  title           VARCHAR(200)      NOT NULL,
  message         TEXT              NOT NULL,
  is_read         BOOLEAN           NOT NULL DEFAULT FALSE,
  data            JSONB,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user   ON notifications(user_id);
CREATE INDEX idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ── SESSIONS (refresh tokens) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token   TEXT        NOT NULL UNIQUE,
  ip_address      INET,
  user_agent      TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user  ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(refresh_token);

-- ── AUDIT LOG ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user   ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);

-- ── AUTO-UPDATE updated_at trigger ───────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','trading_accounts','kyc_documents','trades','transactions'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ── SEQUENCE for account numbers ──────────────────────────────

CREATE SEQUENCE IF NOT EXISTS account_number_seq START 1000001;

-- Done
SELECT 'Schema migration complete' AS status;
