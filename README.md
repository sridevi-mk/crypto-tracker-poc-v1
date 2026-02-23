# CryptoTracker

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Install dependencies from repo root:
   ```bash
   npm install
   ```
3. Start the app from repo root:
   ```bash
   npx next dev ./crptotracker-workspace
   ```

## Environment Variables
Required:
- `ALCHEMY_API_KEY`
- `AUTH_SECRET`
- `DATABASE_URL` (for Postgres + Prisma)

Common optional:
- `LLM_PROVIDER` (`openai` or `ollama`)
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `ALCHEMY_NETWORK` (default: `eth-mainnet`)
- `COINGECKO_API_KEY`
- `COINGECKO_BASE_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_REFRESH_MS`
- `RATE_LIMIT_CHAT_PER_MINUTE`
- `RATE_LIMIT_ALERTS_PER_MINUTE`
- `RATE_LIMIT_ALERTS_DISPATCH_PER_MINUTE`
- `RATE_LIMIT_AUTH_SIGNIN_PER_MINUTE`
- `RATE_LIMIT_AUTH_SIGNUP_PER_MINUTE`
- `AUTH_USERNAME` (bootstrap admin fallback)
- `AUTH_PASSWORD` (bootstrap admin fallback)
- `USER_STORE_BACKEND` (`postgres` or `file`, default uses postgres when `DATABASE_URL` is set)
- `ALERTS_STORE_BACKEND` (`postgres` or `file`, default uses postgres when `DATABASE_URL` is set)

## Run Commands
From repo root:
```bash
npx next dev ./crptotracker-workspace
npx next build ./crptotracker-workspace
npm test
npm run prisma:generate
npm run prisma:migrate
npm run phase3:predeploy
npm run phase3:postdeploy
```

## MVP Features
- Market overview + screener (CoinGecko-backed)
- Coin detail with chart
- Wallet connect + portfolio balances and USD valuation
- Tuffy AI chat endpoint and floating chat widget
- Real signup + hashed-password sign-in with HttpOnly cookie session
- Protected portfolio page and `/api/portfolio/*` routes
- Persisted user preferences (currency/watchlist) and connected wallets
- Alert rule APIs for price and 24h change thresholds (create/list/delete)
- Cron-safe alert dispatch API with email provider abstraction and per-alert delivery status
- Dashboard watchlist widget with add/remove/list flows via protected user APIs
- Backtesting Lite card (DCA weekly / buy-dip) with ROI, max drawdown, and win rate summary
- AI chat portfolio summary mode: top holdings concentration + stablecoin ratio with beginner-friendly risk note
- Market API resilience: timeout handling, stale-cache fallback, and consistent source/last-updated metadata in UI
- Prisma + Postgres production schema (users, sessions, wallets, preferences) with migration scaffold
- Postgres-first user data layer for auth/preferences/watchlist/wallets with file-store fallback
- Postgres alert persistence (`alert_rules`, `alert_deliveries`, `alert_runs`) with fallback compatibility
- Idempotent alert worker runs (`run_key`) and delivery dedupe keys for scheduler-safe retries

## Phase 1 Delivered
- Global top navigation: Dashboard, Market, Portfolio, Screener, AI Chat, NFT, Guide
- Full-page AI Chat route (`/chat`) in addition to the floating widget
- NFT placeholder route (`/nft`) with planned feature cards
- Enhanced dashboard KPIs (median change, top-5 concentration, breadth ratio)
- Main market UX states: clearer loading, error, and empty handling
- Screener UX upgrades: natural-language query summary + one-click clear filters
- Portfolio beginner guidance + USD estimation notes
- Reusable `Data source` note UI across Market/Screener/Dashboard/Coin/Portfolio
- Server-side auth gate: `/signin` and middleware protection for portfolio routes

## Notes
- Auth supports real user signup/signin with hashed passwords and optional env-admin fallback.
- Chat provider can run via OpenAI or Ollama, depending on server env configuration.
- Alert dispatch endpoint: `POST /api/alerts/dispatch` with `x-alerts-cron-secret`.
- Alert dispatch accepts optional JSON body `{ "run_key": "custom-key" }` for replay-safe idempotent runs.
- Admin run history endpoint: `GET /api/alerts/runs?limit=20` (admin-authenticated) to inspect recent scheduler runs.
- Email provider: set `ALERTS_EMAIL_PROVIDER=log|resend` and configure related env vars.
- Scheduler security: preferred signed headers `x-alerts-ts`, `x-alerts-nonce`, `x-alerts-signature` (HMAC-SHA256 over `ts.nonce.body`), with legacy secret header/bearer still supported.
- Scheduler helper script: generate signed headers with `node scripts/sign-alerts-request.mjs --secret <ALERTS_CRON_SECRET> --body '{"run_key":"manual-1"}'`.

## Deployment
- Set all required env vars in your hosting platform, especially auth, chat provider, and alert secrets.
- Build and run:
  ```bash
  npx next build ./crptotracker-workspace
  npx next start ./crptotracker-workspace -p 3001
  ```
- In production, keep `ALERTS_CRON_SECRET` strong and call `/api/alerts/dispatch` from a scheduled job.
- Adjust rate limits (`RATE_LIMIT_*`) to match expected traffic and hosting constraints.
- Post-deploy smoke test:
  ```bash
  APP_BASE_URL=https://your-app-domain.com ALERTS_CRON_SECRET=your_secret npm run phase3:postdeploy
  ```

## Postgres Setup (Phase 3)
1. Set `DATABASE_URL` in `crptotracker-workspace/.env`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```
4. Apply migrations:
   ```bash
   npm run prisma:migrate
   ```
5. Run predeploy checks:
   ```bash
   npm run phase3:predeploy
   ```
