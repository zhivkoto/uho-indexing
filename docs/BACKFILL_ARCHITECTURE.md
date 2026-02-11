# Uho — Production Backfill Architecture

> **Status:** Design Document · **Updated:** 2026-02-11  
> ⚠️ Sections marked `[EXISTS]` describe current implementation. All others are `[PLANNED]`.

---

## 1. Executive Summary

Full archival backfill — indexing a program's entire on-chain history — using a **Rust sidecar** built on [Jetstreamer](https://github.com/anza-xyz/jetstreamer), deployed on dedicated infrastructure, streaming NDJSON over HTTP to the Node.js backend.

**Key decisions:**
- **Jetstreamer + Old Faithful** — free, unlimited archival access (only viable option at scale)
- **Dedicated VPS** for the sidecar (not Railway — needs sustained CPU, bandwidth, and memory)
- **HTTP streaming** between sidecar and backend (not subprocess)
- **Chunk-based checkpointing** with resume-from-failure
- **Backpressure** via bounded channels to prevent memory blowout
- **Thread-safe NDJSON** via dedicated writer thread (not raw `println!`)
- **Standalone crate** — git rev pinning to fix dependency issues

---

## 2. Current State & Known Issues

### What exists `[EXISTS]`
- **Demo backfill:** RPC `getSignaturesForAddress` polling, 10K slot limit (~67 min), single-threaded
- **Sidecar prototype:** Jetstreamer plugin filtering by program ID, NDJSON stdout, spawned as subprocess
- **Pipeline:** Sidecar → `EventDecoder.decodeLogMessages()` → `EventWriter.writeEvents()` → Postgres
- **Cancellation flag** in RPC backfill loop (via `cancelledJobs` Set)
- **Auth check** on backfill job ownership

### Known issues (from hostile review)

**Critical:**
1. **stdout not thread-safe** — Jetstreamer calls plugin from multiple threads. `println!` for lines >4KB (PIPE_BUF) can interleave → corrupt NDJSON → silently dropped events
2. **No backpressure** — doc describes bounded channels, code uses raw `println!`. Slow consumer blocks tokio thread → potential deadlock
3. **Zombie jobs on restart** — `activeJobs` is in-memory Map. Backend restart = jobs stuck as `running` forever. No startup recovery
4. **No data integrity verification** — no way to confirm backfill produced correct data
5. **`program_id_bytes` panics on <32 byte input** — crashes entire sidecar

**Major:**
6. **1 event = 1 DB round-trip** — no batching. 1M txs at 100ms each = ~28 hours
7. **ALT addresses missed** — `static_account_keys()` doesn't check address lookup tables. v0 txs with programs in ALTs are invisible to the filter
8. **`createSchemaPool` hack** — duck-typed `PoolClient` as `Pool`. Concurrent queries will collide
9. **50 pending writes × 2 jobs = 100 connections** — pool exhaustion under load
10. **Retry skips events** — resumes from `currentSlot` but checkpoint is 5s stale
11. **RPC cancellation doesn't update DB status** — job stays `running` forever after cancel
12. **No graceful shutdown** — SIGTERM mid-write = inconsistent checkpoint state

---

## 3. Why Jetstreamer

| Source | Coverage | Throughput | Cost | Verdict |
|--------|----------|-----------|------|---------|
| **Jetstreamer / Old Faithful** | Genesis → tip | ~50-200K TPS (hardware dependent) | Free | ✅ **Recommended** |
| **Helius Enhanced API** | Limited history | ~100 TPS (rate limited) | Paid at volume | ❌ Too slow |
| **Yellowstone gRPC** | Real-time only | High | Requires Geyser node | ❌ No historical replay |
| **Solana Bigtable (RPC)** | Full history | ~50 TPS | RPC provider costs | ❌ Too slow |

### Internals (from source analysis)

- **Plugin trait:** `on_transaction(thread_id, db, tx: &TransactionData)` — called concurrently from multiple threads
- **Threading:** slot range split across N threads, **no cross-thread ordering guarantees**
- **No server-side filtering** — all txs streamed, client filters by program ID
- **No account data** — Old Faithful stores transactions only (important: programs whose events require account state context cannot be fully indexed via backfill alone)
- **Bandwidth:** ~250 Mbps per firehose thread. A full epoch is ~50-100 GB compressed
- **Limitation:** Epochs < 157 use bincode encoding (incompatible with modern plugins)

