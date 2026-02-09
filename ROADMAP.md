# Uho — Overnight MVP Development Roadmap

> **Goal:** Testable MVP by morning. Solo AI developer. ~8-10 hours.
> **Philosophy:** "Feed it an IDL, tell it what events to watch, get a typed API in minutes."
> **Date:** 2025-07-12

---

## 1. Project Structure

```
uho/
├── package.json
├── tsconfig.json
├── ROADMAP.md
├── src/
│   ├── core/
│   │   ├── types.ts              # Shared types: UhoConfig, ParsedIDL, etc.
│   │   ├── idl-parser.ts         # Anchor IDL → normalized event/account/instruction definitions
│   │   ├── config.ts             # YAML config loader + Zod validation
│   │   ├── schema-generator.ts   # IDL event defs → PostgreSQL DDL
│   │   └── db.ts                 # PostgreSQL connection pool + query helpers
│   ├── ingestion/
│   │   ├── poller.ts             # Poll Solana RPC for recent transactions
│   │   ├── decoder.ts            # Decode transactions using parsed IDL (Borsh + discriminator matching)
│   │   └── writer.ts             # Write decoded events to PostgreSQL
│   ├── api/
│   │   ├── server.ts             # Fastify server setup
│   │   └── routes.ts             # Auto-generate REST routes from IDL event definitions
│   ├── cli/
│   │   ├── index.ts              # Commander.js entrypoint
│   │   ├── init.ts               # `uho init` — scaffold config + sample IDL
│   │   ├── start.ts              # `uho start` — run ingestion + API
│   │   ├── status.ts             # `uho status` — show indexer health
│   │   └── stop.ts               # `uho stop` — graceful shutdown
│   └── index.ts                  # Library entrypoint (re-exports core modules)
├── fixtures/
│   ├── counter-idl.json          # Simple Anchor counter program IDL (for unit tests)
│   └── swap-idl.json             # Realistic DEX-like IDL with events (for demo)
├── templates/
│   └── uho.yaml                  # Default config template used by `uho init`
└── test/
    ├── idl-parser.test.ts
    ├── schema-generator.test.ts
    ├── decoder.test.ts
    └── e2e.test.ts               # Full pipeline: init → ingest → query
```

---

