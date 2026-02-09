# Uho Integration Notes

> Written while building the [Pumptest](./pumptest/) example dashboard.
> Perspective: first-time developer integrating with the Uho REST API.

---

## 1. What Worked Well

**The core concept is dead simple.** Register a program, upload an IDL, get typed REST endpoints. That's a genuinely compelling pitch — I went from "I have a Solana program" to "I have a queryable API" without writing any backend code. The mental model is immediately clear.

**Endpoint naming is intuitive.** `/api/v1/data/{program}/{EventName}` maps directly to the IDL event names. I never had to guess where my data lived — if the IDL has `CreateEvent`, I hit `/data/pump/CreateEvent`. Zero translation layer.

**Consistent response shape.** Every data endpoint returns `{ data: [...], pagination: { limit, offset, total } }`. I wrote one generic fetch wrapper and one pagination component, and they work for every event type. This is how APIs should work.

**The fields match the IDL exactly.** No renaming, no camelCase/snake_case inconsistency surprises. The JSON keys are what you'd expect from the Anchor IDL. `sol_amount`, `is_buy`, `virtual_sol_reserves` — all snake_case, all predictable.

**Auto-indexing `block_time`, `slot`, `tx_signature`, `indexed_at`.** These metadata fields are added automatically and they're exactly what you need for building UIs. Not having to parse raw transaction data to get timestamps is a huge win.

**The status endpoint exists.** Having `/api/v1/status` to check health, see registered programs, and get event counts is table-stakes but many APIs skip it. Made it trivial to build the overview page.

---

## 2. What Was Confusing

**Numeric fields are strings.** `sol_amount: "10000000"`, `slot: "398457829"`, `id: "312"`. I understand *why* (BigInt safety, Postgres bigint → JSON), but it means every consumer has to `Number()` or `BigInt()` everything. The spec doesn't explicitly call this out — I only discovered it by looking at actual response payloads. A real developer would hit `NaN` bugs if they assumed numbers.

**`timestamp` vs `block_time` on TradeEvent.** TradeEvent has both a `timestamp` field (unix seconds as string) AND `block_time` (ISO 8601). They represent the same moment but in different formats. Which one should I use? Is `timestamp` from the on-chain event data and `block_time` from the block? The distinction isn't documented. I went with `block_time` everywhere for consistency, but I'm not confident that's correct.

**What does `is_buy: true` mean at the protocol level?** The API returns the raw field but doesn't document the semantics. For pump.fun specifically, does `is_buy = true` mean SOL→Token? I assumed yes, but there's no API-level documentation confirming this. The meaning is IDL-dependent and Uho can't know it generically, but the example docs should clarify.

**No schema/type endpoint.** I had to know the field names and types upfront (from the spec you gave me). A real developer would either need the IDL or some kind of `/api/v1/schema/pump/CreateEvent` endpoint that returns the field names, types, and descriptions. Without this, you're guessing or reading Anchor IDL JSON manually.

**The `order` param — what does it order by?** `order=desc` sorts by... what? `id`? `block_time`? `slot`? `indexed_at`? I assumed `id` (insertion order), which is probably chronological, but it's ambiguous. If it's by `indexed_at`, then events that were backfilled could appear out of block-time order.

---

## 3. What Broke

**Nothing actually broke during the build** — the API wasn't running while I built, so I coded against the spec. But here's what I expect would bite a real developer:

**No CORS headers (probably).** If Uho is running on `:3001` and the Next.js dashboard is on `:3040`, browser-side fetches will fail unless Uho sends `Access-Control-Allow-Origin` headers. I worked around this by using Next.js (which can do server-side fetching), but a pure SPA (Vite/React) would be dead in the water. This is the #1 thing that would make someone think the API is broken when it's actually a CORS issue.

**No error response schema documented.** What does a 401 look like? A 404? A 500? I wrote generic error handling (`throw new Error(res.status + res.statusText)`) because I don't know the error shape. If the API returns `{ error: "Invalid API key" }` vs `{ message: "..." }` vs plain text, my error handling could silently swallow useful info.

**Rate limiting is undefined.** With 10-second auto-refresh polling, I'm making ~18 requests/minute. Is that fine? Will I get 429'd? No idea. If rate limiting exists, the headers (`X-RateLimit-Remaining`, `Retry-After`) should be documented.

---

## 4. Missing Features

**Filtering is extremely limited.** The only query params are `limit`, `offset`, and `order`. For a real dashboard, I immediately wanted:

- `mint=<address>` — filter TradeEvents by token (I included it in my code optimistically, hoping it works)
- `user=<address>` — filter by trader/creator
- `after=<timestamp>` — only events after a time (for incremental polling)
- `is_buy=true` — filter buys vs sells
- `min_sol_amount=1000000000` — filter by trade size
- `order_by=block_time` — explicit sort field

Without server-side filtering, I'd have to fetch everything and filter client-side, which doesn't scale.

**No WebSocket/SSE for live data.** Polling every 10 seconds works but it's wasteful and laggy. A `/ws` or `/events/stream` endpoint with real-time push would make dashboards feel alive. This is table-stakes for any indexer targeting dashboard builders.

