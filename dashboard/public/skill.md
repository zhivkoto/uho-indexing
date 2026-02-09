---
name: uho-indexing
version: 1.0.0
description: IDL-driven Solana event indexer — feed it an Anchor IDL, get a typed API in minutes.
homepage: https://www.uhoindexing.com
metadata: {"category":"infra","api_base":"https://api.uhoindexing.com"}
---

# Uho — Solana IDL-Driven Event Indexer

Uho is an infrastructure service that indexes Solana program events automatically. Give it an Anchor IDL and a program ID, and it creates typed database tables, polls the chain for transactions, decodes events, and serves them through a REST API with filtering, pagination, and real-time WebSocket streaming. No code generation, no manual schema writing, no custom decoders — just point it at an IDL and query your data.

## Quick Start

Complete onboarding in 6 curl commands:

```bash
BASE="https://api.uhoindexing.com"

# 1. Register
curl -s -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","password":"SecurePass123!"}' 

# Response: {"message":"Verification email sent","userId":"uuid-here"}

# 2. Verify email (check inbox for 6-digit code)
curl -s -X POST "$BASE/api/v1/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","code":"123456"}'

# Response: {"accessToken":"eyJ...","refreshToken":"eyJ...","user":{...}}
export TOKEN="eyJ..."  # use the accessToken from response

# 3. Create an API key (for ongoing use — more convenient than JWT)
curl -s -X POST "$BASE/api/v1/user/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"my-agent"}'

# Response: {"id":"uuid","key":"uho_abc123...","keyPrefix":"uho_abc1","label":"my-agent","createdAt":"..."}
export API_KEY="uho_abc123..."  # save this — shown only once

# 4. Register a program with its IDL
curl -s -X POST "$BASE/api/v1/programs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "programId": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    "name": "pump_fun",
    "idl": <ANCHOR_IDL_JSON_OBJECT>,
    "chain": "solana-mainnet",
    "events": [
      {"name": "TradeEvent", "type": "event", "enabled": true},
      {"name": "CreateEvent", "type": "event", "enabled": true}
    ]
  }'

# Response: {"id":"uuid","programId":"6EF8...","name":"pump_fun","status":"provisioning","createdAt":"..."}

# 5. Check indexing status
curl -s "$BASE/api/v1/status" \
  -H "X-API-Key: $API_KEY"

# 6. Query events
curl -s "$BASE/api/v1/data/pump_fun/trade_event?limit=10" \
  -H "X-API-Key: $API_KEY"
```

## Authentication

Two methods, both work for all data endpoints:

| Method | Header | Example |
|--------|--------|---------|
| **API Key** (recommended) | `X-API-Key: uho_xxx...` | `curl -H "X-API-Key: uho_abc123" ...` |
| **JWT Bearer** | `Authorization: Bearer <token>` | `curl -H "Authorization: Bearer eyJ..." ...` |
| **API Key (query)** | `?apiKey=uho_xxx...` | `curl "...?apiKey=uho_abc123"` |

**JWT tokens** expire. Use `POST /api/v1/auth/refresh` to get new ones.  
**API keys** don't expire and are better for server-to-server use. Create them via `POST /api/v1/user/api-keys` (requires JWT).

> **Note:** Program creation (`POST /api/v1/programs`) and API key management require JWT auth, not API key auth.

## Core API Reference

**Base URL:** `https://api.uhoindexing.com`

### Auth

#### Register

```bash
curl -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword123!"}'
```

**Response (201):**
```json
{"message": "Verification email sent", "userId": "550e8400-e29b-41d4-a716-446655440000"}
```

#### Verify Email

```bash
curl -X POST "$BASE/api/v1/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","code":"123456"}'
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": {"id": "uuid", "email": "you@example.com", "verified": true}
}
```

#### Login

```bash
curl -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword123!"}'
```

**Response (200):** Same shape as verify — `{accessToken, refreshToken, user}`.

#### Refresh Token

```bash
curl -X POST "$BASE/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJ..."}'
```

**Response (200):**
```json
{"accessToken": "eyJ...", "refreshToken": "eyJ..."}
```

#### Logout

```bash
curl -X POST "$BASE/api/v1/auth/logout" \
  -H "Authorization: Bearer $TOKEN"
```

### API Keys

#### Create API Key

```bash
curl -X POST "$BASE/api/v1/user/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"my-agent-key"}'
```