## 2. Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.5 | Language |
| `tsx` | ^4.19 | Run TS directly (dev + CLI) |
| `@solana/web3.js` | ^1.98 | Solana RPC client (v1 — stable, well-documented) |
| `@coral-xyz/anchor` | ^0.30.1 | Anchor IDL types + BorshCoder for event/instruction decoding |
| `@coral-xyz/borsh` | ^0.30.1 | Borsh serialization (pulled in by anchor) |
| `bs58` | ^6.0 | Base58 encoding/decoding |
| `fastify` | ^5.2 | REST API server (fast, schema-aware) |
| `commander` | ^13.1 | CLI framework |
| `pg` | ^8.16 | PostgreSQL client |
| `js-yaml` | ^4.1 | YAML config parsing |
| `zod` | ^3.24 | Config schema validation |
| `vitest` | ^3.1 | Test runner |
| `pino` | ^9.6 | Structured logging (Fastify's default logger) |
| `@types/pg` | ^8.11 | PG type defs |
| `@types/js-yaml` | ^4.0 | YAML type defs |

**Not used in MVP (future):**
- No Rust, no WASM, no NAPI bindings
- No Redis (latest-state cache is a future optimization)
- No Kafka/Redpanda (direct PostgreSQL writes for MVP)
- No WebSocket subscriptions (REST only for MVP)
- No gRPC/Yellowstone (RPC polling for MVP — gRPC requires Rust client or unreliable JS client)

---

## 3. Development Phases

| Phase | Scope | Est. Hours | Cumulative |
|-------|-------|-----------|------------|
| **Phase 1: Core** | IDL parser, config system, DB schema generator | 2.5h | 2.5h |
| **Phase 2: Ingestion** | Solana transaction poller + decoder + DB writer | 2.5h | 5.0h |
| **Phase 3: API** | REST server with auto-generated routes | 1.5h | 6.5h |
| **Phase 4: CLI** | init, start, status, stop commands | 1.5h | 8.0h |
| **Phase 5: Integration** | End-to-end test with real devnet program | 1.0h | 9.0h |
| **Buffer** | Bug fixes, edge cases, polish | 1.0h | 10.0h |

---

## 4. Phase 1: Core (2.5 hours)

### 4.1 Types (`src/core/types.ts`)

Define all shared types first. These drive every other module.

```typescript
// === IDL Types (subset of Anchor IDL spec we care about) ===

export interface AnchorIDL {
  address: string;                    // Program ID (Anchor v0.30+ uses 'address')
  metadata: { name: string; version: string; spec: string };
  instructions: AnchorInstruction[];
  accounts: AnchorAccountDef[];
  events: AnchorEvent[];
  types: AnchorTypeDef[];
  errors?: AnchorError[];
}

export interface AnchorEvent {
  name: string;
  discriminator: number[];            // 8-byte discriminator
  fields: AnchorField[];
}

export interface AnchorField {
  name: string;
  type: AnchorFieldType;              // "u8" | "u16" | "u32" | "u64" | "u128" | "i8"..."i128" | "bool" | "string" | "publicKey" | "bytes" | { defined: { name: string } } | { vec: AnchorFieldType } | { option: AnchorFieldType } | { array: [AnchorFieldType, number] }
}

// === Parsed/Normalized Types ===

export interface ParsedIDL {
  programId: string;
  programName: string;
  events: ParsedEvent[];
  accounts: ParsedAccount[];
  instructions: ParsedInstruction[];
}

export interface ParsedEvent {
  name: string;
  discriminator: Buffer;              // 8 bytes
  fields: ParsedField[];
}

export interface ParsedField {
  name: string;
  type: string;                       // Normalized: "u64", "publicKey", "string", etc.
  sqlType: string;                    // PostgreSQL type: "BIGINT", "TEXT", "NUMERIC", etc.
  nullable: boolean;
}

// === Config Types ===

export interface UhoConfig {
  version: number;
  name: string;
  chain: 'solana-mainnet' | 'solana-devnet';
  rpcUrl?: string;                    // Override default RPC
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  programs: ProgramConfig[];
  api: {
    port: number;
    host: string;
  };
  ingestion: {
    pollIntervalMs: number;           // How often to poll for new transactions
    batchSize: number;                // Transactions per fetch
    startSlot?: number;               // Optional: start from specific slot
  };
}

export interface ProgramConfig {
  name: string;
  programId: string;
  idl: string;                        // Path to IDL JSON file
  events?: string[];                  // Optional whitelist of event names to index (default: all)
}

// === Runtime Types ===

export interface DecodedEvent {
  eventName: string;
  programId: string;
  slot: number;
  blockTime: number | null;
  txSignature: string;
  ixIndex: number;
  innerIxIndex: number | null;
  data: Record<string, any>;          // Decoded event fields
}

export interface IndexerState {
  lastSlot: number;
  lastSignature: string | null;
  eventsIndexed: number;
  status: 'running' | 'stopped' | 'error';
  startedAt: Date;
  lastPollAt: Date | null;
  error?: string;
}
```

### 4.2 IDL Parser (`src/core/idl-parser.ts`)

Reads an Anchor IDL JSON file and produces a `ParsedIDL` with normalized field types.

```typescript
export function parseIDL(idlJson: AnchorIDL): ParsedIDL
export function parseEvent(event: AnchorEvent): ParsedEvent
export function parseField(field: AnchorField): ParsedField
export function anchorTypeToSql(type: AnchorFieldType): { sqlType: string; nullable: boolean }
```

**Type mapping table (hardcoded in parser):**

| Anchor Type | PostgreSQL Type | Notes |
|-------------|----------------|-------|
| `u8`, `u16`, `u32`, `i8`, `i16`, `i32` | `INTEGER` | Fits in 32-bit |
| `u64`, `i64` | `BIGINT` | 64-bit integer |
| `u128`, `i128` | `NUMERIC(39,0)` | Arbitrary precision |
| `f32`, `f64` | `DOUBLE PRECISION` | Floating point |
| `bool` | `BOOLEAN` | |
| `string` | `TEXT` | |
| `publicKey` / `pubkey` | `TEXT` | Base58-encoded |
| `bytes` | `BYTEA` | Raw bytes |
| `{ vec: T }` | `JSONB` | Array stored as JSON |
| `{ option: T }` | Same as T | `nullable: true` |
| `{ defined: { name } }` | `JSONB` | Complex types stored as JSON |
| `{ array: [T, N] }` | `JSONB` | Fixed-size array as JSON |

**Key implementation notes:**
- Read the IDL `discriminator` field directly (Anchor v0.30+ includes it)
- For older IDLs without `discriminator`, compute it: `sha256("event:{EventName}")[0..8]`
- Normalize `camelCase` field names to `snake_case` for SQL columns
- Handle nested `{ defined: { name } }` types by looking them up in the IDL's `types` array

### 4.3 Config System (`src/core/config.ts`)

```typescript
export function loadConfig(configPath?: string): UhoConfig     // Load + validate YAML
export function validateConfig(raw: unknown): UhoConfig         // Zod schema validation
export function getDefaultRpcUrl(chain: string): string         // Free RPC endpoints
export function resolveConfigPath(): string                     // Find uho.yaml in cwd or parents
```

**Default RPC URLs (no API key needed):**
- `solana-devnet`: `https://api.devnet.solana.com`
- `solana-mainnet`: `https://api.mainnet-beta.solana.com` (rate-limited but free)

**Zod schema:** Validate all fields, provide sensible defaults:
```typescript
const configSchema = z.object({
  version: z.number().default(1),
  name: z.string().min(1),
  chain: z.enum(['solana-mainnet', 'solana-devnet']).default('solana-devnet'),
  rpcUrl: z.string().url().optional(),
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(5432),
    name: z.string().default('uho'),
    user: z.string().default('postgres'),
    password: z.string().default(''),
  }).default({}),
  programs: z.array(z.object({
    name: z.string(),
    programId: z.string().length(44),           // Base58 pubkey
    idl: z.string(),                            // File path
    events: z.array(z.string()).optional(),      // Event name whitelist
  })).min(1),
  api: z.object({
    port: z.number().default(3000),
    host: z.string().default('0.0.0.0'),
  }).default({}),
  ingestion: z.object({
    pollIntervalMs: z.number().default(2000),
    batchSize: z.number().default(25),
    startSlot: z.number().optional(),
  }).default({}),
});
```

### 4.4 Schema Generator (`src/core/schema-generator.ts`)

Takes a `ParsedIDL` and generates PostgreSQL DDL + runs migrations.

```typescript
export function generateDDL(parsed: ParsedIDL, config: ProgramConfig): string[]
export function generateEventTable(programName: string, event: ParsedEvent): string
export function generateMetadataTable(): string
export async function applySchema(pool: Pool, ddl: string[]): Promise<void>
```

**Generated tables per event:**

```sql
-- Example for program "my_dex", event "SwapEvent" with fields:
--   amm: publicKey, inputMint: publicKey, inputAmount: u64, outputMint: publicKey, outputAmount: u64

CREATE TABLE IF NOT EXISTS my_dex_swap_event (
    id              BIGSERIAL PRIMARY KEY,
    slot            BIGINT NOT NULL,
    block_time      TIMESTAMPTZ,
    tx_signature    TEXT NOT NULL,
    ix_index        INTEGER NOT NULL,
    inner_ix_index  INTEGER,

    -- IDL fields (auto-generated):
    amm             TEXT NOT NULL,
    input_mint      TEXT NOT NULL,
    input_amount    BIGINT NOT NULL,
    output_mint     TEXT NOT NULL,
    output_amount   BIGINT NOT NULL,

    -- Metadata:
    indexed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_dex_swap_event_slot ON my_dex_swap_event(slot);
CREATE INDEX IF NOT EXISTS idx_my_dex_swap_event_tx ON my_dex_swap_event(tx_signature);
CREATE INDEX IF NOT EXISTS idx_my_dex_swap_event_block_time ON my_dex_swap_event(block_time);
```

**Metadata table (tracks indexer state):**

```sql
CREATE TABLE IF NOT EXISTS _uho_state (
    id              SERIAL PRIMARY KEY,
    program_id      TEXT NOT NULL UNIQUE,
    program_name    TEXT NOT NULL,
    last_slot       BIGINT DEFAULT 0,
    last_signature  TEXT,
    events_indexed  BIGINT DEFAULT 0,
    status          TEXT DEFAULT 'stopped',
    started_at      TIMESTAMPTZ,
    last_poll_at    TIMESTAMPTZ,
    error           TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Naming convention:** `{program_name}_{snake_case_event_name}` → `my_dex_swap_event`

### 4.5 Database Connection (`src/core/db.ts`)

```typescript
export function createPool(config: UhoConfig['database']): Pool
export async function ensureDatabase(config: UhoConfig['database']): Promise<void>  // CREATE DATABASE IF NOT EXISTS
export async function query<T>(pool: Pool, sql: string, params?: any[]): Promise<T[]>
```

Use `pg.Pool` with sensible defaults (max 10 connections, idle timeout 30s).

### 4.6 Phase 1 Tests

**`test/idl-parser.test.ts`:**
- Parse counter IDL → expect 0 events (counter has no events)
- Parse swap IDL → expect SwapEvent with correct fields
- Verify discriminator computation
- Verify field type mapping (u64 → BIGINT, publicKey → TEXT, etc.)
- Handle missing/optional fields gracefully

**`test/schema-generator.test.ts`:**
- Generate DDL for swap IDL → verify SQL is valid
- Verify table names follow naming convention
- Verify column types match IDL field types
- Verify indexes are created
- Verify metadata table DDL

---

## 5. Phase 2: Ingestion (2.5 hours)

### 5.1 Transaction Poller (`src/ingestion/poller.ts`)

Polls Solana RPC for recent transactions matching configured program IDs.

```typescript
export class TransactionPoller {
  constructor(connection: Connection, programId: PublicKey, options: PollerOptions)

  async poll(): Promise<ParsedTransactionWithMeta[]>
  async start(callback: (txs: ParsedTransactionWithMeta[]) => Promise<void>): Promise<void>
  stop(): void
  getState(): { lastSignature: string | null; pollCount: number }
}

interface PollerOptions {
  pollIntervalMs: number;
  batchSize: number;               // limit param for getSignaturesForAddress
  startSlot?: number;
  commitment?: Commitment;
}
```

**Polling strategy:**
1. Call `getSignaturesForAddress(programId, { limit: batchSize, before: lastSignature })` to get recent transaction signatures
2. For each signature, call `getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })`
3. Track `lastSignature` for pagination cursor
4. On first run with no `startSlot`, fetch the most recent batch
5. On subsequent polls, fetch only new transactions (using `until: lastSignature`)
6. Sleep `pollIntervalMs` between polls

**Rate limiting:**
- Free Solana RPC: 10 req/s on devnet, ~2-5 req/s effective on mainnet
- Batch signature lookups, then fan out transaction fetches
- Add configurable delay between RPC calls (default: 100ms)
- Log rate limit errors (HTTP 429) and back off exponentially

**Error handling:**
- Retry on transient errors (429, 503, ECONNRESET) with exponential backoff
- Skip transactions that fail to fetch (log warning, continue)
- Save cursor to database on every successful poll batch (crash recovery)

### 5.2 Event Decoder (`src/ingestion/decoder.ts`)

Decodes events from transaction logs using the parsed IDL.

```typescript
export class EventDecoder {
  constructor(parsedIdl: ParsedIDL)

