# XMR Mining Dashboard

A self-hosted dashboard for monitoring XMR (Monero) mining statistics, styled as a neon cyberpunk control room. It tracks live pool stats, historical hashrate and XMR/USD trends, per-worker status, and can email you a daily summary — all backed by PostgreSQL for long-term history.

![Node](https://img.shields.io/badge/node-%3E%3D18-3ddc84) ![License](https://img.shields.io/badge/license-MIT-22e5cc)

## Features

- Live pool stats: hashrate, hashes, workers, pending balance, paid, last reward, blocks found
- Real-time XMR → USD price tracking, refreshed every 15 minutes
- Historical charts (24h / 7d / 30d / 90d / 1y) for hashrate and XMR/USD, backed by PostgreSQL
- Per-worker table with live **online / idle / offline** status pills
- Minimum 365-day data retention, automatically enforced and pruned
- JSON history import/export tools for backups and migrations
- Optional password-protected admin panel (session-based, HMAC-signed cookies)
- Daily email report via Microsoft Graph, plus manual test-send endpoints
- Toast notifications, skeleton loading states, and a "LIVE" status indicator in the UI
- Automatic migration from legacy SQLite / JSON history files into PostgreSQL

## Project Structure

```
.
├── server.js              # Thin bootstrap: middleware, routes, startup sequencing
├── src/
│   ├── config.js           # All environment variable parsing/constants
│   ├── state.js             # Shared in-memory cache (rates, miner stats, sessions)
│   ├── adminAuth.js          # Admin session/cookie/password logic
│   ├── priceService.js        # XMR/USD price fetching (CoinGecko → CoinCap → Binance)
│   ├── minerStats.js           # Pool stats fetching, caching, worker status classification
│   ├── history.js               # Import/export/normalization of historical data
│   ├── cron.js                    # Scheduled jobs (price/hashrate polling, daily email)
│   ├── db/                         # PostgreSQL pool, schema, metrics, legacy migration
│   ├── email/                       # MS Graph client, email HTML template, daily send
│   └── routes/                       # Express routers, grouped by concern
└── public/
    ├── index.html            # Vue 3 app shell (structure only)
    ├── css/styles.css          # Neon cyberpunk theme
    └── js/app.js                 # Vue app logic (Composition API)
```

No build step: the frontend is plain Vue 3 and Chart.js loaded from CDN, so `public/` is served as-is.

## Docker Setup

### Prerequisites

- Docker
- Docker Compose

### Installation and Running

1. Clone this repository:
   ```bash
   git clone https://github.com/JackWent/Crypto-Monitor.git
   cd crypto-monitor
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the application using Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. Access the dashboard at:
   ```
   http://localhost:7050
   ```

### Docker Components

The application runs in two containers:

1. **xmr-dashboard**: The main Node.js application serving the dashboard
2. **postgres**: Dedicated PostgreSQL database container for metric persistence

## Manual Setup (without Docker)

### Prerequisites

- Node.js (v18 or later)
- npm
- A reachable PostgreSQL instance

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. For development with auto-restart:
   ```bash
   npm run dev
   ```

> Note: `better-sqlite3` is an optional dependency used only for one-time migration from a legacy SQLite file. If its native build tools aren't available on your machine, the app logs a warning and skips that migration path — everything else works normally.

## Configuration

- The dashboard reads runtime settings from environment variables (`.env`)
- Email notifications are sent to addresses defined in `.env`
- XMR price is updated every 15 minutes
- Hashrate samples are persisted continuously while the dashboard is active, with scheduled background sampling every 5 minutes
- Miner stats API responses are cached briefly to reduce upstream calls
- Dashboard live cards refresh every 5 seconds; history charts refresh every 30 seconds (and on period change) with request cancellation to avoid stale chart updates
- Worker status pills are derived client-visible from each worker's last-share age: **online** (< 5 min), **idle** (< 30 min), **offline** (otherwise)
- Metric retention is enforced for at least 365 days
- Emails are sent daily at 10 AM

### Environment Variables (`.env`)

- `PORT` (default: `7050`)
- `DATA_DIR` (default: `/data` in Docker)
- `TZ` (default: `Europe/London`)
- `MINER_STATS_CACHE_TTL_MS` (default: `10000`)
- `HASHRATE_SAMPLE_MIN_INTERVAL_MS` (default: `30000`)
- `DATA_RETENTION_DAYS` (minimum enforced: `365`)
- `POSTGRES_HOST` (default: `postgres`)
- `POSTGRES_PORT` (default: `5432`)
- `POSTGRES_DB` (default: `crypto_dashboard`)
- `POSTGRES_USER` (default: `crypto_dashboard`)
- `POSTGRES_PASSWORD` (required for database access, set this to a strong value)
- `POSTGRES_SSL` (`true` or `false`, default: `false`)
- `XMR_WALLET_ADDRESS` (required for miner stats)
- `GRAPH_TENANT_ID` (required for email features)
- `GRAPH_CLIENT_ID` (required for email features)
- `GRAPH_CLIENT_SECRET` (required for email features)
- `GRAPH_SENDER_EMAIL` (required for email features)
- `GRAPH_RECIPIENT_EMAILS` (comma-separated, required for email features)
- `DASHBOARD_PUBLIC_URL` (used for links/logo in email body)
- `DASHBOARD_LOGO_URL` (optional absolute URL for email logo image; overrides `${DASHBOARD_PUBLIC_URL}/xmr-logo.png`)
  For reliable email rendering, use a public `https://` URL.
- `ADMIN_PASSWORD` (optional; when set, admin routes/UI require password unlock)
- `ADMIN_SESSION_SECRET` (recommended when `ADMIN_PASSWORD` is set; used to sign admin session tokens)
- `ADMIN_SESSION_TTL_MS` (optional; admin session duration in milliseconds, minimum 15 minutes)
- `ADMIN_COOKIE_SECURE` (`true` or `false`, default: `false`; set `true` for HTTPS-only secure admin cookies)

## API Endpoints

- `/api/miner-stats`: Get current miner statistics (includes per-worker `status`: `online` / `idle` / `offline`)
- `/api/xmr-usd-rate`: Get current XMR to USD rate
- `/api/xmr-usd-history`: Get historical XMR to USD rates (supports `?period=24h`, `?period=7d`, `?period=30d`, `?period=90d`, `?period=1y`)
- `/api/hashrate-history`: Get historical hashrate data (supports `?period=24h`, `?period=7d`, `?period=30d`, `?period=90d`, `?period=1y`)
- `/api/admin/session`: Check whether admin auth is enabled and whether the current session is authenticated
- `/api/admin/login`: Authenticate admin session with password (`POST`, JSON body with `password`)
- `/api/admin/logout`: Clear current admin session (`POST`)
- `/api/export-history`: Export full XMR/hashrate history from PostgreSQL to `/data/xmr_history.json` and `/data/hashrate_history.json`
- `/api/export-history/:historyType/download`: Download a full export JSON for `xmr` or `hashrate`
- `/api/import-history`: Import history JSON data via file upload or JSON body
- `/send-daily-email`: Manually trigger the daily email
- `/test-email`: Send a test email with custom subject and content
- `/test-email-with-stats`: Send a test email with mining statistics
- `/health`: JSON health/status report
- `/healthz`: Plain-text liveness check

Admin-only routes (`/api/import-history`, `/api/export-history*`, `/send-daily-email`, `/test-email*`) are protected when `ADMIN_PASSWORD` is configured.

## Maintenance

- Metrics are stored in PostgreSQL tables: `xmr_rate_history`, `hashrate_history`, and `miner_stats_snapshots`
- Metric history timestamps are deduplicated and uniquely indexed in PostgreSQL to prevent duplicate points
- Existing legacy data from `/data/dashboard.db`, `/data/xmr_history.json`, and `/data/hashrate_history.json` is auto-migrated when PostgreSQL tables are empty
- Automatic pruning keeps at least the configured retention period, with a hard minimum of 365 days
- You can export fresh JSON backup files from the Admin panel before rebuilding containers, then restore them with the import tool
- You can also import historical backup files manually from the Admin panel in the dashboard

## License

This project is licensed under the MIT License - see the LICENSE file for details.