**Response (201):**
```json
{
  "id": "uuid",
  "key": "uho_a1b2c3d4e5f6...",
  "keyPrefix": "uho_a1b2",
  "label": "my-agent-key",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

> ⚠️ The full `key` is shown **only once**. Save it immediately.

#### List API Keys

```bash
curl "$BASE/api/v1/user/api-keys" \
  -H "Authorization: Bearer $TOKEN"
```

#### Revoke API Key

```bash
curl -X DELETE "$BASE/api/v1/user/api-keys/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

### Programs

#### Create Program (with IDL)

```bash
curl -X POST "$BASE/api/v1/programs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "programId": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    "name": "pump_fun",
    "idl": { ... },
    "chain": "solana-mainnet",
    "events": [
      {"name": "TradeEvent", "type": "event", "enabled": true},
      {"name": "CreateEvent", "type": "event", "enabled": true}
    ],
    "config": {
      "pollIntervalMs": 2000,
      "batchSize": 25,
      "startSlot": 290000000
    }
  }'
```

**Required fields:** `programId`, `idl`  
**Optional fields:** `name`, `chain` (default: `solana-mainnet`), `events` (whitelist), `config`

**Response (201):**
```json
{
  "id": "uuid",
  "programId": "6EF8...",
  "name": "pump_fun",
  "status": "provisioning",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

#### Discover IDL (auto-fetch from chain)

```bash
curl -X POST "$BASE/api/v1/programs/discover-idl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"programId":"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}'
```

**Response:** `{"found": true, "source": "on-chain", "idl": {...}}` or `{"found": false, ...}`

#### List Programs

```bash
curl "$BASE/api/v1/programs" \
  -H "X-API-Key: $API_KEY"
```

#### Get Program Detail

```bash
curl "$BASE/api/v1/programs/{id}" \
  -H "X-API-Key: $API_KEY"
```

#### Update Program

```bash
curl -X PATCH "$BASE/api/v1/programs/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "new_name", "config": {"pollIntervalMs": 5000}}'
```

#### Pause / Resume Indexing

```bash
curl -X POST "$BASE/api/v1/programs/{id}/pause" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$BASE/api/v1/programs/{id}/resume" \
  -H "Authorization: Bearer $TOKEN"
```

#### Delete (Archive) Program

```bash
curl -X DELETE "$BASE/api/v1/programs/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

### Data / Events

#### Query Events

```bash
curl "$BASE/api/v1/data/{program}/{event}?limit=50&offset=0&order=desc" \
  -H "X-API-Key: $API_KEY"
```

**Response:**
```json
{
  "data": [
    {
      "id": 1234,
      "slot": "312500000",
      "block_time": "2025-01-15T10:30:00.000Z",
      "tx_signature": "5K2Nq...",
      "ix_index": 0,
      "inner_ix_index": null,
      "indexed_at": "2025-01-15T10:31:00.000Z",
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

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | Results per page (1–1000) |
| `offset` | int | 0 | Offset pagination |
| `after_id` | int | — | Cursor pagination (overrides offset) |
| `order_by` | string | `slot` | Sort column |
| `order` | `asc`/`desc` | `desc` | Sort direction |
| `from` | ISO 8601 | — | block_time >= value |
| `to` | ISO 8601 | — | block_time <= value |
| `slotFrom` | int | — | slot >= value |
| `slotTo` | int | — | slot <= value |
| `{field}` | string | — | Exact match on any IDL field |
| `{field}_gte` | number | — | Greater than or equal (numeric) |
| `{field}_lte` | number | — | Less than or equal (numeric) |
| `{field}_gt` | number | — | Greater than (numeric) |
| `{field}_lt` | number | — | Less than (numeric) |

#### Filter Examples

```bash
# Filter by mint address
curl "$BASE/api/v1/data/pump_fun/trade_event?mint=EPjF..." \
  -H "X-API-Key: $API_KEY"

# Buy events with SOL > 1 SOL
curl "$BASE/api/v1/data/pump_fun/trade_event?is_buy=true&sol_amount_gte=1000000000" \
  -H "X-API-Key: $API_KEY"

# Time range
curl "$BASE/api/v1/data/pump_fun/trade_event?from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z" \
  -H "X-API-Key: $API_KEY"
```

#### Cursor Pagination

```bash
# Page 1
curl "$BASE/api/v1/data/pump_fun/trade_event?limit=50" -H "X-API-Key: $API_KEY"
# Response includes "next_cursor": 1284

# Page 2
curl "$BASE/api/v1/data/pump_fun/trade_event?after_id=1284&limit=50" -H "X-API-Key: $API_KEY"
```

#### Count Events

```bash
curl "$BASE/api/v1/data/pump_fun/trade_event/count" \
  -H "X-API-Key: $API_KEY"
