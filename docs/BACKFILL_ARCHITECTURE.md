# Uho — Backfill Architecture

> **Status:** Production Design · **Updated:** 2026-02-11
> Sections marked `[EXISTS]` describe current implementation. `[PLANNED]` = not yet built.

---

## 1. Overview

Backfill indexes a Solana program's full on-chain history using a **Rust sidecar** (Jetstreamer + Old Faithful), deployed on a **dedicated Hetzner VPS**, streaming NDJSON over authenticated HTTP to the Node.js backend on Railway.

**Realistic performance:** 15–40K events/sec on Hetzner CAX31 (8 ARM vCPU, 16 GB RAM). A program with 10M historical transactions completes in ~4–12 hours depending on match rate and decode complexity.

---

## 2. Current State `[EXISTS]`

**What works:**
- RPC `getSignaturesForAddress` backfill, capped at 10K slots (~67 min of history)
- Sidecar prototype: Jetstreamer plugin filtering by program ID, NDJSON to stdout, spawned as subprocess
- Pipeline: Sidecar → `EventDecoder.decodeLogMessages()` → `EventWriter.writeEvents()` → Postgres
- Cancellation via in-memory `cancelledJobs` Set; auth check on job ownership

**What's broken (22 findings from hostile review):**

| # | Severity | Issue | Section |
|---|----------|-------|---------|
| 1 | Critical | `println!` from N threads interleaves lines >4KB | §4.1 |
| 2 | Critical | No backpressure — raw stdout, no bounded channels | §4.1 |
| 3 | Critical | Zombie jobs — in-memory `activeJobs` lost on restart | §4.2 |
| 4 | Critical | No data integrity verification | §5.2 |
| 5 | Critical | `program_id_bytes` panics on <32 byte input | §4.1 |
| 6 | Critical | Doc describes systems that don't exist | This doc |
| 7 | Critical | "200K TPS on Railway" was fiction | §1 |
| 8 | Major | ALT addresses missed — v0 lookup tables ignored | §4.1 |
| 9 | Major | 1 event = 1 DB round-trip — no batching | §4.2 |
| 10 | Major | `createSchemaPool` — duck-typed PoolClient as Pool | §4.2 |
| 11 | Major | Connection pool exhaustion (50 pending × 2 jobs) | §4.2 |
| 12 | Major | Retry resumes from stale checkpoint, skips events | §5.1 |
| 13 | Major | RPC cancellation doesn't update DB status | §4.2 |
| 14 | Major | No graceful shutdown | §4.1, §4.2 |
| 15 | Major | Multi-tenant dedup assumes identical slot ranges | §6 |
| 16 | Major | No rate limiting on backfill API | §6 |
| 17 | Major | No disk/memory circuit breaker | §4.1 |
| 18 | Major | Sidecar has no authentication | §4.1 |
| 19 | Major | IDL changes more common than assumed | §5.3 |
| 20 | Minor | No observability / metrics | §7 |
| 21 | Minor | `unsafe set_var` warnings | §4.1 |
| 22 | Minor | Silent decode failures, no skip rate reporting | §5.3 |

---

## 3. Why Jetstreamer

| Source | Coverage | Throughput | Cost | Verdict |
|--------|----------|-----------|------|---------|
| Jetstreamer + Old Faithful | Genesis → tip | 15–40K matched/sec | Free | ✅ |
| Helius Enhanced API | Limited history | ~100 TPS | Paid | ❌ Too slow |
| Yellowstone gRPC | Real-time only | High | Geyser node | ❌ No history |
| Solana Bigtable (RPC) | Full | ~50 TPS | RPC costs | ❌ Too slow |

**Key constraints:**
- Plugin `on_transaction` called from **multiple threads** — no ordering guarantees
- Old Faithful stores transactions only — no account state
- Epochs < 157 use bincode (incompatible with modern plugins)
- ~250 Mbps bandwidth per firehose thread; full epoch = 50–100 GB compressed

---

## 4. Component Design

### 4.1 Rust Sidecar `[PLANNED]`

Axum HTTP server on the VPS. One endpoint streams NDJSON per job.

