# @uho/client

TypeScript SDK for the [Uho](https://github.com/uho-indexer/uho) Solana event indexer API.

## Installation

```bash
npm install @uho/client
```

## Quick Start

```typescript
import { UhoClient } from '@uho/client';

const uho = new UhoClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'uho_your_api_key',
});

// Check status
const status = await uho.status();
console.log(`Indexer slot: ${status.indexer.currentSlot}`);
console.log(`Chain lag: ${status.indexer.lagSeconds}s`);

// Query events with filters
const { data, pagination } = await uho.query('pump_fun', 'trade_event', {
  is_buy: true,
  sol_amount_gte: 1_000_000_000, // >= 1 SOL
  order_by: 'block_time',
  order: 'desc',
  limit: 20,
});

console.log(`Found ${pagination.total} matching events`);
for (const event of data) {
  console.log(`${event.tx_signature}: ${event.sol_amount} lamports`);
}
```

## Features

- **Full TypeScript types** — autocomplete and type checking for all API responses
- **Field-level filtering** — filter by any IDL field with exact match or range operators
- **Cursor & offset pagination** — both pagination styles supported
- **Schema introspection** — discover event fields and types programmatically
- **Custom views** — create and query aggregation views
- **Zero dependencies** — uses native `fetch` (Node 18+, Bun, Deno, browsers)

## API Reference

### Constructor

```typescript
const uho = new UhoClient({
  baseUrl: 'http://localhost:3001',  // Required
  apiKey: 'uho_...',                 // API key auth (recommended)
  accessToken: 'eyJ...',            // Or JWT auth
  timeout: 30000,                    // Request timeout (ms)
  fetch: customFetch,                // Custom fetch implementation
});
```

### Health & Status

```typescript
// Health check
const health = await uho.health();
// { status: 'ok', timestamp: '...', version: '0.1.0' }

// Full status with indexer lag
const status = await uho.status();
// { indexer: { status, currentSlot, chainHeadSlot, lagSlots, lagSeconds }, programs: [...] }
```

### Querying Data

```typescript
// Basic query
const result = await uho.query('pump_fun', 'trade_event', { limit: 50 });

// With filters
const buys = await uho.query('pump_fun', 'trade_event', {
  is_buy: true,
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  from: '2025-01-01T00:00:00Z',
  to: '2025-01-31T23:59:59Z',
});

// Range filters (numeric fields only)
const bigTrades = await uho.query('pump_fun', 'trade_event', {
  sol_amount_gte: 1_000_000_000,
  sol_amount_lte: 10_000_000_000,
});

// Cursor pagination
const page1 = await uho.query('pump_fun', 'trade_event', { limit: 100 });
if (page1.pagination.next_cursor) {
  const page2 = await uho.query('pump_fun', 'trade_event', {
    after_id: page1.pagination.next_cursor,
    limit: 100,
  });
}

// Count
const count = await uho.count('pump_fun', 'trade_event', { is_buy: true });

// Get by transaction
const txEvents = await uho.getByTransaction('pump_fun', 'trade_event', '5K2Nq...');
```

### Schema Introspection

```typescript
// Full program schema
const schema = await uho.getSchema('pump_fun');
console.log(schema.events);       // All events with fields
console.log(schema.instructions);  // All instructions

// Single event schema
const eventSchema = await uho.getSchema('pump_fun', 'trade_event');
for (const field of eventSchema.fields) {
  console.log(`${field.name}: ${field.type} (${field.nullable ? 'nullable' : 'required'})`);
}
```

### Custom Views

```typescript
// Create a view
const view = await uho.createView({
  userProgramId: 'uuid-of-program',
  name: 'daily_volume',
  source: 'trade_event',
  definition: {
    groupBy: ['mint'],
    select: {
      total_volume: { $sum: 'sol_amount' },
      trade_count: { $count: '*' },
    },
  },
});

// Query a view
const viewData = await uho.queryView('pump_fun', 'daily_volume', {
  limit: 100,
  order: 'desc',
});

// List views
const views = await uho.listViews();

// Delete a view
await uho.deleteView(view.id);
```

## Error Handling

```typescript
import { UhoClient, UhoApiError, UhoNetworkError } from '@uho/client';

try {
  const data = await uho.query('pump_fun', 'trade_event');
} catch (err) {
  if (err instanceof UhoApiError) {
    console.error(`API error ${err.status}: ${err.code} — ${err.message}`);
    // err.status: 401, 404, 422, 429, 500, etc.
    // err.code: 'UNAUTHORIZED', 'NOT_FOUND', 'RATE_LIMITED', etc.
    // err.details: additional error context (if any)
  } else if (err instanceof UhoNetworkError) {
    console.error(`Network error: ${err.message}`);
  }
}
```

## Handling BigInt Fields

Uho returns `u64`, `i64`, `u128`, and `i128` fields as **strings** to avoid JavaScript precision loss. Use `BigInt()` for arithmetic:

```typescript
const { data } = await uho.query('pump_fun', 'trade_event', { limit: 1 });
const event = data[0];

// ❌ Wrong — may lose precision
const amount = Number(event.sol_amount);

// ✅ Correct
const amount = BigInt(event.sol_amount as string);

// ✅ For display with decimals
const solAmount = Number(event.sol_amount as string) / 1e9;
```

## License

MIT
