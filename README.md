# paper

[![CI](https://github.com/pink-potat0/paper/actions/workflows/ci.yml/badge.svg)](https://github.com/pink-potat0/paper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Learn to trade Solana memecoins through lessons, practice tools, and an AI trading assistant.

Live: [trypaper.fun](https://www.trypaper.fun)

`$paper` CA: `3GWpjiGgTo2RckTLRo71AJijvxkhescZ4QgSGWdPbpump`

## What's Inside

- **Course**: structured lessons on Solana trading, memecoin mechanics, risk management, and trading bots.
- **Paper trading board**: a practice board with live Pump.fun-style columns, virtual SOL balance, portfolio stats, and local trade history.
- **Demo terminal**: a token terminal with chart-only mode, market metadata, simulated buys/sells, positions, and transaction feed.
- **paper AI**: a Solana-focused assistant for token research, price snapshots, wallet analysis, and educational trading questions.
- **Leaderboard and profiles**: wallet-authenticated usernames, trade stat sync, public leaderboard, user stats, and reward pool display.

## Screenshots

### Demo Trading Terminal

![paper Terminal](docs/screenshots/terminal.png)

### Wallet Analysis

![Wallet Analysis](docs/screenshots/wallet-analysis.png)

## Tech

- Vanilla HTML, CSS, and JavaScript
- Express static/API server ([server.js](server.js))
- MongoDB for wallet registration, leaderboard data, course progress, and chat history
- OpenAI `gpt-4o-mini` behind `/api/openai-chat` and `/api/chat`
- Helius, Solana Tracker, DexScreener, GeckoTerminal, Jupiter, and Pump.fun data integrations
- Vercel deployment

## Running Locally

```bash
npm install
copy env.example .env
npm run dev
```

Open `http://localhost:3000`.

On macOS/Linux, use `cp env.example .env` instead of `copy`.

## Required Configuration

The app can boot without private keys, but app data requires MongoDB unless you explicitly enable the SQLite test fallback.

Minimum useful local setup:

```env
MONGODB_URI=mongodb+srv://...
OPENAI_API_KEY=sk-...
HELIUS_API_KEY=...
SOLANA_TRACKER_API_KEY=...

```

Production setup should also include:

```env
PAPER_CREATOR_WALLET=...
PAPER_TOKEN_MINT=...
```

Check non-secret readiness with:

```bash
curl http://localhost:3000/api/config-status
```

## Quality Checks

```bash
npm test
npm run build:analytics
node --check server.js
```

`npm test` runs a route/API smoke test against the Express app on a temporary port and temporary SQLite fallback database. It sets `ALLOW_SQLITE_FALLBACK=true` for the test process only. It does not require private keys; OpenAI endpoints may report "not configured" during local smoke tests.

Every push and pull request to `main` runs these checks through GitHub Actions.

## Routes

- `/`
- `/pages/dashboard`
- `/pages/lycuem-course`
- `/pages/demo-trading`
- `/pages/demo-trading-terminal`
- `/pages/paper-ai`
- `/pages/leaderboard`
- `/pages/user-stats`
- `/health`

## Persistence

The app uses MongoDB when `MONGODB_URI` or `MONGO_URI` is set. This is the intended local and production database.

SQLite is now only an explicit local/test fallback. To use it outside `npm test`, set `ALLOW_SQLITE_FALLBACK=true`; otherwise database-backed API routes will return a setup error until `MONGODB_URI` is configured.

Vercel production must use MongoDB via `MONGODB_URI`. SQLite files are not durable in Vercel serverless functions, so local SQLite data will not persist reliably after deploys or function cold starts.

## Security Notes

- `OPENAI_API_KEY` stays server-side through `/api/openai-chat` and `/api/chat`.
- Provider credentials stay server-side and browser features use scoped API routes.
- Never commit `.env`, local SQLite fallback files, temporary browser profiles, or server logs.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