```

**Response:** `{"count": 15234}`

Supports all the same filter params as the query endpoint.

#### Events by Transaction

```bash
curl "$BASE/api/v1/data/pump_fun/trade_event/5K2Nq..." \
  -H "X-API-Key: $API_KEY"
```

### Schema Introspection

#### List All Events for a Program

```bash
curl "$BASE/api/v1/schema/pump_fun" \
  -H "X-API-Key: $API_KEY"
```

**Response:**
```json
{
  "program": "pump_fun",
  "programId": "6EF8...",
  "events": [
    {
      "name": "trade_event",
      "originalName": "TradeEvent",
      "fields": [
        {"name": "id", "type": "number", "sqlType": "BIGSERIAL", "nullable": false, "source": "metadata"},
        {"name": "slot", "type": "string", "sqlType": "BIGINT", "nullable": false, "source": "metadata"},
        {"name": "mint", "type": "string", "sqlType": "TEXT", "nullable": false, "source": "idl"},
        {"name": "sol_amount", "type": "string", "sqlType": "BIGINT", "nullable": false, "source": "idl"}
      ]
    }
  ]
}
```

#### Single Event Schema

```bash
curl "$BASE/api/v1/schema/pump_fun/trade_event" \
  -H "X-API-Key: $API_KEY"
```

### Views (Custom Aggregations)

#### Create View

```bash
curl -X POST "$BASE/api/v1/views" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userProgramId": "program-uuid",
    "name": "top_traders",
    "source": "trade_event",
    "definition": {
      "groupBy": "user",
      "select": {
        "user": "user",
        "total_volume": {"fn": "sum", "field": "sol_amount"},
        "trade_count": {"fn": "count", "field": "*"}
      }
    },
    "materialized": true,
    "refreshIntervalMs": 60000
  }'
```

**Response (201):**
```json
{"id": "uuid", "name": "top_traders", "status": "active", "createdAt": "..."}
```

#### Query View

```bash
curl "$BASE/api/v1/data/pump_fun/views/top_traders?limit=20&order=desc" \
  -H "X-API-Key: $API_KEY"
```

#### List Views

```bash
curl "$BASE/api/v1/views" -H "X-API-Key: $API_KEY"
```

#### Delete View

```bash
curl -X DELETE "$BASE/api/v1/views/{id}" -H "X-API-Key: $API_KEY"
```

### Status

```bash
curl "$BASE/api/v1/status" -H "X-API-Key: $API_KEY"
```

**Response:**
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
      "programId": "6EF8...",
      "status": "running",
      "events": ["TradeEvent", "CreateEvent"],
      "eventCounts": {"TradeEvent": 15234, "CreateEvent": 892},
      "eventsIndexed": 16126,
      "lastSlot": 312500000
    }
  ]
}
```

### Health Check (no auth)

```bash
curl "$BASE/api/v1/health"
```

**Response:** `{"status": "ok", "timestamp": "...", "version": "0.1.0"}`

## IDL Upload

The IDL is passed as a JSON object in the `idl` field when creating a program. It must be an **Anchor IDL** (v0.30+ format).

You can either:
1. **Provide the IDL directly** — include the full IDL JSON in `POST /api/v1/programs`
2. **Auto-discover** — use `POST /api/v1/programs/discover-idl` with just the program ID (works for programs that store IDL on-chain)

```bash
# Auto-discover IDL
RESULT=$(curl -s -X POST "$BASE/api/v1/programs/discover-idl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"programId":"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}')

# If found, use it to create the program
IDL=$(echo $RESULT | jq '.idl')
curl -X POST "$BASE/api/v1/programs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"programId\":\"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P\",\"name\":\"pump_fun\",\"idl\":$IDL}"
```

### Type Mapping

Anchor IDL types are auto-mapped to PostgreSQL and returned as follows in JSON:

| Anchor Type | JSON Type | Notes |
|-------------|-----------|-------|
| `u8`, `u16`, `u32`, `i8`–`i32` | `number` | Safe as JS number |
| `u64`, `i64` | `string` | ⚠️ Returned as string to avoid precision loss |
| `u128`, `i128` | `string` | ⚠️ Use BigInt for arithmetic |
| `f32`, `f64` | `number` | Standard float |
| `bool` | `boolean` | — |
| `string`, `pubkey` | `string` | pubkey is base58 |
| `Vec<T>`, `[T; N]` | `array` | JSON array |
| `Option<T>` | `T` or `null` | Nullable |
| Defined structs | `object` | Nested JSON |