---

## 4. Architecture

```
┌─ VPS (Hetzner/OVH) ──────────────────────────────────┐
│                                                        │
│  ┌──────────────────┐                                 │
│  │ Backfill Worker   │  Rust binary                   │
│  │ (uho-backfill)    │  • Jetstreamer + Old Faithful  │
│  │                    │  • Thread-safe NDJSON writer   │
│  │  Axum HTTP server  │  • Bounded channel backpressure│
│  │  :3001             │  • Program ID filter (+ALTs)   │
│  └────────┬───────────┘                               │
│           │ HTTP NDJSON stream                         │
└───────────┼───────────────────────────────────────────┘
            │ (public internet / WireGuard tunnel)
┌───────────┼───────────────────────────────────────────┐
│  Railway  │                                            │
│           ▼                                            │
│  ┌──────────────────┐     ┌─────────────────┐         │
│  │ Uho Backend       │────▶│ PostgreSQL       │        │
│  │ (Node.js)         │     │ • User schemas   │        │
│  │ • Job scheduler   │     │ • Job state      │        │
│  │ • Batch decoder   │     │ • Checkpoints    │        │
│  │ • Batch writer    │     └─────────────────┘         │
│  │ • Zombie recovery │                                 │
│  └──────────────────┘                                 │
│                                                        │
│  ┌──────────────────┐                                 │
│  │ Dashboard (Next)  │                                 │
│  └──────────────────┘                                 │
└────────────────────────────────────────────────────────┘
            │
            ▼ HTTP (Old Faithful CDN)
   files.old-faithful.net
```

### Why not Railway for the sidecar?

| Concern | Railway | Dedicated VPS |
|---------|---------|---------------|
| **CPU** | Shared, throttled | Dedicated cores |
| **RAM** | 8 GB max (default plan) | 16-64 GB available |
| **Bandwidth** | Shared, metered | 1+ Gbps unmetered |
| **Persistent disk** | None | NVMe SSD for temp caching |
| **Cost** | $5-20/mo but poor perf | Hetzner CAX21: €8/mo (4 vCPU, 8 GB, ARM) |
| **Throughput** | ~20-50K TPS realistic | ~100-200K TPS realistic |

The sidecar is CPU and bandwidth intensive. Railway's shared resources make full archival backfill impractically slow. A cheap Hetzner/OVH VPS with dedicated cores delivers 4-10x better throughput at similar cost.

**Connection:** Backend (Railway) ↔ Sidecar (VPS) via authenticated HTTPS or WireGuard tunnel.

---

## 5. Component Design

### 5.1 Backfill Worker (Rust Sidecar) `[PLANNED]`

**Fixing current issues:**

```toml
# Standalone crate — git rev pinning
[dependencies]
jetstreamer = { git = "https://github.com/anza-xyz/jetstreamer", rev = "<sha>" }
```

**Thread-safe NDJSON writer** (fixes stdout interleaving):
```rust
struct SafeWriter {
    tx: tokio::sync::mpsc::Sender<String>, // bounded channel
}

// Dedicated drain task writes to HTTP response stream
async fn drain(mut rx: Receiver<String>, response_writer: impl AsyncWrite) {
    while let Some(line) = rx.recv().await {
        response_writer.write_all(line.as_bytes()).await;
        response_writer.write_all(b"\n").await;
    }
}
```

**Program ID filter with ALT support** (fixes missed v0 txs):
```rust
fn matches_program(&self, tx: &TransactionData) -> bool {
    // Check static keys
    let static_match = tx.transaction.message.static_account_keys()
        .iter().any(|k| k.as_ref() == self.program_id_bytes);
    if static_match { return true; }
    
    // Check loaded addresses from lookup tables
    if let Some(meta) = &tx.transaction_status_meta {
        if let Some(loaded) = &meta.loaded_addresses {
            return loaded.writable.iter().chain(loaded.readonly.iter())
                .any(|k| k.as_ref() == self.program_id_bytes);
        }
    }
    false
}
```

