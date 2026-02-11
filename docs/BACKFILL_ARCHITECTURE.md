# Uho — Production Backfill Architecture

> **Status:** Design Document · **Updated:** 2026-02-11

---

## 1. Executive Summary

Full archival backfill — indexing a program's entire on-chain history — using a **Rust sidecar** built on [Jetstreamer](https://github.com/anza-xyz/jetstreamer), deployed as a separate Railway service, streaming NDJSON over HTTP to the Node.js backend.

**Key decisions:**
- **Jetstreamer + Old Faithful** — free, unlimited archival access (only viable option at scale)
- **HTTP streaming** between sidecar and backend (not subprocess — Railway-compatible)
- **Chunk-based checkpointing** with resume-from-failure
- **Backpressure** via bounded channels to prevent memory blowout
- **Multi-tenant deduplication** — one stream per program, fan out to subscriber schemas
- **Standalone crate** — git rev pinning to fix dependency issues

---

## 2. Current State & Weak Points

### What exists
- **Demo backfill:** RPC `getSignaturesForAddress` polling, 10K slot limit (~67 min), single-threaded, no checkpointing
- **Sidecar prototype:** Jetstreamer plugin filtering by program ID, NDJSON stdout, spawned as subprocess
- **Pipeline:** Sidecar → `EventDecoder.decodeLogMessages()` → `EventWriter.writeEvents()` → Postgres

### What's broken
1. **Subprocess model** — backend spawns sidecar as child process. Breaks on Railway (separate containers)
2. **Dependency hell** — `jetstreamer = "=0.4.0"` from crates.io has broken transitive deps. Only compiles inside Jetstreamer monorepo workspace
3. **No checkpointing** — crash = restart from scratch
4. **No backpressure** — sidecar can blast faster than Postgres can write, causing OOM
5. **No cancellation** in RPC path (fixed in demo, but sidecar path still fire-and-forget)
6. **No multi-tenant dedup** — two users indexing pump.fun = two identical Jetstreamer streams

---

## 3. Why Jetstreamer

| Source | Coverage | Throughput | Cost | Verdict |
|--------|----------|-----------|------|---------|
| **Jetstreamer / Old Faithful** | Genesis → tip | ~200K TPS on Railway | Free | ✅ **Recommended** |
| **Helius Enhanced API** | Limited history | ~100 TPS (rate limited) | Paid at volume | ❌ Too slow |
| **Yellowstone gRPC** | Real-time only | High | Requires Geyser node | ❌ No historical replay |
| **Solana Bigtable (RPC)** | Full history | ~50 TPS | RPC provider costs | ❌ Too slow |

### Jetstreamer Internals (from source analysis)

- `JetstreamerRunner` orchestrates thread pool + plugin dispatch
- `jetstreamer-firehose` streams CAR archives from `https://files.old-faithful.net` per epoch
- **Plugin trait:** `on_transaction(thread_id, db, tx: &TransactionData)` — provides signature, slot, block_time, log_messages
- **Threading:** slot range split across N threads, no cross-thread ordering guarantees
- **No server-side filtering** — all txs stream through, client filters by program ID
- **No account data** — Old Faithful stores transactions only
- ~250 Mbps per firehose thread; 1-2 threads practical on Railway containers

---

## 4. Architecture

```
┌─ Railway ──────────────────────────────────────────────┐
│                                                         │
│  ┌─────────────────┐   HTTP NDJSON    ┌──────────────┐ │
│  │  Uho Backend     │◄───────────────│ Backfill       │ │
│  │  (Node.js)       │                │ Worker (Rust)  │ │
│  │                   │  POST /backfill│                │ │
│  │  • Job scheduler  │──────────────►│ • Jetstreamer  │ │
│  │  • Decoder        │               │ • Program filter│ │
│  │  • Batch writer   │               │ • Backpressure │ │
│  │  • Checkpointer   │               │   (bounded ch) │ │
│  └────────┬──────────┘               └──────────────┘ │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐                                   │
│  │  PostgreSQL       │                                  │
│  │  • User schemas   │                                  │
│  │  • Job state      │                                  │
│  │  • Chunk tracking │                                  │
│  └─────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. User toggles "Historical backfill" → backend creates `backfill_job` (status=pending)
2. Backend POSTs to sidecar: `{ programId, startSlot, endSlot, jobId, threads }`
3. Sidecar starts Jetstreamer, filters txs by program, streams NDJSON back via chunked HTTP
4. Backend reads stream line-by-line → decode via IDL → batch write to Postgres
5. Checkpoint every 1K events or 30s (whichever first)
6. On completion/error/cancel → update job status

---

## 5. Solving the Weak Points

### 5.1 Subprocess → HTTP Streaming

Sidecar runs an Axum HTTP server as a standalone Railway service:

```
POST /backfill → 200, Content-Type: application/x-ndjson, Transfer-Encoding: chunked
GET  /health   → 200 { status, activeJobs }
DELETE /backfill/:jobId → 200 { cancelled: true }
```

Each NDJSON line:
```json
{"signature":"5xK9...","slot":283456789,"blockTime":1706123456,"logs":["Program log: ..."]}
```

Completion: `{"done":true,"stats":{"processed":5000000,"matched":1234}}`
Error: `{"error":"Old Faithful timeout","lastSlot":194184000,"recoverable":true}`

Internal networking: `http://uho-backfill.railway.internal:3001`

### 5.2 Fixing Dependencies

Pin to a known-good git revision instead of crates.io:

