# Uho Examples

Example projects demonstrating how to build on top of the [Uho](https://github.com/your-org/uho) Solana event indexer.

## Projects

### 1. [Pumptest](./pumptest/)

A Next.js dashboard that visualizes pump.fun token creation and trade events indexed by Uho.

- **Stack:** Next.js 14, TypeScript, Tailwind CSS, React Query
- **Features:** Real-time token feed, trade explorer, **token analytics via Custom Views**, auto-refresh, dark theme
- **Port:** 3040
- **Custom Views showcase:** The `/analytics` page demonstrates Uho's [Custom Views](../docs/custom-views.md) feature — server-side materialized aggregates queried via the REST API. Three views (`token_volume`, `token_buys`, `token_sells`) are joined client-side to show per-token trade stats with buy/sell ratios.

[→ Setup instructions](./pumptest/README.md)

---

## Adding Examples

Each example should:
1. Live in its own subdirectory
2. Include a `README.md` with setup instructions
3. Use `.env.local.example` for configuration
4. Fetch all data via the Uho REST API (no direct DB access)