## Querying Data

### Offset Pagination

```bash
# Page 1 (default)
curl "$BASE/api/v1/data/pump_fun/trade_event?limit=100&offset=0" -H "X-API-Key: $API_KEY"

# Page 2
curl "$BASE/api/v1/data/pump_fun/trade_event?limit=100&offset=100" -H "X-API-Key: $API_KEY"
```

Response includes `"total"` count for calculating pages.

### Cursor Pagination (recommended for large datasets)

```bash
# First page
curl "$BASE/api/v1/data/pump_fun/trade_event?limit=100" -H "X-API-Key: $API_KEY"
# → "next_cursor": 5432

# Next page
curl "$BASE/api/v1/data/pump_fun/trade_event?after_id=5432&limit=100" -H "X-API-Key: $API_KEY"
# → "has_more": true, "next_cursor": 5332
```

### Sorting

```bash
curl "$BASE/api/v1/data/pump_fun/trade_event?order_by=sol_amount&order=desc&limit=10" \
  -H "X-API-Key: $API_KEY"
```

Valid `order_by` values: `id`, `slot`, `block_time`, `tx_signature`, `indexed_at`, and any IDL field name.

### Filtering

```bash
# Exact match
?mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
?is_buy=true

# Numeric range
?sol_amount_gte=1000000000
?sol_amount_lt=5000000000

# Time range
?from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z

# Slot range
?slotFrom=290000000&slotTo=300000000

# Combine any of the above
?mint=EPjF...&is_buy=true&sol_amount_gte=1000000000&order_by=block_time&order=desc
```

## WebSocket Subscriptions

Connect to the WebSocket server for real-time event streaming.

**URL:** `wss://ws.uhoindexing.com`

### Connect and Authenticate

```javascript
const ws = new WebSocket('wss://ws.uhoindexing.com');

ws.onopen = () => {
  // Authenticate first
  ws.send(JSON.stringify({
    action: 'auth',
    apiKey: 'uho_abc123...'
    // OR: token: 'eyJ...'
  }));

  // Subscribe to events
  ws.send(JSON.stringify({
    action: 'subscribe',
    id: 'sub-1',
    programs: ['pump_fun'],
    events: ['trade_event'],
    filters: { is_buy: true }
  }));
};

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  // data.type === 'event' for indexed events
  // data.subscription === 'sub-1'
  console.log(data);
};
```

### Messages

**Client → Server:**

| Action | Fields | Description |
|--------|--------|-------------|
| `auth` | `apiKey` or `token` | Authenticate the connection |
| `subscribe` | `id`, `programs`, `events`, `filters?` | Subscribe to events |
| `unsubscribe` | `id` | Remove a subscription |
| `ping` | — | Keep-alive |

**Server → Client:**

Events are pushed as they're indexed:
```json
{
  "type": "event",
  "subscription": "sub-1",
  "program": "pump_fun",
  "event": "trade_event",
  "data": {
    "id": 1234,
    "slot": "312500000",
    "block_time": "2025-01-15T10:30:00.000Z",
    "tx_signature": "5K2Nq...",
    "mint": "EPjF...",
    "sol_amount": "1500000000",
    "is_buy": true
  }
}
```

## Webhooks

Set up HTTP callbacks for event delivery.

### Create Webhook

```bash
curl -X POST "$BASE/api/v1/webhooks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userProgramId": "program-uuid",
    "url": "https://your-server.com/webhook",
    "events": ["trade_event"],
    "filters": {"is_buy": true}
  }'
```

**Response (201):**
```json
{
  "id": "webhook-uuid",
  "url": "https://your-server.com/webhook",
  "secret": "whsec_abc123...",
  "events": ["trade_event"],
  "active": true,
  "createdAt": "..."
}
```

> ⚠️ The `secret` is shown **only once**. Use it to verify webhook signatures.

### List Webhooks

```bash
curl "$BASE/api/v1/webhooks" -H "X-API-Key: $API_KEY"
```

### Update Webhook

```bash
curl -X PATCH "$BASE/api/v1/webhooks/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

### Delete Webhook

```bash
curl -X DELETE "$BASE/api/v1/webhooks/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

## Rate Limits & Usage

### Free Tier Limits