**Input validation** (fixes panic on bad base58):
```rust
let bytes = bs58::decode(program_id).into_vec()
    .map_err(|e| anyhow!("Invalid base58: {e}"))?;
if bytes.len() != 32 {
    return Err(anyhow!("Program ID must be 32 bytes, got {}", bytes.len()));
}
```

**HTTP API:**
```
POST /backfill   → 200, chunked NDJSON stream (authenticated via shared secret)
GET  /health     → 200 { status, activeJobs, uptimeSeconds }
DELETE /backfill/:jobId → 200 { cancelled: true }
```

**Graceful shutdown:** SIGTERM → stop accepting new txs → flush channel → checkpoint → exit.

### 5.2 Backend Backfill Manager (Node.js) `[PLANNED]`

**Zombie job recovery on startup:**
```typescript
async onStartup() {
  const staleJobs = await this.pool.query(
    `UPDATE backfill_jobs SET status = 'failed', error = 'Service restarted'
     WHERE status = 'running' AND updated_at < NOW() - INTERVAL '5 minutes'
     RETURNING id`
  );
  if (staleJobs.rowCount > 0) {
    console.log(`[Backfill] Recovered ${staleJobs.rowCount} zombie jobs`);
  }
}
```

**Batch writes** (fixes 1-event-per-transaction):
```typescript
const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 1000;
let batch: DecodedEvent[] = [];

// Flush on size OR time, whichever comes first
async function addEvents(events: DecodedEvent[]) {
  batch.push(...events);
  if (batch.length >= BATCH_SIZE) await flush();
}
```

**Connection pool protection:**
```typescript
const WRITE_CONCURRENCY = 4; // semaphore limit per job
const writeSemaphore = new Semaphore(WRITE_CONCURRENCY);
```

**Retry with overlap buffer** (fixes skipped events):
```typescript
const RETRY_OVERLAP_SLOTS = 1000;
config.startSlot = Math.max(0, (job.currentSlot ?? 0) - RETRY_OVERLAP_SLOTS);
// ON CONFLICT DO NOTHING handles duplicates from overlap
```

### 5.3 Sidecar Authentication `[PLANNED]`

Shared secret between backend and sidecar:
```
Authorization: Bearer <BACKFILL_SIDECAR_SECRET>
```
Sidecar rejects unauthenticated requests. Secret stored as env var on both services.

---

## 6. Reliability

### Chunk-Based Checkpointing `[PLANNED]`

Split ranges into 100K-slot chunks. Track independently:

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

On resume: skip completed chunks, restart incomplete ones with overlap buffer. `ON CONFLICT DO NOTHING` ensures idempotent writes.

**Note:** Jetstreamer threads process slots out of order. Chunks track completion at the chunk level (all slots in range processed), not individual slot level.

### Data Integrity Verification `[PLANNED]`

Post-backfill sampling: pick N random transactions from the backfilled range, re-fetch from RPC, decode independently, compare with stored events. Flag mismatches.

```typescript
async verifyBackfill(jobId: string, sampleSize = 50): Promise<VerificationResult> {
  // Sample random tx signatures from backfilled events
  // Re-fetch from RPC, decode, compare field-by-field
  // Return { verified, mismatches, skipRate }
}
```

### Decode Failure Tracking `[PLANNED]`

Track skip rate per job. If >5% of transactions fail to decode, warn user that their IDL may be outdated or the program had IDL upgrades mid-history.

---

## 7. Multi-Tenancy `[PLANNED]`

**Deduplication** — when multiple users backfill the same program with overlapping slot ranges:
1. Merge overlapping ranges into a single sidecar stream
2. Fan out decoded events to subscriber schemas via `FanoutWriter`
3. Track checkpoints per user independently

**Per-user limits:**
- Free tier: 1 concurrent backfill, 100K slot max range
- Paid tier: 2 concurrent, unlimited range
- Job queue with priority (paid users first)

**Rate limiting:** max 1 backfill start per user per 5 minutes.

---

## 8. IDL Versioning `[PLANNED]`

**Phase 1 (MVP):** Catch decode errors, skip, track skip rate. Warn user if >5%.

