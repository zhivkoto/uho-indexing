# Uho — Production Backfill Architecture

> **Status:** Design Document  
> **Last Updated:** 2026-02-11  
> **Audience:** Implementers building the production backfill pipeline

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State](#2-current-state)
3. [Technology Evaluation](#3-technology-evaluation)
4. [Architecture Overview](#4-architecture-overview)
5. [Component Design](#5-component-design)
6. [Data Flow & Protocols](#6-data-flow--protocols)
7. [Reliability & Checkpointing](#7-reliability--checkpointing)
8. [Multi-Tenancy](#8-multi-tenancy)
9. [IDL Versioning](#9-idl-versioning)
10. [Deployment](#10-deployment)
11. [Monitoring & Observability](#11-monitoring--observability)
12. [Phased Implementation Plan](#12-phased-implementation-plan)

---

## 1. Executive Summary

Uho needs full archival backfill — indexing a program's entire history from genesis (or program deployment) to the present. The recommended approach is a **Rust sidecar binary** built on the Jetstreamer library, running as a separate Railway service, communicating with the Node.js backend via NDJSON over HTTP streaming (or stdout pipe for single-container deployments).

**Key decisions:**
- **Jetstreamer** is the data source (streams Old Faithful archive at up to 2.7M TPS)
- **Sidecar as standalone crate** (not workspace member) to fix dependency issues
- **HTTP streaming** between sidecar and backend (not subprocess) for Railway
- **Postgres checkpointing** for resume-from-failure
- **Job queue** model for multi-tenant parallel backfills

---

## 2. Current State

### Demo Backfill (what exists today)
- `BackfillManager` uses RPC `getSignaturesForAddress` polling
- Limited to last 10,000 slots (~4 seconds of chain time)
- Sequential: fetch signatures → fetch transactions → decode logs → write events
- 100ms delay per transaction to avoid rate limits
- Single-threaded, no checkpointing beyond `current_slot`

### Sidecar (prototype in `sidecar/`)
- Implements Jetstreamer `Plugin` trait — filters transactions by program ID
- Emits NDJSON to stdout: `{"signature","slot","blockTime","logs"}`
- **Problem:** Cargo.toml references `jetstreamer = "=0.4.0"` from crates.io, but the actual working version in the Jetstreamer workspace uses path deps. The crates.io publish may lag or have different dependency trees, causing compilation failures outside the workspace.
- ClickHouse is disabled via env var (`JETSTREAMER_CLICKHOUSE_MODE=off`)

### Existing Pipeline
```
Sidecar (stdout NDJSON)
    → BackfillManager reads lines via readline
    → EventDecoder.decodeLogMessages(logs, txContext)
    → EventWriter.writeEvents(filteredEvents)
    → Postgres (user schema)
```
This pipeline is sound. The production design preserves it with better transport and reliability.

---

## 3. Technology Evaluation

### 3.1 Data Source Comparison

| Source | Coverage | Throughput | Filtering | Cost | Verdict |
|--------|----------|-----------|-----------|------|---------|
| **Jetstreamer / Old Faithful** | Genesis to tip | 2.7M TPS (hardware dependent) | Client-side (all txs streamed, filter locally) | Free (public archive) | ✅ **Recommended** |
| **Helius Enhanced Transactions API** | Limited history | ~100 TPS (rate limited) | Server-side by program | $0 free tier, paid for volume | ❌ Too slow for full history |
| **Helius DAS API** | Account state only | N/A | By account | Paid | ❌ No transaction history |
| **Yellowstone gRPC (Dragon's Mouth)** | Real-time only | High | Server-side filter | Requires Geyser node | ❌ No historical replay |
| **Solana Bigtable (via RPC)** | Full history | ~50 TPS | `getSignaturesForAddress` | RPC provider costs | ❌ Too slow |

**Jetstreamer is the only viable option for full archival backfill at scale.** It streams the entire Old Faithful CAR archive over HTTP, providing all transaction data including log messages.

### 3.2 Sidecar vs Embedded Library

| Approach | Pros | Cons |
|----------|------|------|
| **Sidecar binary** (current) | Language isolation, independent scaling, crash isolation, can run on separate Railway service | IPC overhead, deployment complexity |
| **Embedded Rust via NAPI** | Single process, no IPC | Complex build, Jetstreamer deps are heavy (~200 crates), crash takes down Node.js |
| **WASM** | Portable | Jetstreamer uses tokio/async-std, not WASM-compatible |

**Recommendation: Sidecar binary, deployed as a separate service.** The Jetstreamer dependency tree is massive (RocksDB, ClickHouse client, Solana SDK) and not suitable for embedding.

### 3.3 Jetstreamer Internals (from source analysis)

**Architecture:**
- `JetstreamerRunner` orchestrates everything: thread pool, plugin dispatch, optional ClickHouse
- `jetstreamer-firehose` downloads CAR archives from `https://files.old-faithful.net` per-epoch
- Each epoch is fetched as a streaming HTTP response, parsed incrementally
- Multi-threaded: slot range is split across N threads, each processes a sub-range independently

**Plugin trait:**
```rust
trait Plugin: Send + Sync + 'static {
    fn name(&self) -> &'static str;
    fn on_transaction(&self, thread_id: usize, db: Option<Arc<Client>>, tx: &TransactionData) -> PluginFuture;
    fn on_block(&self, ...) -> PluginFuture;
    // ... on_entry, on_rewards, on_stats
}
```

**Key `TransactionData` fields:**
- `signature: Signature`
- `slot: u64`
- `block_time: Option<i64>`
- `is_vote: bool`
- `transaction: VersionedTransaction` (account keys, instructions)
- `transaction_status_meta` (log_messages, err, inner instructions)

**Threading model:**
- Default thread count: auto-sized from CPU cores and `JETSTREAMER_NETWORK_CAPACITY_MB`
- Each thread processes a contiguous sub-range of slots
- **No ordering guarantee across threads** — downstream must handle out-of-order writes
- ~250 Mbps bandwidth per thread; 4 worker threads per firehose thread

**Limitations:**
- **No account data** — Old Faithful doesn't store account state snapshots
- **No server-side filtering** — all transactions are streamed, filtering is client-side
- **Epochs < 157** use bincode encoding (incompatible with modern Geyser plugins)
- **No built-in program ID filter** — must implement in plugin (as our sidecar does)
- Bandwidth-intensive: a full epoch is ~50-100 GB of compressed data

**Performance on Railway (estimated):**
- Railway containers get ~1-4 vCPUs, ~1 Gbps network
- Expect 1-2 threads useful, ~50K-200K TPS throughput
- A full backfill of a moderately active program (~1M txs) would take minutes
- A program active since genesis across billions of txs: hours to days

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Railway Platform                         │
│                                                              │
│  ┌──────────────┐     HTTP Stream      ┌─────────────────┐  │
│  │  Uho Backend  │◄───────────────────│  Backfill Worker  │  │
│  │  (Node.js)    │  NDJSON/SSE         │  (Rust sidecar)  │  │
│  │               │                     │                   │  │
│  │  • Job Queue  │────── Job Params ──►│  • Jetstreamer    │  │
│  │  • Decoder    │                     │  • Old Faithful   │  │
│  │  • Writer     │                     │  • Program Filter │  │
│  │  • Checkpoint │                     │                   │  │
│  └──────┬───────┘                     └─────────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │  PostgreSQL   │                                           │
│  │  (Supabase)   │                                           │
│  │  • User schemas│                                          │
│  │  • Job state   │                                          │
│  │  • Checkpoints │                                          │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP (Old Faithful CDN)
                           ▼
                 ┌───────────────────┐
                 │  files.old-       │
                 │  faithful.net     │
                 │  (CAR archives)   │
                 └───────────────────┘
```

### Data Flow

```
1. User clicks "Backfill" in dashboard
2. Backend creates backfill_job row (status=pending)
3. Backend calls sidecar HTTP endpoint: POST /backfill
   Body: { programId, startSlot, endSlot, jobId, threads }
4. Sidecar starts Jetstreamer, streams filtered txs back as NDJSON
5. Backend reads NDJSON stream line-by-line:
   a. EventDecoder.decodeLogMessages(logs)
   b. EventWriter.writeEvents(events) → Postgres
   c. Checkpoint every N events or T seconds
6. On completion/error, update backfill_job status
```

---

## 5. Component Design

### 5.1 Backfill Worker (Rust Sidecar)

**Standalone crate** — not a Jetstreamer workspace member. Uses published crates from crates.io.

```toml
# Cargo.toml
[package]
name = "uho-backfill"
version = "0.2.0"
edition = "2021"

[dependencies]
jetstreamer = "0.4"          # Note: use compatible version, not pinned
jetstreamer-firehose = "0.4"
jetstreamer-plugin = "0.4"
tokio = { version = "1", features = ["full"] }
axum = "0.7"                  # HTTP server for job control
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
bs58 = "0.5"
futures-util = "0.3"
tracing = "0.1"
tracing-subscriber = "0.3"
```

> **Fixing the dependency issue:** If the crates.io versions don't compile, pin to a known-good git rev:
> ```toml
> jetstreamer = { git = "https://github.com/anza-xyz/jetstreamer", rev = "abc123" }
> ```
> This decouples from the workspace while tracking a specific commit.

**HTTP API:**

```
POST /backfill
  Request: { "jobId": "uuid", "programId": "base58", "startSlot": 0, "endSlot": 999999, "threads": 2 }
  Response: 200 OK, Content-Type: application/x-ndjson, Transfer-Encoding: chunked
  
  Each line: {"signature":"...","slot":123,"blockTime":456,"logs":["..."]}
  
  Final line: {"done":true,"stats":{"processed":1000000,"matched":500}}
  Error line: {"error":"message"}

GET /health
  Response: 200 { "status": "ok", "activeJobs": 1 }

DELETE /backfill/:jobId
  Response: 200 { "cancelled": true }
```

**Implementation sketch:**

```rust
// Axum handler that streams NDJSON
async fn handle_backfill(Json(req): Json<BackfillRequest>) -> impl IntoResponse {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(1000); // backpressure buffer
    
    tokio::spawn(async move {
        let plugin = StreamingPlugin::new(req.program_id, tx);
        let mut runner = JetstreamerRunner::new()
            .with_plugin(Box::new(plugin))
            .with_slot_range_bounds(req.start_slot, req.end_slot + 1)
            .with_threads(req.threads);
        
        unsafe { std::env::set_var("JETSTREAMER_CLICKHOUSE_MODE", "off"); }
        runner.run().ok();
    });
    
    let stream = ReceiverStream::new(rx).map(|line| Ok::<_, Infallible>(line + "\n"));
    Response::builder()
        .header("Content-Type", "application/x-ndjson")
        .body(Body::from_stream(stream))
}
```

### 5.2 Backend Backfill Manager (Node.js)

Replaces the demo `runRpcBackfill` with HTTP stream consumption:

```typescript
class BackfillManager {
  private sidecarUrl: string; // e.g. "http://uho-backfill.railway.internal:3001"
  
  async startBackfill(config: BackfillJobConfig): Promise<void> {
    const response = await fetch(`${this.sidecarUrl}/backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: config.jobId,
        programId: config.programId,
        startSlot: config.startSlot ?? 0,
        endSlot: config.endSlot,
        threads: 2,
      }),
    });
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // incomplete last line
      
      for (const line of lines) {
        if (!line.trim()) continue;
        await this.processLine(config, JSON.parse(line));
      }
    }
  }
  
  private async processLine(config: BackfillJobConfig, record: any): Promise<void> {
    if (record.done) { /* mark completed */ return; }
    if (record.error) { /* mark failed */ return; }
    
    const events = this.decoder.decodeLogMessages(record.logs, {
      txSignature: record.signature,
      slot: record.slot,
      blockTime: record.blockTime,
      programId: config.programId,
    });
    
    const filtered = events.filter(e => config.enabledEvents.includes(e.eventName));
    if (filtered.length > 0) {
      await this.writer.writeEvents(filtered);
    }
    
    this.checkpointIfNeeded(config.jobId, record.slot, this.eventsFound);
  }
}
```

### 5.3 Job Queue

The `backfill_jobs` table already exists. Extend it:

```sql
ALTER TABLE backfill_jobs ADD COLUMN IF NOT EXISTS
  checkpoint_slot BIGINT,            -- last fully committed slot
  checkpoint_events BIGINT DEFAULT 0, -- events written up to checkpoint
  worker_id TEXT,                      -- which sidecar instance is processing
  priority INTEGER DEFAULT 0,         -- job priority (higher = sooner)
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3;
```

**Job lifecycle:**
```
pending → running → completed
                  → failed → (retry) → running
                  → cancelled
```

Backend polls for pending jobs on startup and after each completion. Multiple sidecar instances can grab different jobs (distributed via `SELECT ... FOR UPDATE SKIP LOCKED`).

---

## 6. Data Flow & Protocols

### 6.1 NDJSON Wire Format

**Transaction record** (sidecar → backend):
```json
{
  "signature": "5xK9...",
  "slot": 283456789,
  "blockTime": 1706123456,
  "logs": [
    "Program 11111... invoke [1]",
    "Program log: Instruction: Transfer",
    "Program data: base64encodeddata...",
    "Program 11111... success"
  ]
}
```

**Completion record:**
```json
{"done": true, "stats": {"processed": 5000000, "matched": 1234, "durationMs": 45000}}
```

**Error record:**
```json
{"error": "Old Faithful connection timeout at epoch 450", "lastSlot": 194184000, "recoverable": true}
```

### 6.2 Backpressure

The existing backpressure mechanism (pause/resume stdout) translates to HTTP streaming:
- Sidecar uses a bounded `mpsc::channel(1000)` — if backend is slow consuming, channel fills up, Jetstreamer plugin blocks on send, naturally slowing the firehose
- Backend processes one line at a time with `await` on DB writes
- If Postgres is slow, the entire pipeline backs up gracefully

### 6.3 Batching

For performance, batch DB writes:

```typescript
const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 1000;
let batch: DecodedEvent[] = [];

async function processLine(record) {
  const events = decode(record);
  batch.push(...events);
  
  if (batch.length >= BATCH_SIZE) {
    await flushBatch();
  }
}

async function flushBatch() {
  if (batch.length === 0) return;
  const toWrite = batch.splice(0);
  await writer.writeEvents(toWrite); // Already uses BEGIN/COMMIT internally
}
```

---

## 7. Reliability & Checkpointing

### 7.1 Checkpoint Strategy

**Problem:** Jetstreamer threads process slot ranges in parallel, so slots arrive out of order.

**Solution:** Track the **contiguous committed frontier** — the highest slot S such that all slots ≤ S have been processed.

```sql
-- Lightweight checkpoint table per job
CREATE TABLE backfill_checkpoints (
  job_id UUID REFERENCES backfill_jobs(id),
  slot_range_start BIGINT NOT NULL,
  slot_range_end BIGINT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  events_written INTEGER DEFAULT 0,
  PRIMARY KEY (job_id, slot_range_start)
);
```

**Approach:** Divide the total range into chunks (e.g., 100K slots each). Mark chunks complete as they finish. On resume, skip completed chunks.

```
Total range: slot 0 → 300,000,000
Chunk size:  100,000 slots
Chunks:      [0-100K] [100K-200K] ... [299.9M-300M]

Checkpoint state:
  [0-100K]     ✅ complete (42 events)
  [100K-200K]  ✅ complete (0 events)  
  [200K-300K]  🔄 in progress (slot 250K reached)
  [300K-400K]  ⬜ not started
  ...
```

### 7.2 Resume from Failure

On container restart or crash:
1. Backend queries `backfill_checkpoints` for the failed job
2. Finds incomplete chunks
3. Restarts sidecar with only the incomplete slot ranges
4. Uses `ON CONFLICT DO NOTHING` in writes (idempotent — handles re-processing of partial chunks)

### 7.3 Exactly-Once Semantics

**We use at-least-once delivery + idempotent writes:**
- Events have a natural key: `(tx_signature, ix_index, inner_ix_index)`
- `ON CONFLICT DO NOTHING` in `EventWriter.insertEvent` already handles this
- Re-processing a chunk produces the same events → no duplicates

---

## 8. Multi-Tenancy

### 8.1 Concurrent Backfills

Multiple users may backfill different programs simultaneously.

```
┌────────────────────────────┐
│     Backfill Job Queue     │
│                            │
│  Job A: Program X, 0-300M  │──► Sidecar Worker 1
│  Job B: Program Y, 0-300M  │──► Sidecar Worker 2
│  Job C: Program Z, 0-300M  │    (queued, waiting)
└────────────────────────────┘
```

**Strategy:**
- **Single sidecar service** with configurable concurrency (default: 2 simultaneous jobs)
- Jobs for the **same program** are deduplicated — if two users index the same program, run one Jetstreamer stream and fan out events to both schemas
- Each job gets its own HTTP stream connection
- Memory limit per job enforced via channel buffer size

### 8.2 Shared Program Optimization

When multiple users index the same program:
1. Backend detects duplicate program IDs in pending jobs
2. Starts **one** sidecar stream for that program
3. Fans out decoded events to all subscriber schemas via `FanoutWriter`
4. Each user's checkpoint is tracked independently

This reuses the existing `FanoutWriter` and `orchestrator.ts` subscriber model.

---

## 9. IDL Versioning

### 9.1 Problem

Programs upgrade their IDL over time. A program deployed in epoch 200 may have had 3 different IDL versions by epoch 800. Events emitted under v1 IDL can't be decoded with v3 IDL.

### 9.2 Solution: Multi-IDL Decoder

```typescript
class VersionedDecoder {
  private decoders: Array<{
    idl: AnchorIDL;
    decoder: EventDecoder;
    validFrom?: number; // slot
    validTo?: number;   // slot
  }>;
  
  decode(logs: string[], context: TxContext): DecodedEvent[] {
    // Try decoders in reverse order (newest first)
    for (const entry of this.decoders) {
      if (context.slot < (entry.validFrom ?? 0)) continue;
      if (context.slot > (entry.validTo ?? Infinity)) continue;
      
      try {
        const events = entry.decoder.decodeLogMessages(logs, context);
        if (events.length > 0) return events;
      } catch {
        continue; // Try older IDL version
      }
    }
    return []; // No IDL version could decode this
  }
}
```

### 9.3 MVP: Fail-Forward

For Phase 1, simply catch decode errors and skip. Log the failure rate. Most programs don't change their event layout. Add versioned IDL support in Phase 2.

---

## 10. Deployment

### 10.1 Railway Architecture

```
┌─ Railway Project ─────────────────────────────────────┐
│                                                        │
│  Service: uho-backend (Node.js)                       │
│    • Handles API, real-time indexing, backfill mgmt   │
│    • Consumes sidecar HTTP stream                     │
│                                                        │
│  Service: uho-backfill (Rust binary)                  │
│    • Runs axum HTTP server on port 3001               │
│    • Internal networking: uho-backfill.railway.internal│
│    • 2-4 GB RAM, 2 vCPUs recommended                  │
│    • Scales to 0 when no backfill jobs active          │
│                                                        │
│  Service: PostgreSQL (or external Supabase)           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 10.2 Railway Constraints & Mitigations

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| No persistent disk | Can't cache CAR archives | Jetstreamer streams from network; no local cache needed |
| Container restarts | Job interruption | Checkpoint + resume (§7) |
| 8 GB RAM limit (default) | Jetstreamer memory for buffering | Limit to 1-2 firehose threads; bounded channels |
| Shared CPU | Lower throughput | Accept slower backfill; prioritize reliability |
| No GPU | N/A | Not needed |

### 10.3 Dockerfile (Sidecar)

```dockerfile
FROM rust:1.82-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN apt-get update && apt-get install -y cmake libclang-dev  # for rocksdb
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/uho-backfill /usr/local/bin/
EXPOSE 3001
CMD ["uho-backfill", "serve", "--port", "3001"]
```

### 10.4 Environment Variables

```bash
# Sidecar
JETSTREAMER_CLICKHOUSE_MODE=off
JETSTREAMER_THREADS=2
JETSTREAMER_NETWORK_CAPACITY_MB=1000
RUST_LOG=info,jetstreamer=warn

# Backend
BACKFILL_SIDECAR_URL=http://uho-backfill.railway.internal:3001
BACKFILL_MAX_CONCURRENT_JOBS=2
BACKFILL_CHECKPOINT_INTERVAL_EVENTS=1000
BACKFILL_CHECKPOINT_INTERVAL_MS=30000
```

---

## 11. Monitoring & Observability

### 11.1 Progress Reporting

The sidecar emits progress stats in the NDJSON stream:

```json
{"progress": true, "processed": 500000, "matched": 123, "currentSlot": 150000000, "elapsedMs": 12000}
```

Backend updates `backfill_jobs` table and exposes via API:

```
GET /api/backfill/:jobId/status
{
  "status": "running",
  "progress": 0.45,
  "currentSlot": 150000000,
  "eventsFound": 123,
  "throughput": "41,666 slots/sec",
  "eta": "2h 15m"
}
```

### 11.2 Error Tracking

- Decode failures: counted per job, logged with sample tx signatures
- Network errors: Jetstreamer retries internally; persistent failures surface as job errors
- DB write errors: fail the batch, retry once, then fail the job
- Sidecar crashes: detected by HTTP stream disconnection; backend marks job as failed + eligible for retry

### 11.3 Metrics (Future)

```
uho_backfill_jobs_total{status="completed|failed|running"}
uho_backfill_events_written_total{program_id="..."}
uho_backfill_throughput_tps{job_id="..."}
uho_backfill_decode_errors_total{program_id="..."}
```

---

## 12. Phased Implementation Plan

### Phase 1: Working Production Backfill (1-2 weeks)

**Goal:** Replace demo 10K-slot limit with full archival backfill.

1. **Fix sidecar compilation** — Switch from workspace deps to git rev pinning or published crates. Verify it builds standalone.
2. **Add HTTP server to sidecar** — Axum endpoint that accepts backfill params and streams NDJSON.
3. **Update BackfillManager** — Replace `runRpcBackfill` with HTTP stream consumption from sidecar.
4. **Basic checkpointing** — Checkpoint `current_slot` every 30 seconds. On resume, restart from last checkpoint slot.
5. **Deploy sidecar as Railway service** — Dockerfile, internal networking, health check.
6. **Remove demo limitation** — Drop `DEMO_BACKFILL_SLOT_LIMIT` gate.

**Deliverable:** Users can backfill any slot range. Resume works after restarts.

### Phase 2: Reliability & Performance (1-2 weeks)

7. **Chunk-based checkpointing** — Split ranges into chunks, track independently, parallelize.
8. **Batch writes** — Buffer 100 events before flushing to Postgres.
9. **Job queue with concurrency** — `SELECT FOR UPDATE SKIP LOCKED` for multi-job processing.
10. **Backpressure tuning** — Measure and tune channel sizes, DB connection pool.
11. **Retry logic** — Automatic retry for recoverable failures (network, DB transient).

**Deliverable:** Reliable, performant backfill that handles failures gracefully.

### Phase 3: Multi-Tenancy & Scale (1-2 weeks)

12. **Shared program deduplication** — One Jetstreamer stream per program, fan out to subscribers.
13. **Priority queue** — Paid users get higher priority.
14. **Horizontal scaling** — Multiple sidecar instances grabbing different jobs.
15. **Progress UI** — Real-time progress bar in dashboard with ETA.

**Deliverable:** Platform-ready backfill supporting many concurrent users.

### Phase 4: Advanced (Future)

16. **IDL versioning** — Multi-IDL decoder with slot ranges.
17. **Incremental backfill** — "Catch up" mode that bridges backfill end to real-time start.
18. **Warm-up cache** — Pre-download popular epochs' CAR indexes.
19. **Cost optimization** — Scale sidecar to 0 when idle, spot instances.

---

## Appendix A: Jetstreamer Quick Reference

```bash
# Build sidecar locally
cd sidecar && cargo build --release

# Test with a single epoch (epoch 800 = slots 345,600,000 - 345,600,000 + 432,000)
JETSTREAMER_CLICKHOUSE_MODE=off JETSTREAMER_THREADS=2 \
  ./target/release/uho-backfill --program <PROGRAM_ID> --start-slot 345600000 --end-slot 346032000

# Useful env vars
JETSTREAMER_THREADS=N                    # Override thread count
JETSTREAMER_CLICKHOUSE_MODE=off          # Disable ClickHouse
JETSTREAMER_NETWORK_CAPACITY_MB=1000     # Hint for auto thread sizing
JETSTREAMER_COMPACT_INDEX_BASE_URL=...   # Custom Old Faithful mirror
```

## Appendix B: Old Faithful Epoch Mapping

```
Epoch duration: 432,000 slots (~2-3 days)
Slot → Epoch:   epoch = slot / 432,000
Epoch → Slots:  start = epoch * 432,000, end = start + 431,999

Key milestones:
  Epoch 0:    Slot 0          (genesis, 2020-03-16)
  Epoch 157:  Slot 67,824,000 (modern Geyser compatibility)
  Epoch 450:  Slot 194,400,000 (CU tracking available)
  Current:    ~Epoch 830+     (Slot ~358M+)
```