  decodeTransaction(tx: ParsedTransactionWithMeta): DecodedEvent[]
  decodeLogMessages(logs: string[], txContext: TxContext): DecodedEvent[]
  matchDiscriminator(data: Buffer): ParsedEvent | null
}
```

**How Anchor event decoding works:**
1. Anchor events are emitted via `sol_log_data` (CPI to the logging system program)
2. In transaction logs, they appear as base64 data after `"Program data: "` prefix
3. The first 8 bytes are the event discriminator (`sha256("event:{EventName}")[0..8]`)
4. Remaining bytes are Borsh-serialized event fields

**Implementation approach — use `@coral-xyz/anchor`'s `BorshCoder`:**
```typescript
import { BorshCoder, EventParser } from '@coral-xyz/anchor';

// Create coder from IDL
const coder = new BorshCoder(idl);
const eventParser = new EventParser(programId, coder);

// Parse events from transaction logs
const events = [];
if (tx.meta?.logMessages) {
  const parsedEvents = eventParser.parseLogs(tx.meta.logMessages);
  for (const event of parsedEvents) {
    events.push({
      eventName: event.name,
      data: event.data,
      // ... plus tx context
    });
  }
}
```

This approach leverages Anchor's battle-tested parsing instead of reimplementing Borsh deserialization. The `EventParser` handles:
- Log message parsing
- Discriminator matching
- Borsh deserialization
- CPI event attribution (to some extent)

**For each decoded event, produce a `DecodedEvent`:**
```typescript
{
  eventName: "SwapEvent",
  programId: "...",
  slot: tx.slot,
  blockTime: tx.blockTime,
  txSignature: signature,
  ixIndex: 0,              // Which instruction index emitted this
  innerIxIndex: null,
  data: {
    amm: "...",             // PublicKey → base58 string
    inputMint: "...",
    inputAmount: 1000000n,  // BigInt from BN
    outputMint: "...",
    outputAmount: 500000n,
  }
}
```

**Type normalization for storage:**
- `BN` → `bigint` or `string` (for u128+)
- `PublicKey` → `string` (base58)
- `Buffer` / `Uint8Array` → `Buffer` (for BYTEA columns)
- Nested objects → JSON string

### 5.3 Database Writer (`src/ingestion/writer.ts`)

Writes decoded events to PostgreSQL.

```typescript
export class EventWriter {
  constructor(pool: Pool, parsedIdl: ParsedIDL)

