# 🔊 Uho — Solana IDL-Driven Event Indexer

> Feed it an IDL, tell it what events to watch, get a typed API in minutes.

Uho is a lightweight Solana event indexer that reads Anchor IDL files and automatically:

1. **Generates PostgreSQL tables** matching your program's event definitions
2. **Polls Solana RPC** for transactions and decodes Anchor events
3. **Serves a REST API** with auto-generated endpoints for every event type

No code generation, no manual schema writing, no custom decoders. Just point it at an IDL and go.

## Quick Start

```bash
# Clone and install
git clone https://github.com/zhivkoto/uho.git
cd uho
npm install

# Initialize a project
npm run cli -- init --name my-indexer

# Edit uho.yaml — set your program ID and IDL path

# Generate and apply database tables
npm run cli -- schema --apply

# Start indexing + API
npm run cli -- start
```

## How It Works

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Anchor   │ ──▶ │ IDL      │ ──▶ │ Schema   │ ──▶ │ Postgres │
│ IDL JSON │     │ Parser   │     │ Generator│     │ Tables   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                         │
┌──────────┐     ┌──────────┐     ┌──────────┐          │
│ Solana   │ ──▶ │ TX       │ ──▶ │ Event    │ ──▶ INSERT
│ RPC      │     │ Poller   │     │ Decoder  │
└──────────┘     └──────────┘     └──────────┘
                                                         │
                 ┌──────────┐     ┌──────────┐          │
                 │ REST API │ ◀── │ Fastify  │ ◀── SELECT
                 │ Client   │     │ Server   │
                 └──────────┘     └──────────┘
```

## Configuration

Create `uho.yaml` in your project root (or use `uho init`):

```yaml
version: 1
name: "my-indexer"
chain: solana-devnet

database:
  host: localhost
  port: 5432
  name: uho
  user: postgres

programs:
  - name: my_program
    programId: "YourProgramId111111111111111111111111111111"
    idl: ./idls/my_program.json
    # events:           # Optional: whitelist specific events
    #   - SwapEvent

api:
  port: 3000
  host: 0.0.0.0

ingestion:
  pollIntervalMs: 2000
  batchSize: 25
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `uho init` | Scaffold a new project with config template |
| `uho schema` | Generate DDL from IDL (dry run) |
| `uho schema --apply` | Generate and apply DDL to database |
| `uho start` | Start the indexer + API server |
| `uho status` | Show indexer health and statistics |
| `uho stop` | Gracefully stop the running indexer |

Run via: `npm run cli -- <command>` or `npx tsx src/cli/index.ts <command>`

## Auto-Generated API

For each event type in your IDL, Uho creates these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/{program}/{event}` | List events (paginated) |
| `GET` | `/api/v1/{program}/{event}/count` | Count total events |
| `GET` | `/api/v1/{program}/{event}/:txSignature` | Get events by tx |
| `GET` | `/api/v1/status` | Indexer status |
| `GET` | `/api/v1/health` | Health check |

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `limit` | Results per page (1-1000, default 50) |
| `offset` | Pagination offset |
| `orderBy` | Sort column (default: `slot`) |
| `order` | `asc` or `desc` (default: `desc`) |
| `from` / `to` | Filter by block_time (ISO 8601) |
| `slotFrom` / `slotTo` | Filter by slot range |
| `{field}` | Exact match on any IDL field |

### Example

```bash
# List recent swap events
curl "http://localhost:3000/api/v1/sample_dex/swap_event?limit=10"

# Filter by input mint
curl "http://localhost:3000/api/v1/sample_dex/swap_event?input_mint=So111..."

# Count events
curl "http://localhost:3000/api/v1/sample_dex/swap_event/count"
```

Response format:

```json
{
  "data": [
    {
      "id": 1,
      "slot": 298765432,
      "block_time": "2025-07-12T03:45:00.000Z",
      "tx_signature": "5abc...",
      "amm": "...",
      "input_mint": "So111...",
      "input_amount": "1000000",
      "output_mint": "EPjF...",
      "output_amount": "500000"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1234
  }
}
```

## Type Mapping

Uho automatically maps Anchor IDL types to PostgreSQL columns:

| Anchor Type | PostgreSQL Type |
|-------------|----------------|
| `u8`, `u16`, `u32`, `i8`-`i32` | `INTEGER` |
| `u64`, `i64` | `BIGINT` |
| `u128`, `i128` | `NUMERIC(39,0)` |
| `f32`, `f64` | `DOUBLE PRECISION` |
| `bool` | `BOOLEAN` |
| `string` | `TEXT` |
| `pubkey` | `TEXT` (base58) |
| `bytes` | `BYTEA` |
| `Vec<T>` | `JSONB` |
| `Option<T>` | Same as T (nullable) |
| `defined` structs | `JSONB` |

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** running locally
- **Anchor IDL** (v0.30+ format) for your Solana program

## Development

```bash
# Run tests
npm test

# Type check
npm run lint

# Watch mode
npm run test:watch

# Run demo
npm run demo
```

## Architecture

```
src/
├── core/
│   ├── types.ts            # Shared type definitions
│   ├── idl-parser.ts       # Anchor IDL → normalized events/fields
│   ├── config.ts           # YAML config loader + Zod validation
│   ├── schema-generator.ts # IDL → PostgreSQL DDL
│   └── db.ts               # PostgreSQL connection pool
├── ingestion/
│   ├── poller.ts           # Solana RPC transaction poller
│   ├── decoder.ts          # Anchor event decoder
│   └── writer.ts           # PostgreSQL event writer
├── api/
│   ├── server.ts           # Fastify server setup
│   └── routes.ts           # Auto-generated REST routes
└── cli/
    ├── index.ts            # CLI entrypoint
    ├── init.ts             # Project scaffolding
    ├── start.ts            # Start indexer + API
    ├── status.ts           # Health check
    ├── stop.ts             # Graceful shutdown
    └── schema.ts           # Schema management
```

## License

MIT