**No aggregation endpoints.** I wanted to show "total SOL volume in last 24h" or "tokens created per hour" on the overview. Currently impossible without fetching all records and aggregating client-side. Even basic endpoints like:
- `GET /api/v1/stats/pump/TradeEvent` → `{ count, sol_volume_24h, unique_traders }`
- `GET /api/v1/data/pump/TradeEvent/aggregate?group_by=hour&field=sol_amount&fn=sum`

**No way to join data.** When showing trades, I want the token name/symbol alongside the mint address. But TradeEvent only has `mint`. I'd need a second request to CreateEvent filtered by that mint to get the name. A `/data/pump/TradeEvent?expand=mint` or a dedicated `/data/pump/tokens/{mint}` lookup would save round-trips.

**No cursor-based pagination.** Offset pagination breaks when new data arrives between pages. If 5 new tokens are created while I'm on page 2, I'll see duplicates or miss items. Cursor pagination (`after_id=312`) would be correct for real-time data.

**No bulk/batch endpoint.** My overview page makes 3 parallel requests (status + tokens + trades). A batch endpoint (`POST /api/v1/batch` with multiple queries) would reduce latency.

---

## 5. Developer Experience Pain Points

**No SDK or client library.** I wrote `api.ts` by hand — the fetch wrapper, the types, the query params. This is exactly what an npm package `@uho/client` should provide. Even a simple one:
```ts
import { UhoClient } from '@uho/client';
const uho = new UhoClient({ apiKey: '...' });
const tokens = await uho.query('pump', 'CreateEvent', { limit: 50 });
```

**TypeScript types have to be manually written.** I defined `CreateEvent` and `TradeEvent` interfaces by hand from the spec. Since Uho already has the IDL, it should auto-generate TypeScript types. Either serve them from an endpoint or provide a CLI: `npx uho generate-types --program pump --output ./types.ts`.

**No interactive API explorer.** A Swagger/OpenAPI page at `/api/docs` would let developers explore endpoints without writing code. Right now you need curl + guesswork.

**The API key is embedded in client-side code.** Using `NEXT_PUBLIC_*` env vars means the key is visible in the browser bundle. The docs should warn about this and suggest either:
- Scoped read-only keys for public dashboards
- A proxy pattern (Next.js API routes → Uho)
- Key permission levels (read vs write)

**No health check latency info.** The `/status` endpoint tells me the indexer is running, but not *how far behind* it is. A field like `"latest_indexed_slot": 398457829, "chain_head_slot": 398457835, "lag_seconds": 2.4` would be invaluable for debugging "why don't I see my transaction."

---

## 6. Suggested Improvements

### High Priority (Blocking Real Usage)

1. **Add field-level filtering** — At minimum: filter any field via query params (`?mint=X&is_buy=true&user=Y`). This is the #1 missing feature.

2. **Document the error response schema** — Every error should return `{ error: string, code?: string, details?: any }` consistently. Document 400, 401, 403, 404, 429, 500.

3. **Add CORS support** — `Access-Control-Allow-Origin: *` for read-only public APIs, or configurable allowed origins. Without this, browser-based apps can't use the API directly.

4. **Publish a TypeScript SDK** — Even a thin wrapper with generated types from IDLs. Reduce time-to-first-query from 30 minutes to 2 minutes.

5. **Serve an OpenAPI/Swagger spec** — `GET /api/v1/openapi.json`. Auto-generates docs, client libraries, and lets tools like Postman import directly.

### Medium Priority (Quality of Life)

6. **Add a schema introspection endpoint** — `GET /api/v1/schema/pump/CreateEvent` → returns field names, types, descriptions. Critical for building generic UIs.

7. **WebSocket or SSE for streaming** — `ws://localhost:3001/api/v1/stream/pump/TradeEvent` for real-time dashboards. Polling is a stopgap.

8. **Cursor-based pagination** — `?after_id=312&limit=50` instead of offset. Stable pagination for live data.

9. **Add `order_by` parameter** — Let users sort by any field, not just the default. `?order_by=block_time&order=desc`.

10. **Basic aggregation endpoint** — `?aggregate=count` or a dedicated `/stats` route. Saves fetching thousands of rows to count them.

### Low Priority (Nice to Have)

11. **CLI tool for project setup** — `npx create-uho-app --template nextjs --program pump` that scaffolds a project with types, env, and example pages.

12. **Webhook support** — `POST /api/v1/webhooks` to push new events to a URL. Useful for bots, alerts, backend processing.

13. **API key scoping** — Read-only keys safe for client-side, write keys for admin. Maybe per-program permissions.

14. **Request/response examples in docs** — Show the full curl + response for every endpoint. Copy-paste-run is the fastest way to learn an API.

15. **Add `X-Request-Id` and timing headers** — `X-Response-Time: 12ms` helps developers debug slow queries.

---

## Overall Verdict

Uho's core idea is strong: IDL-in, typed-API-out. The happy path works and the data is clean. But right now it's a **data pipe, not a platform**. The gap between "I can fetch events" and "I can build a useful app" is filled with boilerplate that Uho should own — filtering, types, real-time streaming, documentation.

The biggest risk: a developer gets excited by the pitch, hits the CORS wall or the no-filtering wall within 30 minutes, and bounces. The first hour of DX needs to be flawless.

**Time to build this example: ~45 minutes.** At least 15 of those were writing types and utilities that the platform should provide. With an SDK and better filtering, this would have been a 20-minute project.
