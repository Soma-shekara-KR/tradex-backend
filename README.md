# TradeX Backend API

Production-ready Node.js + Express + PostgreSQL backend for the TradeX trading platform frontend (Phase 1 & 2). Implements **Phase 3** of the build plan: authentication, trading accounts, order execution, deposits/withdrawals, KYC, live market data, and an admin panel API.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL 14+ |
| Cache / Sessions | Redis |
| Realtime | Socket.io (live prices, trade/notification push) |
| Auth | JWT (access + refresh tokens) |
| Payments | Stripe (card deposits) |
| Email | Nodemailer (SMTP / SendGrid) |
| File uploads | Multer (KYC docs, avatars) |
| Validation | express-validator |
| Logging | Winston |

---

## 📁 Project Structure

```
tradex-backend/
├── src/
│   ├── config/         # database, redis, socket.io setup
│   ├── controllers/    # request handlers (business logic)
│   ├── middleware/     # auth, validation, rate-limit, upload, errors
│   ├── models/         # SQL query layer (no ORM — raw pg)
│   ├── routes/         # Express route definitions
│   ├── services/       # email, stripe, market data
│   ├── utils/          # logger, jwt, response helpers
│   └── server.js       # app entry point
├── scripts/
│   ├── schema.sql      # full Postgres schema
│   ├── migrate.js      # runs schema.sql
│   └── seed.js         # demo data (admin + 2 users + accounts + trades)
├── uploads/             # KYC docs & avatars (gitignored)
├── logs/                 # winston logs (gitignored)
├── .env.example
├── package.json
└── TradeX.postman_collection.json   # import into Postman to test every endpoint
```

---

## 🚀 Setup — Step by Step

### 1. Install prerequisites
You need these installed on your machine (not provided in this sandbox):
- **Node.js 18+** — https://nodejs.org
- **PostgreSQL 14+** — https://www.postgresql.org/download/
- **Redis** (optional but recommended) — https://redis.io/download

### 2. Download & install dependencies
```bash
cd tradex-backend
npm install
```

### 3. Create the database
```bash
psql -U postgres
CREATE DATABASE tradex_db;
CREATE USER tradex_user WITH ENCRYPTED PASSWORD 'your_strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE tradex_db TO tradex_user;
\q
```

### 4. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in at minimum:
- `DB_PASSWORD` — the password you set above
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — any random 32+ character strings
- `STRIPE_SECRET_KEY` — from https://dashboard.stripe.com/test/apikeys (test mode is free)
- `SMTP_USER` / `SMTP_PASS` — SendGrid API key (free tier: 100 emails/day) or any SMTP provider

> The server **will start without Stripe/Redis/SMTP configured** — those features degrade gracefully (e.g. Redis cache falls back to in-memory) so you can develop locally without every third-party key.

### 5. Run migrations & seed demo data
```bash
npm run db:migrate
npm run db:seed
```
This creates all tables and seeds:
| Role | Email | Password |
|---|---|---|
| Admin | admin@tradex.com | Admin@123456 |
| User  | john@example.com | User@123456 |
| User  | sarah@example.com | User@123456 |

### 6. Start the server
```bash
npm run dev     # with auto-reload (nodemon)
# or
npm start       # production mode
```

Server runs at `http://localhost:5000`. Health check: `GET http://localhost:5000/health`

### 7. Test the API
Import `TradeX.postman_collection.json` into Postman, run **Auth → Login** first (it auto-saves the token), then run any other request.

---

## 🔌 Connecting the Frontend (Phase 1 & 2 HTML pages)

The HTML pages currently use mock JS data. To connect them to this backend:

1. Add a `config.js` to the frontend with `const API_BASE = 'http://localhost:5000/api/v1';`
2. Replace the fake `onclick="window.location.href='dashboard.html'"` login logic with a `fetch(`${API_BASE}/auth/login`, {...})` call, store the returned `accessToken` in memory/sessionStorage, then redirect.
3. On `dashboard.html`, replace the hard-coded balance/positions with a `fetch(`${API_BASE}/users/me/dashboard`)` call using the stored token in the `Authorization: Bearer <token>` header.
4. For live prices, connect via Socket.io:
   ```js
   const socket = io('http://localhost:5000', { auth: { token: accessToken } });
   socket.emit('subscribe:market', ['EURUSD','XAUUSD','BTCUSD']);
   socket.on('price:update', (data) => { /* update DOM */ });
   ```

