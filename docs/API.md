# Uho API Reference

> **Version:** 0.1.0  
> **Base URL:** `http://localhost:3001`  
> **Interactive Docs:** [Swagger UI](/api/docs)  
> **OpenAPI Spec:** [/api/v1/openapi.json](/api/v1/openapi.json)

---

## Authentication

All data endpoints require authentication via one of:

| Method | Header/Param | Example |
|--------|-------------|---------|
| API Key (header) | `X-API-Key: uho_xxx...` | `curl -H "X-API-Key: uho_abc123" ...` |
| Bearer JWT | `Authorization: Bearer <token>` | `curl -H "Authorization: Bearer eyJ..." ...` |
| API Key (query) | `?apiKey=uho_xxx...` | `curl "...?apiKey=uho_abc123"` |

API keys are recommended for server-to-server and client-side use.

---

## Data Types

### Numeric Fields as Strings

Uho stores Solana numeric types in PostgreSQL with full precision. **Large numeric fields are returned as strings in JSON** to avoid JavaScript's `Number.MAX_SAFE_INTEGER` precision loss.

| Anchor Type | Postgres Type | JSON Type | Notes |
|-------------|--------------|-----------|-------|
| `u8`, `u16`, `u32` | `INTEGER` | `number` | Safe as JS number |
| `i8`, `i16`, `i32` | `INTEGER` | `number` | Safe as JS number |
| `u64`, `i64` | `BIGINT` | `string` | ⚠️ **Returned as string** — use `BigInt()` or `Number()` |
| `u128`, `i128` | `NUMERIC(39,0)` | `string` | ⚠️ **Returned as string** — use `BigInt()` |
| `f32`, `f64` | `DOUBLE PRECISION` | `number` | Standard float |
| `bool` | `BOOLEAN` | `boolean` | — |
| `string` | `TEXT` | `string` | — |
| `pubkey` | `TEXT` | `string` | Base58-encoded public key |
| `bytes` | `BYTEA` | `string` | Hex-encoded |
| `Option<T>` | Same as `T` | Same as `T` or `null` | Nullable |
| `Vec<T>`, `[T; N]` | `JSONB` | `array` | JSON array |
| Defined (struct) | `JSONB` | `object` | Nested JSON |

#### Handling BigInt Strings in JavaScript/TypeScript

```typescript
// ❌ Wrong — loses precision for values > 2^53
const amount = Number(event.sol_amount);  // May produce incorrect results!

// ✅ Correct — use BigInt for u64/u128 fields
const amount = BigInt(event.sol_amount);

// ✅ For display (with decimals)
const solAmount = Number(event.sol_amount) / 1e9; // OK for display if not > 2^53

// ✅ For precise arithmetic
const totalLamports = BigInt(event.sol_amount) + BigInt(event.fee);
```

### Metadata Fields

Every event/instruction table includes these auto-generated metadata fields:

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `number` | No | Auto-incrementing row ID (unique per table) |
| `slot` | `string` | No | Solana slot number (BIGINT, returned as string) |
| `block_time` | `string` | Yes | Block timestamp (ISO 8601 format) |
| `tx_signature` | `string` | No | Transaction signature (base58) |
| `ix_index` | `number` | No | Instruction index within the transaction |
| `inner_ix_index` | `number` | Yes | Inner instruction index (`null` for top-level) |
| `indexed_at` | `string` | Yes | When this record was indexed by Uho (ISO 8601) |

### Date/Time Handling

- `block_time`: The on-chain block timestamp, converted to ISO 8601 format (e.g., `"2025-01-15T10:30:00.000Z"`)
- `indexed_at`: When Uho inserted this record — always in UTC
- Use `block_time` for display and chronological sorting
- Use `indexed_at` for debugging indexer lag

---

## Endpoints

### Root

```
GET /
```

Returns API metadata and discovery links.

```json
{
  "name": "Uho",
  "version": "0.1.0",
  "docs": "/api/docs",
  "openapi": "/api/v1/openapi.json",
  "health": "/api/v1/health"
}
```

### Health Check

```
GET /api/v1/health
```