  async writeEvents(events: DecodedEvent[]): Promise<number>   // Returns count written
  async writeEvent(event: DecodedEvent): Promise<void>
  async updateState(programId: string, state: Partial<IndexerState>): Promise<void>
  async getState(programId: string): Promise<IndexerState | null>
}
```

**Write strategy:**
- Batch inserts using `INSERT INTO ... VALUES ($1, $2, ...), ($3, $4, ...), ...`
- Wrap each poll batch in a transaction (all-or-nothing per batch)
- Update `_uho_state` table with latest slot/signature after each batch
- Handle duplicate inserts gracefully (use `ON CONFLICT DO NOTHING` with tx_signature + ix_index + event_name as a unique constraint)

**Add unique constraint to event tables:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_my_dex_swap_event_tx
  ON my_dex_swap_event(tx_signature, ix_index, COALESCE(inner_ix_index, -1));
```

### 5.4 Phase 2 Tests

**`test/decoder.test.ts`:**
- Decode a known Anchor event from raw log messages
- Verify field values match expected
- Handle transactions with no events (returns empty array)
- Handle transactions with multiple events
- Handle CPI events (inner instruction index tracking)

---

## 6. Phase 3: API (1.5 hours)

### 6.1 Server Setup (`src/api/server.ts`)

```typescript
export async function createServer(config: UhoConfig, pool: Pool, parsedIdls: ParsedIDL[]): Promise<FastifyInstance>
```

