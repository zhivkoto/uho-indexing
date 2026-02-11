<p align="center">
  <img src="dashboard/public/logo.svg" alt="Uho" width="80" height="80" />
</p>

<h1 align="center">Uho</h1>

<p align="center">
  <strong>Agent-native Solana indexing for your application</strong>
</p>

<p align="center">
  Feed it an IDL, get a typed API in minutes.<br/>
  Postgres tables, REST endpoints, and WebSocket subscriptions — auto-generated from your program's events.
</p>

<p align="center">
  <a href="https://www.uhoindexing.com">Website</a> ·
  <a href="https://api.uhoindexing.com/api/v1/health">Live API</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#for-agents">For Agents</a>
</p>

---

## Why Uho?

Most Solana indexing solutions require weeks of setup — custom decoders, manual schema design, infrastructure management. Uho flips that:

- **Upload an Anchor IDL** → get PostgreSQL tables with correct types for every event field
- **Instant REST APIs** → auto-generated endpoints with filtering, pagination, and sorting
- **Real-time WebSocket streams** → sub-second event delivery for dashboards and bots
- **Multi-tenant isolation** → each project gets its own schema and endpoints

No subgraph manifests. No YAML configs. No custom decoders. Just your IDL and two commands.

## Quick Start

```bash
# Clone and install
git clone https://github.com/zhivkoto/uho-indexing.git
cd uho-indexing
npm install

# Initialize a project
npm run cli -- init --name my-indexer

# Edit uho.yaml — set your program ID and IDL path

# Generate and apply database tables
npm run cli -- schema --apply

# Start indexing + API
npm run cli -- start
```

Your API is now live. Query events at `http://localhost:3000/api/v1/{program}/{event}`.

## How It Works

```
Anchor IDL ──▶ IDL Parser ──▶ Schema Generator ──▶ PostgreSQL Tables
                                                          │
Solana RPC ──▶ TX Poller ──▶ Event Decoder ──────▶ INSERT │
                                                          │
               REST API  ◀── Fastify Server ◀──── SELECT ─┘
```

1. **Parse** — Reads your Anchor IDL, extracts events and field types
2. **Generate** — Creates PostgreSQL tables matching event definitions  
3. **Index** — Polls Solana RPC, decodes transactions, writes events to Postgres
4. **Serve** — Auto-generates REST + WebSocket endpoints for every event type

## For Agents

Uho is built for the agentic era. Every endpoint returns typed JSON that agents can parse without extraction — no HTML scraping, no guessing.

```typescript
// Your agent can discover available events
const schema = await fetch("https://api.uhoindexing.com/api/v1/schema");

// Query indexed events with filters
const events = await fetch(
  "https://api.uhoindexing.com/api/v1/pump_fun/create_event?limit=10"
);

// Subscribe to real-time events via WebSocket
const ws = new WebSocket("wss://api.uhoindexing.com/ws");
ws.send(JSON.stringify({ subscribe: "pump_fun/create_event" }));
```