**Phase 2:** Multi-IDL decoder with slot ranges:
```typescript
class VersionedDecoder {
  decoders: Array<{ decoder: EventDecoder; validFrom?: number; validTo?: number }>;
  // Try newest first, fall back to older versions
}
```

---

## 9. Deployment

### Production Topology

| Component | Platform | Specs | Cost |
|-----------|----------|-------|------|
| Backend + Dashboard | Railway | Standard plan | ~$10/mo |
| PostgreSQL | Railway / Supabase | Managed | ~$10-25/mo |
| **Backfill sidecar** | **Hetzner CAX31** | 8 ARM vCPU, 16 GB RAM, 1 Gbps | **€13/mo** |

Total: ~$35-50/mo for full production stack with archival backfill capability.

### Sidecar VPS Setup

```bash
# Hetzner CAX31 (ARM64, Ubuntu 24.04)
# Install Rust + build
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
apt install -y cmake libclang-dev pkg-config libssl-dev
cd /opt/uho-backfill && cargo build --release

# Systemd service
[Unit]
Description=Uho Backfill Worker
After=network.target

[Service]
ExecStart=/opt/uho-backfill/target/release/uho-backfill serve --port 3001
Environment=JETSTREAMER_CLICKHOUSE_MODE=off
Environment=JETSTREAMER_THREADS=4
Environment=RUST_LOG=info,jetstreamer=warn
Environment=BACKFILL_SECRET=<shared-secret>
Restart=always
MemoryMax=12G

[Install]
WantedBy=multi-user.target
```

### Network Security

- Sidecar listens on `0.0.0.0:3001` behind UFW (allow only Railway egress IPs)
- Or: WireGuard tunnel between Railway and VPS for private networking
- All traffic over HTTPS with shared secret auth
- No SSH password auth, key-only

### Environment Variables

```bash
# Sidecar (VPS)
JETSTREAMER_CLICKHOUSE_MODE=off
JETSTREAMER_THREADS=4
BACKFILL_SECRET=<shared-secret>
RUST_LOG=info

# Backend (Railway)
BACKFILL_SIDECAR_URL=https://backfill.uhoindexing.com:3001
BACKFILL_SIDECAR_SECRET=<shared-secret>
BACKFILL_MAX_CONCURRENT_JOBS=3
BACKFILL_BATCH_SIZE=200
BACKFILL_CHECKPOINT_INTERVAL_MS=30000
```

---

## 10. Monitoring `[PLANNED]`

**Ship with Phase 1 (not deferred):**
- Job duration, events/sec, error rate → logged per checkpoint update
- Decode skip rate per job (warn at >5%)
- Sidecar `/health` endpoint with active job count + memory usage
- Zombie job detection on startup

**Phase 3:**
- Prometheus metrics export
- Alerting on stale jobs, high error rates, connection pool saturation

---

## 11. Implementation Plan

### Phase 1: Working Full Backfill (1-2 weeks)
1. Fix sidecar: git rev pinning, thread-safe writer, input validation, ALT support
2. Add Axum HTTP server with auth + graceful shutdown
3. Deploy sidecar on Hetzner VPS with systemd
4. Backend: HTTP stream consumption, batch writes (200/flush), zombie recovery on startup
5. Basic checkpointing (current_slot every 30s with overlap buffer on retry)
6. Remove `DEMO_BACKFILL_SLOT_LIMIT`
7. Decode skip rate tracking + user warning

### Phase 2: Reliability (1-2 weeks)
8. Chunk-based checkpointing with per-chunk resume
9. Connection pool semaphore (max 4 concurrent writes per job)
10. Post-backfill integrity verification (sample N txs)
11. Graceful shutdown on both sidecar and backend
12. Job retry with exponential backoff (max 3 retries)

### Phase 3: Multi-Tenancy & Scale (1-2 weeks)
13. Shared program deduplication + FanoutWriter
14. Per-user job limits + priority queue
15. Rate limiting on backfill API
16. Prometheus metrics + alerting

### Phase 4: Advanced (Future)
17. IDL versioning with multi-decoder
18. Incremental backfill (bridge historical → live)
19. Smart deployment slot detection (binary search epochs)
20. Scale-to-zero sidecar (stop systemd when idle, wake via API)