No authentication required.

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "version": "0.1.0"
}
```

### Status

```
GET /api/v1/status
```

Returns indexer status with optional chain lag information.

```json
{
  "indexer": {
    "status": "running",
    "version": "0.1.0",
    "currentSlot": 312500000,
    "chainHeadSlot": 312500050,
    "lagSlots": 50,
    "lagSeconds": 20
  },
  "programs": [
    {
      "name": "pump_fun",
      "programId": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      "status": "running",
      "events": ["TradeEvent", "CreateEvent"],
      "eventCounts": { "TradeEvent": 15234, "CreateEvent": 892 },
      "eventsIndexed": 16126,
      "lastSlot": 312500000
    }
  ]
}
```

### Query Events

```
GET /api/v1/data/:program/:event
```

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | `50` | Results per page (1–1000) |
| `offset` | `number` | `0` | Offset for pagination |
| `after_id` | `number` | — | Cursor for cursor-based pagination (overrides offset) |
| `order_by` | `string` | `slot` | Sort column (must be a valid field name) |
| `order` | `asc\|desc` | `desc` | Sort direction |
| `from` | `string` | — | Filter: block_time >= value (ISO 8601) |
| `to` | `string` | — | Filter: block_time <= value (ISO 8601) |
| `slotFrom` | `number` | — | Filter: slot >= value |
| `slotTo` | `number` | — | Filter: slot <= value |
| `{field}` | `string` | — | Exact match on any IDL field (e.g., `?mint=XYZ`) |
| `{field}_gte` | `number` | — | Greater than or equal (numeric fields only) |
| `{field}_lte` | `number` | — | Less than or equal (numeric fields only) |
| `{field}_gt` | `number` | — | Greater than (numeric fields only) |
| `{field}_lt` | `number` | — | Less than (numeric fields only) |

#### Field-level Filtering Examples

```bash
# Filter by exact mint address
curl -H "X-API-Key: $KEY" \
  "http://localhost:3001/api/v1/data/pump_fun/trade_event?mint=EPjF...&limit=20"

# Filter buy events with SOL amount > 1 SOL (1e9 lamports)
curl -H "X-API-Key: $KEY" \
  "http://localhost:3001/api/v1/data/pump_fun/trade_event?is_buy=true&sol_amount_gte=1000000000"

# Filter by user and time range
curl -H "X-API-Key: $KEY" \
  "http://localhost:3001/api/v1/data/pump_fun/trade_event?user=ABC...&from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z"
```

#### Response (Offset Pagination)

```json
{
  "data": [
    {
      "id": 1234,
      "slot": "312500000",
      "block_time": "2025-01-15T10:30:00.000Z",
      "tx_signature": "5K2Nq...",
      "ix_index": 0,
      "mint": "EPjF...",
      "sol_amount": "1500000000",
      "is_buy": true
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 15234,
    "next_cursor": 1284
  }
}
```

#### Response (Cursor Pagination)

When using `after_id`, the response format changes slightly:

```json
{
  "data": [...],
  "pagination": {
    "limit": 50,
    "next_cursor": 1284,
    "has_more": true
  }
}
```

Use `next_cursor` as the `after_id` for the next page:

```bash
# Page 1
curl "...?limit=50"
# Page 2
curl "...?after_id=1284&limit=50"
```

### Count Events

```
GET /api/v1/data/:program/:event/count
```

Returns the count of events matching the given filters. Supports all the same filter params as the main query endpoint.

```json
{ "count": 15234 }
```

### Schema Introspection

```
GET /api/v1/schema/:program
```

Returns all events and instructions for a program with their field schemas.

```
GET /api/v1/schema/:program/:event
```

Returns the field schema for a specific event.

```json
{
  "program": "pump_fun",
  "event": "trade_event",
  "type": "event",
  "fields": [
    { "name": "id", "type": "number", "sqlType": "BIGSERIAL", "nullable": false, "description": "Auto-incrementing row ID", "source": "metadata" },
    { "name": "slot", "type": "string", "sqlType": "BIGINT", "nullable": false, "description": "Solana slot number", "source": "metadata" },
    { "name": "mint", "type": "string", "sqlType": "TEXT", "nullable": false, "description": "IDL field: pubkey", "source": "idl" },
    { "name": "sol_amount", "type": "string", "sqlType": "BIGINT", "nullable": false, "description": "IDL field: u64", "source": "idl" }
  ]
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Authenticated but lacking permission |
| 404 | `NOT_FOUND` | Resource or route not found |
| 409 | `CONFLICT` | Duplicate resource (e.g., email already registered) |
| 422 | `VALIDATION_ERROR` | Invalid input data |
| 429 | `RATE_LIMITED` | Too many requests — check `Retry-After` header |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Response Headers

| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique request identifier (pass your own via request header, or one is generated) |
| `X-Response-Time` | Server processing time (e.g., `12.3ms`) |
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Seconds until rate limit resets |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Global (authenticated) | 100 req/min per user |
| Global (unauthenticated) | 100 req/min per IP |
| `POST /auth/login` | 5 req/min per IP |
| `POST /auth/register` | 3 req/min per IP |
| `POST /auth/verify` | 5 req/min per IP |

When rate limited, the response includes:
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Retry after 42 seconds."
  }
}
```