**Agent-native features:**
- **Structured output** — Typed JSON responses, no extraction needed
- **Schema introspection** — Discover events, fields, and types via `/schema`
- **Webhook triggers** — Push events to your agent's endpoint in real-time
- **SKILL.md** — Agent onboarding file at [uhoindexing.com/skill.md](https://www.uhoindexing.com/skill.md)

## Historical Backfill

Uho supports backfilling historical on-chain data so you don't start from a blank slate. When setting up a new program, toggle **"Historical backfill"** in the data source step to fetch past events from the Solana archive.

### How It Works

```
Program Setup ──▶ Toggle Historical ──▶ Validate Slot Range
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                      ▼
                              Demo Mode               Production
                           (RPC Poller)            (Rust Sidecar)
                                    │                      │
                                    ▼                      ▼
                         getSignaturesForAddress    Old Faithful Archive
                         getParsedTransaction       Jetstreamer Stream
                                    │                      │
                                    └──────────┬──────────┘
                                               ▼
                                    Decode via IDL ──▶ Same Postgres Tables
```

**Two execution modes:**

| Mode | Range | Method | Speed |
|------|-------|--------|-------|
| **Demo** (current) | Last ~10,000 slots (~67 min) | RPC polling via `getSignaturesForAddress` | ~100 tx/s |
| **Production** (roadmap) | Full program history | Rust sidecar via [Jetstreamer](https://github.com/rpcpool/jetstreamer) + Old Faithful archive | ~10,000 tx/s |

### Demo Mode

The hosted platform enforces a 10,000-slot demo limit on backfill. This covers roughly 67 minutes of chain history — enough to verify your indexing pipeline works end-to-end with real data.

The backfill runs in the background after program creation:
- **Progress tracking** — real-time progress bar with slot position and event counts
- **Cancel/retry** — stop a running backfill or retry a failed one
- **No data duplication** — backfilled events land in the same tables as live-indexed events

### Rust Sidecar (Production Path)

For full archival backfill, Uho includes a Rust sidecar (`sidecar/`) built on Jetstreamer that streams directly from the Old Faithful Solana archive:

```bash
cd sidecar
cargo build --release

# Backfill pump.fun events from slots 398736000 to 398736999
./target/release/uho-backfill \
  --program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P \
  --start-slot 398736000 \
  --end-slot 398736999
```

The sidecar outputs NDJSON to stdout — each line is a transaction with its log messages. The Node.js backend pipes this through the same IDL decoder and writes to Postgres.

> **Note:** The sidecar currently compiles as a workspace member inside the [Jetstreamer](https://github.com/zhivkoto/jetstreamer) monorepo (branch `feat/uho-backfill`) due to an upstream dependency issue. See `sidecar/README.md` for build instructions.

## CLI Commands

| Command | Description |
|---------|-------------|
| `uho init` | Scaffold a new project with config template |
| `uho schema` | Generate DDL from IDL (dry run) |
| `uho schema --apply` | Generate and apply DDL to database |
| `uho start` | Start the indexer + API server |
| `uho status` | Show indexer health and statistics |
| `uho stop` | Gracefully stop the running indexer |

## Auto-Generated API

For each event type in your IDL:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/{program}/{event}` | List events (paginated, filterable) |
| `GET` | `/api/v1/{program}/{event}/count` | Count total events |
| `GET` | `/api/v1/{program}/{event}/:txSignature` | Get events by transaction |
| `GET` | `/api/v1/status` | Indexer status |
| `GET` | `/api/v1/health` | Health check |
| `WS` | `/ws` | Real-time event subscriptions |

### Query Parameters

```bash
# List recent swap events
curl "http://localhost:3000/api/v1/my_dex/swap_event?limit=10&order=desc"

# Filter by field
curl "http://localhost:3000/api/v1/my_dex/swap_event?input_mint=So111..."

# Time range
curl "http://localhost:3000/api/v1/my_dex/swap_event?from=2026-01-01&to=2026-02-01"
```

## Type Mapping

Anchor IDL types are automatically mapped to PostgreSQL:

| Anchor Type | PostgreSQL Type |
|-------------|----------------|
| `u8`, `u16`, `u32`, `i8`–`i32` | `INTEGER` |
| `u64`, `i64` | `BIGINT` |
| `u128`, `i128` | `NUMERIC(39,0)` |
| `bool` | `BOOLEAN` |
| `string` | `TEXT` |
| `pubkey` | `TEXT` (base58) |
| `Vec<T>`, structs | `JSONB` |
| `Option<T>` | Same as T (nullable) |

## Configuration

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
    programId: "YourProgramId..."
    idl: ./idls/my_program.json

api:
  port: 3000
  host: 0.0.0.0

ingestion:
  pollIntervalMs: 2000
  batchSize: 25
```

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** running locally
- **Anchor IDL** (v0.30+ format) for your Solana program

## License

MIT