```toml
[dependencies]
jetstreamer = { git = "https://github.com/anza-xyz/jetstreamer", rev = "<known-good-sha>" }
```

This decouples from the workspace while ensuring reproducible builds. Update the rev when upgrading.

### 5.3 Chunk-Based Checkpointing

Split the full range into chunks (100K slots each). Track independently:

```sql
CREATE TABLE backfill_checkpoints (
  job_id UUID REFERENCES backfill_jobs(id),
  chunk_start BIGINT NOT NULL,
  chunk_end BIGINT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  events_written INTEGER DEFAULT 0,
  PRIMARY KEY (job_id, chunk_start)
);
```

On resume: skip completed chunks, restart incomplete ones. `ON CONFLICT DO NOTHING` on event writes guarantees idempotency — re-processing a partial chunk produces no duplicates.

### 5.4 Backpressure

Sidecar uses a bounded `mpsc::channel(1000)`:
- Jetstreamer plugin sends filtered txs into the channel
- Axum handler reads from channel → writes to HTTP stream
- If backend is slow consuming → channel fills → plugin blocks on send → Jetstreamer naturally slows down

No unbounded buffering anywhere in the pipeline.

### 5.5 Cancellation

- Backend sends `DELETE /backfill/:jobId` to sidecar
- Sidecar drops the Jetstreamer runner + closes the HTTP stream
- Backend detects stream close, updates job status to `cancelled`
- `cancelledJobs` Set (already implemented) prevents the RPC fallback path from continuing

### 5.6 Multi-Tenant Deduplication

When multiple users backfill the same program:

1. Backend detects duplicate program IDs in pending jobs
2. Starts **one** sidecar stream for that program
3. Decoded events fan out to all subscriber schemas via existing `FanoutWriter`
4. Each user's checkpoint tracked independently

Saves bandwidth and compute — one Jetstreamer stream serves N users.

### 5.7 Smart Deployment Slot Detection

Instead of users guessing start slots, auto-detect program deployment:

1. Binary search through Old Faithful epoch index
2. Find earliest epoch containing the program ID
3. Set `startSlot` to that epoch's first slot

Eliminates scanning empty pre-deployment ranges.

---

## 6. Deployment

### Railway Services

| Service | Runtime | Resources | Scaling |
|---------|---------|-----------|---------|
| `uho-backend` | Node.js | 1 GB RAM | Always on |
| `uho-backfill` | Rust binary | 2-4 GB RAM, 2 vCPU | Scale to 0 when idle |
| `PostgreSQL` | Managed | Per plan | Always on |

### Sidecar Dockerfile

```dockerfile
FROM rust:1.82-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN apt-get update && apt-get install -y cmake libclang-dev
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/uho-backfill /usr/local/bin/
EXPOSE 3001
CMD ["uho-backfill", "serve", "--port", "3001"]
```

### Environment Variables

```bash
# Sidecar
JETSTREAMER_CLICKHOUSE_MODE=off
JETSTREAMER_THREADS=2
RUST_LOG=info,jetstreamer=warn

# Backend
BACKFILL_SIDECAR_URL=http://uho-backfill.railway.internal:3001
BACKFILL_MAX_CONCURRENT_JOBS=2
BACKFILL_CHECKPOINT_INTERVAL_EVENTS=1000
BACKFILL_CHECKPOINT_INTERVAL_MS=30000
```

### Railway Constraints

| Constraint | Mitigation |
|-----------|------------|
| No persistent disk | Jetstreamer streams from network — no local cache needed |
| Container restarts | Chunk-based checkpointing + resume |
| 8 GB RAM limit | 1-2 firehose threads + bounded channels |
| Shared CPU | Accept slower throughput, prioritize reliability |

---

## 7. IDL Versioning

Programs may upgrade their IDL mid-history. **Phase 1:** catch decode errors and skip (most programs don't change event layout). **Phase 2:** multi-IDL decoder with slot ranges:

```typescript
class VersionedDecoder {
  // Try decoders newest-first, fall back to older IDL versions
  // Each decoder tagged with validFrom/validTo slot range
}
```

---

## 8. Implementation Plan

### Phase 1: Working Full Backfill (1-2 weeks)
1. Fix sidecar compilation (git rev pinning)
2. Add Axum HTTP server to sidecar
3. Replace `runRpcBackfill` with HTTP stream consumption
4. Basic checkpointing (current_slot every 30s)
5. Deploy sidecar as Railway service
6. Remove `DEMO_BACKFILL_SLOT_LIMIT`

### Phase 2: Reliability (1-2 weeks)
7. Chunk-based checkpointing with resume
8. Batch writes (100 events per flush)
9. Job queue with `SELECT FOR UPDATE SKIP LOCKED`
10. Backpressure tuning + retry logic

### Phase 3: Multi-Tenancy (1-2 weeks)
11. Shared program deduplication + FanoutWriter
12. Priority queue (paid users first)
13. Horizontal sidecar scaling
14. Smart deployment slot detection

### Phase 4: Advanced (Future)
15. IDL versioning with multi-decoder
16. Incremental backfill (bridge historical → live)
17. Scale-to-zero sidecar
18. Prometheus metrics + alerting

---

## Appendix: Old Faithful Reference

```
Epoch duration: 432,000 slots (~2-3 days)
Slot → Epoch:   epoch = slot / 432_000
Current:        ~Epoch 830+ (Slot ~358M+)
Archive URL:    https://files.old-faithful.net/
```