| Resource | Limit |
|----------|-------|
| Programs | 1 |
| Events indexed | 1,000 |
| API calls/month | 50,000 |
| WebSocket connections | 5 |
| Custom views | 3 |
| Webhooks | 3 |
| API keys | 2 |
| IDL upload size | 5 MB |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| General (authenticated) | 100 req/min |
| General (unauthenticated) | 100 req/min per IP |
| `POST /auth/login` | 5 req/min per IP |
| `POST /auth/register` | 3 req/min per IP |
| `POST /auth/verify` | 5 req/min per IP |

Rate limit headers are included in every response:
- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — remaining requests
- `X-RateLimit-Reset` — seconds until reset

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHORIZED` | Missing or invalid auth |
| 403 | `FORBIDDEN` | Authenticated but lacks permission (e.g., tier limit reached) |
| 404 | `NOT_FOUND` | Resource or route not found |
| 409 | `CONFLICT` | Duplicate (e.g., email already registered) |
| 422 | `VALIDATION_ERROR` | Invalid input data |
| 429 | `RATE_LIMITED` | Too many requests — check `Retry-After` header |
| 500 | `INTERNAL_ERROR` | Server error |

### Common Scenarios

- **"Email and password are required"** (422) — missing fields in register/login
- **"Verification email sent"** — registration succeeded but you must verify before logging in
- **"programId and idl are required"** (422) — program creation missing required fields
- **"API key limit reached for your tier"** (403) — free tier allows 2 API keys
- **"Program 'x' not found"** (404) — wrong program name in data query
- **"Event 'x' not found in program 'y'"** (404) — wrong event name in data query

## Example: Index pump.fun Events

End-to-end example indexing pump.fun's TradeEvent and CreateEvent.

```bash
BASE="https://api.uhoindexing.com"

# 1. Register + verify
curl -s -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"pump-watcher@example.com","password":"Str0ngP@ss!"}'

# (verify via email code)
curl -s -X POST "$BASE/api/v1/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"email":"pump-watcher@example.com","code":"123456"}'

# Save the token
TOKEN="<accessToken from verify response>"

# 2. Create API key
API_KEY=$(curl -s -X POST "$BASE/api/v1/user/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"pump-agent"}' | jq -r '.key')

# 3. Try auto-discovering the IDL
DISCOVERY=$(curl -s -X POST "$BASE/api/v1/programs/discover-idl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"programId":"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}')

echo $DISCOVERY | jq '.found'
# If true, extract IDL: echo $DISCOVERY | jq '.idl'
# If false, you'll need to provide the IDL manually

# 4. Register the program
# (using discovered IDL or your own copy)
IDL=$(echo $DISCOVERY | jq '.idl')

curl -s -X POST "$BASE/api/v1/programs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"programId\": \"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P\",
    \"name\": \"pump_fun\",
    \"idl\": $IDL,
    \"chain\": \"solana-mainnet\",
    \"events\": [
      {\"name\": \"TradeEvent\", \"type\": \"event\", \"enabled\": true},
      {\"name\": \"CreateEvent\", \"type\": \"event\", \"enabled\": true}
    ]
  }"

# 5. Wait for provisioning, then check status
sleep 10
curl -s "$BASE/api/v1/status" -H "X-API-Key: $API_KEY" | jq '.'

# 6. Check what fields are available
curl -s "$BASE/api/v1/schema/pump_fun/trade_event" -H "X-API-Key: $API_KEY" | jq '.fields[] | .name'

# 7. Query recent trades
curl -s "$BASE/api/v1/data/pump_fun/trade_event?limit=5&order=desc" \
  -H "X-API-Key: $API_KEY" | jq '.'

# 8. Query buys over 1 SOL
curl -s "$BASE/api/v1/data/pump_fun/trade_event?is_buy=true&sol_amount_gte=1000000000&limit=20" \
  -H "X-API-Key: $API_KEY" | jq '.'

# 9. Count total events
curl -s "$BASE/api/v1/data/pump_fun/trade_event/count" \
  -H "X-API-Key: $API_KEY"

# 10. Get new token creates
curl -s "$BASE/api/v1/data/pump_fun/create_event?limit=10&order=desc" \
  -H "X-API-Key: $API_KEY" | jq '.'
```

### Response Headers

Every response includes:
- `X-Request-Id` — unique request ID (pass your own via request header)
- `X-Response-Time` — server processing time (e.g., `12.3ms`)

### OpenAPI Spec

Full machine-readable spec available at:
```
GET https://api.uhoindexing.com/api/v1/openapi.json
```

Interactive docs (Swagger UI):
```
https://api.uhoindexing.com/api/docs
```