Fastify server with:
- CORS enabled (for browser access during development)
- JSON serialization with BigInt support (serialize as strings)
- Request logging via Pino
- Graceful shutdown handler

### 6.2 Auto-Generated Routes (`src/api/routes.ts`)

```typescript
export function registerEventRoutes(
  app: FastifyInstance,
  pool: Pool,
  programName: string,
  event: ParsedEvent
): void
```

**Generated endpoints per event:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/{program}/{event}` | List events (paginated) |
| `GET` | `/api/v1/{program}/{event}/:txSignature` | Get event by tx signature |
| `GET` | `/api/v1/{program}/{event}/count` | Count total events |
| `GET` | `/api/v1/status` | Indexer status for all programs |
| `GET` | `/api/v1/health` | Health check |

**Query parameters for list endpoint:**
- `limit` (default 50, max 1000)
- `offset` (default 0)
- `orderBy` (default `slot`, can be any column)
- `order` (default `desc`)
- `slotFrom` / `slotTo` — filter by slot range
- `from` / `to` — filter by block_time (ISO 8601 timestamps)
- `{field}` — filter by any IDL field (exact match), e.g. `?input_mint=So111...`

**Example response:**
```json
{
  "data": [
    {
      "id": 42,
      "slot": 298765432,
      "block_time": "2025-07-12T03:45:00Z",
      "tx_signature": "5abc...",
      "ix_index": 0,
      "amm": "...",
      "input_mint": "So111...",
      "input_amount": "1000000",
      "output_mint": "EPjF...",
      "output_amount": "500000"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1234
  }
}
```

**Implementation notes:**
- Build SQL queries dynamically from event field definitions
- Whitelist query params against known field names (prevent SQL injection)
- Use parameterized queries exclusively (`$1, $2, ...`)
- Serialize BigInt values as strings in JSON responses
- Add `Content-Type: application/json` header

### 6.3 Status Endpoint

`GET /api/v1/status` returns:
```json
{
  "indexer": "my-dex-indexer",
  "chain": "solana-devnet",
  "programs": [
    {
      "name": "my_dex",
      "programId": "...",
      "status": "running",
      "lastSlot": 298765432,
      "eventsIndexed": 1234,
      "lastPollAt": "2025-07-12T04:00:00Z"
    }
  ]
}
```

---

## 7. Phase 4: CLI (1.5 hours)

### 7.1 CLI Entrypoint (`src/cli/index.ts`)

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command()
  .name('uho')
  .description('Solana IDL-driven event indexer')
  .version('0.1.0');

program.command('init').description('Scaffold a new Uho project').action(initCommand);
program.command('start').description('Start indexing + API server').action(startCommand);
program.command('status').description('Show indexer status').action(statusCommand);
program.command('stop').description('Stop the running indexer').action(stopCommand);
program.command('schema').description('Generate/apply DB schema without starting').action(schemaCommand);

program.parse();
```

### 7.2 `uho init` (`src/cli/init.ts`)

```typescript
export async function initCommand(options: { name?: string; dir?: string }): Promise<void>
```

**What it does:**
1. Ask for project name (or use `--name` flag, default: directory name)
2. Create `uho.yaml` from template with sensible defaults
3. Create `idls/` directory
4. Copy sample IDL to `idls/sample.json` (bundled swap-like IDL)
5. Print next steps:
   ```
   ✅ Uho project initialized!

   Next steps:
   1. Place your Anchor IDL in ./idls/
   2. Edit uho.yaml to configure your program
   3. Run: uho schema  (to generate database tables)
   4. Run: uho start   (to begin indexing)
   ```

**Template `uho.yaml`:**
```yaml
version: 1
name: "my-indexer"
chain: solana-devnet

database:
  host: localhost
  port: 5432
  name: uho
  user: postgres
  password: ""

programs:
  - name: sample_program
    programId: "11111111111111111111111111111111"  # Replace with your program ID
    idl: ./idls/sample.json

api:
  port: 3000
  host: 0.0.0.0

ingestion:
  pollIntervalMs: 2000
  batchSize: 25
```

### 7.3 `uho start` (`src/cli/start.ts`)

```typescript
export async function startCommand(): Promise<void>
```

**What it does:**
1. Load and validate `uho.yaml`
2. Parse all configured IDLs
3. Connect to PostgreSQL (create database if needed)
4. Apply schema (CREATE TABLE IF NOT EXISTS for all event tables)
5. Start the transaction poller for each program
6. Start the Fastify API server
7. Write PID file to `.uho/pid` (for `uho stop`)
8. Write state to `.uho/state.json`
9. Log to stdout + `.uho/uho.log`

**Process lifecycle:**
- Runs in foreground (use `&` or `pm2` or `nohup` for background)
- Handle SIGINT/SIGTERM for graceful shutdown
- Save cursor state before exiting
- Log startup banner:
  ```
  🔊 Uho v0.1.0 — Solana Event Indexer
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Chain:    solana-devnet
  Programs: sample_program (11111...11111)
  Events:   SwapEvent, LiquidityEvent
  API:      http://0.0.0.0:3000
  DB:       postgresql://postgres@localhost:5432/uho
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Polling for new transactions every 2s...
  ```

### 7.4 `uho status` (`src/cli/status.ts`)

```typescript
export async function statusCommand(): Promise<void>
```

**What it does:**
1. Check if PID file exists (`.uho/pid`)
2. Check if process is running
3. Read state from `.uho/state.json` or query `_uho_state` table
4. Print formatted status:
   ```
   Uho Status
   ━━━━━━━━━━
   Process:  Running (PID 12345)
   Uptime:   2h 15m
   
   Programs:
     sample_program
       Status:         running
       Last Slot:      298,765,432
       Events Indexed: 1,234
       Last Poll:      2s ago
   
   API: http://localhost:3000
   ```

### 7.5 `uho stop` (`src/cli/stop.ts`)

```typescript
export async function stopCommand(): Promise<void>
```

**What it does:**
1. Read PID from `.uho/pid`
2. Send SIGTERM to process
3. Wait up to 5s for graceful shutdown
4. If still running, SIGKILL
5. Clean up PID file

### 7.6 `uho schema` (bonus command)

```typescript
export async function schemaCommand(): Promise<void>
```

**What it does:**
1. Load config + parse IDLs
2. Generate DDL
3. Print the SQL to stdout (dry run)
4. With `--apply` flag, execute against database
5. Useful for inspecting what Uho will create without starting

---

## 8. Phase 5: Integration Testing (1.0 hour)

### 8.1 Test Program Selection

Use a **known Anchor program on Solana devnet** that emits events. Options in order of preference:

1. **Self-deployed test program:** Bundle a minimal Anchor IDL for a "counter" program that emits `IncrementEvent`. Deploy to devnet using a pre-built .so if possible. Simplest for controlled testing.

2. **SPL Memo v2 program** (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`): Always active on devnet but doesn't emit Anchor events — useful for testing transaction polling only.

3. **Fallback:** Use a realistic sample IDL with mock data injection for the full pipeline test. The poller can run against devnet for the "real data" part (even if it finds 0 events, the polling mechanism itself is tested).

**Recommended test strategy:** Use the sample swap IDL for schema generation + API testing. Use the real devnet RPC for polling (proves connectivity and pagination). Include a mock test that injects synthetic events into the DB and queries them through the API (proves the full pipeline without depending on devnet activity).

### 8.2 End-to-End Test (`test/e2e.test.ts`)

```typescript
describe('Uho E2E', () => {
  it('generates schema from IDL and creates tables', async () => {
    // Load swap IDL → generate DDL → apply to test DB → verify tables exist
  });

  it('API serves auto-generated routes', async () => {
    // Start API server → GET /api/v1/status → verify 200
    // GET /api/v1/sample_dex/SwapEvent → verify empty array
  });

  it('writes and queries events through the full pipeline', async () => {
    // Insert synthetic DecodedEvent into DB via writer
    // Query via API: GET /api/v1/sample_dex/SwapEvent → verify event returned
    // Query with filter: ?input_mint=... → verify filtered result
  });

  it('poller connects to devnet RPC', async () => {
    // Create poller for System Program on devnet
    // Call poll() once → verify it returns transaction signatures (devnet always has system txs)
  });

  it('config validation rejects invalid configs', async () => {
    // Missing programs → error
    // Invalid programId → error
    // Invalid chain → error
  });
});
```

### 8.3 Demo Script

Create `scripts/demo.sh` that walks through the full user experience:

```bash
#!/bin/bash
set -e

echo "=== Uho MVP Demo ==="

# 1. Init
echo ">>> uho init"
npx tsx src/cli/index.ts init --name demo-indexer

# 2. Show generated config
echo ">>> Generated uho.yaml:"
cat uho.yaml

# 3. Apply schema
echo ">>> uho schema --apply"
npx tsx src/cli/index.ts schema --apply

# 4. Start (background, run for 30s)
echo ">>> uho start (running for 30s...)"
timeout 30 npx tsx src/cli/index.ts start || true

# 5. Query API
echo ">>> Querying API..."
curl -s http://localhost:3000/api/v1/status | jq .
curl -s http://localhost:3000/api/v1/sample_program/SwapEvent?limit=5 | jq .

echo "=== Demo Complete ==="
```

---

## 9. Test Plan (for QA Agent)

### Unit Tests (vitest)

| Test | File | What to Verify |
|------|------|----------------|
| IDL parser handles Anchor v0.30 IDL format | `idl-parser.test.ts` | Events, fields, discriminators extracted correctly |
| IDL parser handles missing events gracefully | `idl-parser.test.ts` | Returns empty events array, no crash |
| Field type mapping covers all Anchor types | `idl-parser.test.ts` | Every type in mapping table produces correct SQL type |
| Schema generator produces valid SQL | `schema-generator.test.ts` | DDL strings parse without error, table names correct |
| Schema generator creates indexes | `schema-generator.test.ts` | Index DDL present for slot, tx_signature, block_time |
| Schema generator handles duplicate apply | `schema-generator.test.ts` | IF NOT EXISTS prevents errors on re-run |
| Config loader validates all fields | `config.test.ts` | Valid config passes, invalid configs throw with useful messages |
| Config loader applies defaults | `config.test.ts` | Missing optional fields get default values |
| Event decoder parses Anchor log events | `decoder.test.ts` | Known event from logs decodes to correct fields |

### Integration Tests

| Test | What to Verify |
|------|----------------|
| Schema applies to real PostgreSQL | Tables created, columns have correct types |
| Events can be inserted and queried | Write → Read roundtrip through PostgreSQL |
| API returns correct JSON structure | Pagination, data array, field names |
| API filtering works | Query params filter results correctly |
| Poller connects to devnet | No connection errors, returns signatures |
| Status endpoint reflects DB state | After inserting events, status shows correct count |

### Manual Verification (User)

1. `npx tsx src/cli/index.ts init` → `uho.yaml` and `idls/` created
2. `npx tsx src/cli/index.ts schema --apply` → Tables visible in `psql`
3. `npx tsx src/cli/index.ts start` → Logs show polling activity
4. `curl localhost:3000/api/v1/status` → JSON response with program status
5. `curl localhost:3000/api/v1/{program}/{event}` → Event data (or empty array)
6. `npx tsx src/cli/index.ts stop` → Process stops gracefully

---

## 10. Known Limitations (MVP vs Full Architecture)

| Aspect | MVP (Tonight) | Full Architecture (18 weeks) |
|--------|---------------|------------------------------|
| **Data source** | RPC polling (`getSignaturesForAddress` + `getParsedTransaction`) | Yellowstone gRPC streaming (real-time, intra-slot) |
| **Latency** | 2-5 second polling interval | Sub-second (gRPC streaming) |
| **Language** | Pure TypeScript | Rust data plane + TypeScript DX layer |
| **Decoding** | `@coral-xyz/anchor` EventParser (JS) | Rust WASM decoders (40x faster) |
| **CPI handling** | Basic — relies on Anchor's EventParser which handles simple CPI | Full CPI tree traversal with program attribution |
| **IDL format** | Anchor IDL only | Anchor + Codama + custom decoder support |
| **Storage** | PostgreSQL only, no partitioning | PostgreSQL (partitioned) + Redis cache + S3 archival |
| **Query** | REST API only | REST + WebSocket subscriptions + TypeScript SDK |
| **Backfill** | Manual (adjust startSlot in config) | Multi-strategy engine (gTFA, getBlock, Old Faithful) |
| **Multi-program** | Works but shares one poller per program | Multiplexed gRPC filters, per-tenant decoder pools |
| **Scaling** | Single process, single node | Kubernetes-orchestrated worker pools |
| **Auth** | None | API keys, rate limiting, multi-tenancy |
| **Monitoring** | Log files + status command | Prometheus + Grafana dashboards |
| **SVM chains** | Solana only | Eclipse, Sonic SVM, any SVM chain |
| **IDL versioning** | Manual (replace IDL file, restart) | Auto-detection, hot-swap decoders, schema migration |
| **Reliability** | No gap detection | Dual-source reconciliation, checksums |
| **Web dashboard** | None | Config UI, query explorer, metrics |
| **Account indexing** | Not supported | Account state snapshots + change tracking |
| **Instruction indexing** | Not supported | Full instruction decoding with args |
| **Package distribution** | Run via `npx tsx` | Published npm package (`npx uho`) |

### What's Explicitly Deferred

1. **No `npm publish`** — CLI runs via `npx tsx src/cli/index.ts` not `npx uho`
2. **No Docker** — assumes local Node.js + PostgreSQL
3. **No authentication** — API is open
4. **No WebSocket** — REST polling only
5. **No TypeScript SDK** — direct HTTP calls
6. **No account or instruction indexing** — events only
7. **No Codama IDL support** — Anchor IDL only
8. **No on-chain IDL fetching** — must provide local IDL file
9. **No auto-migration on IDL change** — drop and recreate tables manually
10. **No Helius/Triton integration** — uses free public RPCs only

### Path from MVP to Production

After the overnight MVP validates the concept:

1. **Week 1-2:** Replace RPC polling with gRPC streaming (add `@triton-one/yellowstone-grpc` or use Helius LaserStream)
2. **Week 3-4:** Add Rust NAPI decoder for hot-path performance
3. **Week 5-6:** Add WebSocket subscriptions + TypeScript client SDK
4. **Week 7-8:** Multi-strategy backfill engine
5. **Week 9-12:** Multi-tenancy, auth, web dashboard
6. **Week 13-18:** SVM chain support, managed hosting, production hardening

---

## Appendix: Fixture IDLs

### `fixtures/swap-idl.json` — Realistic DEX IDL for Testing

This should be a valid Anchor v0.30 IDL with:
- 1 program (`sample_dex`)
- 2 events: `SwapEvent` (amm, inputMint, inputAmount, outputMint, outputAmount), `LiquidityEvent` (pool, provider, tokenAAmount, tokenBAmount, action)
- 2 instructions: `swap`, `addLiquidity`
- 2 accounts: `Pool`, `UserPosition`
- Include `discriminator` arrays for events
- Include `address` field with a placeholder program ID

### `fixtures/counter-idl.json` — Minimal IDL for Unit Tests

Simple counter program:
- 1 instruction: `increment`
- 1 account: `Counter` (count: u64, authority: publicKey)
- 1 event: `IncrementEvent` (oldValue: u64, newValue: u64, authority: publicKey)

Both fixtures must be valid Anchor v0.30 IDL format (with `metadata.spec: "0.1.0"`, `address` field, `discriminator` arrays).
