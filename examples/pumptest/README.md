# Pumptest — Uho Example Dashboard

A real-time dashboard for visualizing pump.fun token creation and trade events, built on top of the **Uho** Solana event indexer.

![Stack](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

## What This Demonstrates

This example shows how easy it is to build a production-quality dashboard using Uho's REST API. All data is fetched via API key — no direct database access, no complex setup.

**Key features:**
- 📊 Overview with live stats and activity feed
- 🪙 Token explorer with pagination and auto-refresh
- 📈 Trade viewer with mint address filtering
- 🔄 Auto-refresh every 10 seconds via React Query
- 🌙 Dark theme (Dune Analytics / Birdeye vibes)

## Prerequisites

- **Node.js** 18+
- **Uho** running locally on port 3001 with the pump.fun program registered
- An **Uho API key**

## Quick Start

```bash
# 1. Clone and navigate
cd uho/examples/pumptest

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.local.example .env.local
# Edit .env.local with your API key if different

# 4. Start the dashboard
npm run dev
```

Open [http://localhost:3040](http://localhost:3040) in your browser.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_UHO_API_URL` | Uho API base URL | `http://localhost:3001` |
| `NEXT_PUBLIC_UHO_API_KEY` | Your Uho API key | — |

## Pages

| Route | Description |
|---|---|
| `/` | Overview: stats, indexer status, recent activity |
| `/tokens` | New tokens table with pagination |
| `/trades` | Trade events with mint filter and pagination |
| `/trades?mint=<address>` | Trades filtered by token mint |

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Overview / home page
│   ├── tokens/page.tsx     # Token explorer
│   └── trades/page.tsx     # Trade viewer
├── components/             # Reusable UI components
│   ├── CopyButton.tsx      # Address copy-to-clipboard
│   ├── Footer.tsx          # "Powered by Uho" footer
│   ├── LoadingSpinner.tsx  # Loading & error states
│   ├── Navbar.tsx          # Top navigation
│   ├── Pagination.tsx      # Table pagination controls
│   ├── Providers.tsx       # React Query provider
│   └── StatCard.tsx        # Stat display card
└── lib/                    # Core logic
    ├── api.ts              # Uho API client
    ├── hooks.ts            # React Query hooks
    ├── types.ts            # TypeScript type definitions
    └── utils.ts            # Formatting utilities
```

## How It Works

1. **API Client** (`lib/api.ts`) — Thin wrapper around `fetch` that adds the API key header
2. **React Query Hooks** (`lib/hooks.ts`) — Each hook auto-refreshes every 10 seconds
3. **Pages** consume hooks and render data with Tailwind-styled components

No build step needed beyond Next.js. No database. Just an API key and a running Uho instance.

## Uho API Endpoints Used

```
GET /api/v1/status                          → Indexer health & program info
GET /api/v1/data/pump/CreateEvent           → Token creation events
GET /api/v1/data/pump/TradeEvent            → Trade events
    ?limit=50&offset=0&order=desc&mint=...  → Query params
```

All endpoints return `{ data: [...], pagination: { limit, offset, total } }`.