I can wire this up for you — just ask "connect the frontend to the backend" next.

---

## 📡 API Endpoints Overview

All routes are prefixed with `/api/v1`.

### Auth (`/auth`)
| Method | Route | Description |
|---|---|---|
| POST | `/register` | Create account + verification email |
| POST | `/login` | Returns access + refresh JWT |
| POST | `/refresh` | Get new access token |
| POST | `/logout` | Blacklist token, delete session |
| GET  | `/verify/:token` | Confirm email |
| POST | `/forgot-password` | Send reset email |
| POST | `/reset-password` | Set new password via token |
| POST | `/change-password` | Authenticated password change |
| POST | `/send-otp` / `/verify-otp` | Phone verification |

### Users (`/users`)
`GET /me`, `PUT /me`, `POST /me/avatar`, `GET /me/dashboard`, `GET /notifications`

### Accounts (`/accounts`)
`GET /`, `GET /:id`, `POST /` (create Standard/Pro/Raw/Demo account)

### Trades (`/trades`)
`POST /` (open), `PUT /:id/close`, `PUT /:id/modify` (SL/TP), `GET /open`, `GET /history/:accountId`, `GET /stats/:accountId`

### Transactions (`/transactions`)
`POST /deposit` (Stripe), `POST /withdraw`, `GET /`, `GET /summary`
Admin: `GET /admin`, `PUT /admin/:id/process`

### Markets (`/markets`)
`GET /prices`, `GET /price/:symbol`, `GET /instruments`, `GET /candles/:symbol`
`POST /alerts`, `GET /alerts`, `DELETE /alerts/:id`

### KYC (`/kyc`)
`POST /upload`, `GET /` (my docs)
Admin: `GET /pending`, `PUT /:id/review`

### Admin (`/admin`) — requires `admin` or `manager` role
`GET /stats`, `GET /users`, `GET /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/kyc`, `GET /accounts`, `GET /transactions`, `GET /audit-logs`

### Webhooks (`/webhooks`)
`POST /stripe` — Stripe payment confirmation (configure in Stripe Dashboard)

---

## 🗄️ Database Schema Summary

11 tables: `users`, `trading_accounts`, `kyc_documents`, `trades`, `transactions`, `price_alerts`, `notifications`, `sessions`, `audit_logs`, plus enums for status fields. See `scripts/schema.sql` for full definitions with indexes and triggers.

Key design choices:
- **UUID primary keys** everywhere (no sequential IDs exposed to clients)
- **Generated columns** for `free_margin` and `net_amount` (always in sync, no app-side bugs)
- **Auto `updated_at` triggers** on core tables
- **Transactions wrap** every balance-affecting operation (open/close trade, deposit/withdraw) via `pg` client transactions — no race conditions

---

## 🔐 Security Features Implemented

- Bcrypt password hashing (12 salt rounds)
- JWT access (7d) + refresh (30d) token rotation, stored sessions table
- Token blacklist on logout (Redis)
- Rate limiting (global + stricter on `/auth/*` and `/transactions/deposit`)
- Helmet.js security headers
- express-validator on every input
- Parameterised SQL everywhere (no string concatenation — zero SQL injection surface)
- Role-based access control (`user` / `manager` / `admin`)
- Audit log table for compliance

---

## ⚠️ What's Still Needed for Production

This backend is feature-complete for the application layer, but **before going live** you still need:

1. **Real market data feed** — currently simulated in `market.service.js`. Replace with TwelveData/Alpha Vantage WebSocket or an MT5 bridge.
2. **MT5 white-label integration** — actual order execution currently just writes to Postgres; for real trading you need a licensed MT5 server (MetaQuotes) or a similar liquidity bridge.
3. **KYC provider** — wire `kyc.controller.js` to Sumsub/Onfido for automated document verification instead of manual admin review.
4. **Production Stripe keys + webhook endpoint** registered in the Stripe dashboard pointing to `https://yourdomain.com/api/v1/webhooks/stripe`.
5. **A financial license** (FSA Seychelles, CySEC, etc.) — see Phase 5 in the original roadmap. This is a legal requirement before accepting real client funds, separate from any code.
6. **HTTPS + production secrets** — never run with the default `.env.example` secrets in production.

---

## 🧪 Running Tests
```bash
npm test
```
(Test scaffold included via `jest` + `supertest` — add test files under `tests/` as you build out coverage.)

---

## 📝 License
Proprietary — built for TradeX platform.