**Thread-safe output** (fixes #1, #2): Dedicated writer task drains a bounded channel.

```rust
use tokio::sync::mpsc;

const CHANNEL_CAPACITY: usize = 8192;

struct StreamingPlugin {
    tx: mpsc::Sender<String>,
    program_id: [u8; 32],
    stats: Arc<Stats>,
}

impl Plugin for StreamingPlugin {
    fn on_transaction<'a>(&'a self, _tid: usize, _db: Option<Arc<clickhouse::Client>>,
                          transaction: &'a TransactionData) -> PluginFuture<'a> {
        async move {
            self.stats.total.fetch_add(1, Relaxed);
            if transaction.is_vote { return Ok(()); }
            if !self.matches_program(transaction) { return Ok(()); }
            // ... extract logs, build JSON ...
            let json = serde_json::to_string(&record)?;
            // Backpressure: blocks if consumer is slow, bounded channel prevents OOM
            if self.tx.send(json).await.is_err() {
                return Err(anyhow!("Consumer disconnected"));
            }
            Ok(())
        }.boxed()
    }
}

// Drain task: single writer, no interleaving possible
async fn drain(mut rx: mpsc::Receiver<String>, mut writer: impl AsyncWrite + Unpin) {
    while let Some(line) = rx.recv().await {
        let _ = writer.write_all(line.as_bytes()).await;
        let _ = writer.write_all(b"\n").await;
    }
}
```

**ALT support** (fixes #8):
```rust
fn matches_program(&self, tx: &TransactionData) -> bool {
    let keys = tx.transaction.message.static_account_keys();
    if keys.iter().any(|k| k.to_bytes() == self.program_id) { return true; }
    // Check v0 loaded addresses from lookup tables
    if let Some(loaded) = &tx.transaction_status_meta.loaded_addresses {
        loaded.writable.iter().chain(loaded.readonly.iter())
            .any(|k| k.as_ref() == self.program_id)
    } else { false }
}
```

**Input validation** (fixes #5):
```rust
fn parse_program_id(s: &str) -> Result<[u8; 32]> {
    let bytes = bs58::decode(s).into_vec().context("Invalid base58")?;
    bytes.try_into().map_err(|v: Vec<u8>| anyhow!("Expected 32 bytes, got {}", v.len()))
}
```

**Authentication** (fixes #18): Shared secret via `Authorization: Bearer <secret>`. Reject all unauthenticated requests.

**Circuit breaker** (fixes #17): Monitor RSS via `/proc/self/status`. If >80% of `MemoryMax`, stop accepting new jobs. Existing jobs continue to drain.

**Graceful shutdown** (fixes #14): SIGTERM → set shutdown flag → stop Jetstreamer iteration → flush channel → respond with final stats → exit.

**No unsafe set_var** (fixes #21): Pass config via `JetstreamerRunner` builder API or env vars set *before* runtime init (current approach is fine since it's before `tokio::runtime::Builder`, but use `std::env::set_var` without unsafe block on Rust <1.83, or pass via builder if Jetstreamer supports it).

**HTTP API:**
```
POST /backfill     → 200 chunked NDJSON stream (long-lived)
GET  /health       → { status, activeJobs, memoryMb, uptimeSeconds }
DELETE /backfill/:id → { cancelled: true }
```

**Failure modes:**
- OOM → systemd `MemoryMax=12G` kills process → job marked failed via backend timeout
- Old Faithful CDN down → Jetstreamer errors → sidecar returns error in stream → backend marks failed
- Network partition → backend sees broken HTTP stream → marks job failed, retryable

### 4.2 Backend Backfill Manager `[PLANNED]`

Consumes sidecar HTTP stream. Replaces subprocess spawning with `fetch()`.

**Zombie recovery on startup** (fixes #3):
```typescript
// Run on every backend boot
await pool.query(`
  UPDATE backfill_jobs SET status = 'failed', error = 'Service restarted'
  WHERE status = 'running' AND updated_at < NOW() - INTERVAL '5 minutes'
`);
```

**Batch writes** (fixes #9, #10, #11):
```typescript
// Replace createSchemaPool hack — pass client directly
class BatchWriter {
  private buffer: DecodedEvent[] = [];
  private readonly BATCH_SIZE = 200;
  private readonly FLUSH_MS = 1000;
  private timer: NodeJS.Timeout | null = null;

  constructor(private client: pg.PoolClient, private parsedIdl: ParsedIDL) {}

  async add(events: DecodedEvent[]) {
    this.buffer.push(...events);
    if (this.buffer.length >= this.BATCH_SIZE) await this.flush();
    else this.startTimer();
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    // Multi-row INSERT with ON CONFLICT DO NOTHING
    await this.insertBatch(batch);
  }

  private async insertBatch(events: DecodedEvent[]) {
    // Group by event name, build multi-row VALUES clause per table
    const grouped = Map.groupBy(events, e => e.eventName);
    for (const [name, evts] of grouped) {
      // Build: INSERT INTO table (cols) VALUES ($1..$N), ($N+1..$2N), ... ON CONFLICT DO NOTHING
      // Single round-trip for up to 200 events
    }
  }
}
```

**Connection pool protection:** Use a semaphore (max 4 concurrent schema clients per job, max 2 concurrent jobs). Total worst case: 8 connections, not 100.

```typescript
const JOB_SEMAPHORE = new Semaphore(2);     // max concurrent jobs
const WRITE_SEMAPHORE = new Semaphore(4);    // max concurrent writes per job
```

**Cancellation fixes** (fixes #13): `stopBackfill()` must update DB status:
```typescript
async stopBackfill(jobId: string) {
  this.cancelledJobs.add(jobId);
  await this.updateJobStatus(jobId, { status: 'cancelled', completed_at: new Date().toISOString() });
  // Abort HTTP stream to sidecar
  this.activeAbortControllers.get(jobId)?.abort();
}
```

**Graceful shutdown** (fixes #14): On SIGTERM, cancel all active HTTP streams, flush pending batches, update all running jobs to `failed`.

**Rate limiting** (fixes #16): Max 1 backfill start per user per 5 minutes. Enforced in API middleware.

**Failure modes:**
- Backend restart mid-stream → zombie recovery on next boot → user retries
- Postgres down → batch write fails → job marked failed → retryable with overlap
- Sidecar unreachable → HTTP connection error → job marked failed

---

## 5. Reliability

### 5.1 Checkpointing & Resume `[PLANNED]`

Chunk-based: split slot range into 100K-slot chunks, tracked independently.

```sql
CREATE TABLE backfill_chunks (
  job_id UUID REFERENCES backfill_jobs(id),
  chunk_start BIGINT NOT NULL,
  chunk_end BIGINT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending | running | completed
  events_written INT DEFAULT 0,
  PRIMARY KEY (job_id, chunk_start)
);
```

**Resume with overlap** (fixes #12): On retry, restart incomplete chunks from `chunk_start - 1000` slots. `ON CONFLICT DO NOTHING` deduplicates the overlap. No events skipped.

### 5.2 Integrity Verification `[PLANNED]`

Post-backfill sampling (fixes #4): Pick 50 random tx signatures from backfilled data, re-fetch from RPC, decode independently, compare stored vs fresh. Report mismatch count.

```typescript
async verify(jobId: string, sampleSize = 50): Promise<{ verified: number; mismatches: number }> {
  const samples = await pool.query(
    `SELECT tx_signature FROM backfill_samples WHERE job_id = $1 ORDER BY random() LIMIT $2`,
    [jobId, sampleSize]
  );
  // Re-fetch each, decode, compare field-by-field
}
```

### 5.3 IDL Versioning `[PLANNED]`

**Skip rate tracking** (fixes #19, #22): Count decode failures per job. If >5%, surface warning: "Your program's IDL may have changed during the backfilled period."

**Phase 2:** Multi-IDL decoder — user provides IDL versions with slot ranges. Decoder picks the right version per transaction slot.

---

## 6. Multi-Tenancy `[PLANNED]`

**Dedup** (fixes #15): Do NOT merge overlapping ranges across users. Each user gets their own sidecar stream. Simpler, avoids fan-out complexity. At current scale (< 10 concurrent backfills), duplicate sidecar work is cheaper than coordination bugs.

**Decision:** Rejected shared streams because (a) slot ranges rarely overlap exactly, (b) fan-out writer adds complexity and failure modes, (c) Old Faithful bandwidth is free.

**Rate limiting** (fixes #16): 1 backfill start per user per 5 min. Max 2 concurrent jobs globally.

---

## 7. Observability `[PLANNED]`

Ship with Phase 1 (fixes #20):
- **Per-checkpoint log:** `{ jobId, eventsWritten, eventsSkipped, skipRate, elapsed, currentSlot }`
- **Sidecar `/health`:** active jobs, memory RSS, uptime
- **Decode skip rate** per job — warn at >5%, halt at >25%

Phase 3: Prometheus `/metrics` endpoint on sidecar, Grafana dashboard.

---

## 8. Deployment

| Component | Platform | Specs | Cost |
|-----------|----------|-------|------|
| Backend + Dashboard | Railway | Standard | ~$10/mo |
| PostgreSQL | Railway | Managed | ~$10–25/mo |
| **Backfill sidecar** | **Hetzner CAX31** | 8 ARM vCPU, 16 GB RAM, 1 Gbps | **€13/mo** |

**Sidecar systemd unit:**
```ini
[Service]
ExecStart=/opt/uho-backfill/target/release/uho-backfill serve --port 3001
Environment=BACKFILL_SECRET=<secret>
Environment=RUST_LOG=info,jetstreamer=warn
Restart=always
MemoryMax=12G
```

**Network:** UFW allow only Railway egress IPs on port 3001. All traffic HTTPS + Bearer token. SSH key-only.

---

## 9. Decision Log

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Sidecar hosting | Hetzner CAX31 | Railway | Dedicated CPU/bandwidth; Railway shared resources give ~5x worse throughput |
| Sidecar ↔ backend | HTTP NDJSON stream | Subprocess stdio | HTTP works across machines; subprocess ties them to same host |
| Thread-safe output | Bounded mpsc channel + drain task | Mutex on stdout | Channel provides backpressure; mutex doesn't |
| Multi-tenant dedup | Separate streams per user | Shared stream + fan-out | Simpler, fewer failure modes; bandwidth is free |
| Batch writes | Multi-row INSERT (200/batch) | Individual inserts | 200x fewer round-trips; ~28h → ~8min for 1M events |
| Checkpointing | Chunk-based (100K slots) | Slot-level | Manageable granularity; slot-level = millions of rows in checkpoint table |
| Integrity check | Post-hoc sampling | Inline verification | Inline would halve throughput; sampling catches systemic issues |
| Connection pooling | Semaphore (4 writers/job) | Unbounded | Prevents pool exhaustion (finding #11) |

---

## 10. Implementation Plan

### Phase 1: Working Full Backfill (1–2 weeks)
**No dependencies on later phases.**

1. Sidecar: input validation, bounded channel, drain task, ALT support
2. Sidecar: Axum HTTP server with Bearer auth + `/health`
3. Deploy on Hetzner CAX31 with systemd
4. Backend: HTTP stream consumer (replace subprocess), `BatchWriter` with multi-row INSERT
5. Backend: zombie job recovery on startup
6. Backend: cancellation updates DB status
7. Remove `DEMO_BACKFILL_SLOT_LIMIT`
8. Decode skip rate tracking + user warning

### Phase 2: Reliability (1–2 weeks)
**Depends on Phase 1.**

9. Chunk-based checkpointing with resume + overlap buffer
10. Connection pool semaphore
11. Graceful shutdown (both sidecar and backend)
12. Post-backfill integrity verification
13. Memory circuit breaker on sidecar
14. Rate limiting on backfill API (1 per user per 5 min)

### Phase 3: Scale & Observability (1–2 weeks)
**Depends on Phase 2.**

15. Prometheus metrics on sidecar
16. Multi-IDL decoder with slot ranges
17. Per-user job limits + priority queue
18. Incremental backfill (bridge historical → live)
