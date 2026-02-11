# Uho — Backfill Architecture

> **Status:** Production Design · **Updated:** 2026-02-11
> Sections marked `[EXISTS]` describe current implementation. `[PLANNED]` = not yet built.

---

## 1. Overview

Backfill indexes a Solana program's full on-chain history using a **Rust sidecar** (Jetstreamer + Old Faithful), deployed on a **dedicated Hetzner VPS**, streaming NDJSON over localhost to the co-located Node.js backend.

**Realistic performance:** 15–40K events/sec on Hetzner CAX31 (8 ARM vCPU, 16 GB RAM). A program with 10M historical transactions completes in ~4–12 hours depending on match rate and decode complexity.

---

## System Diagram

```
                         Internet
                            │
                     DNS: uhoindexing.com
                   api.  → backend:4000
                   www.  → dashboard:3000
                            │
┌─ Hetzner CAX31 (8 ARM vCPU, 16 GB RAM, 160 GB NVMe) ─────────────────┐
│                           │                                             │
│  ┌────────── Caddy (reverse proxy, auto-TLS) ──────────┐              │
│  │  :443 → api.uhoindexing.com  → localhost:4000       │              │
│  │  :443 → uhoindexing.com      → localhost:3000       │              │
│  └──────────────────────────────────────────────────────┘              │
│           │                              │                              │
│  ┌────────▼─────────┐    ┌──────────────▼──────────┐                  │
│  │  Uho Backend      │    │  Dashboard (Next.js)    │                  │
│  │  (Node.js/Fastify) │    │  standalone on :3000    │                  │
│  │  :4000             │    └─────────────────────────┘                  │
│  │                    │                                                 │
│  │  ┌──────────┐     │    localhost (no network hop)                   │
│  │  │ Job Queue │     │◀═══════════ NDJSON pipe ═══════════╗           │
│  │  │ Scheduler │     │                                     ║           │
│  │  └─────┬────┘     │                                     ║           │
│  │        │          │                                     ║           │
│  │   Batch INSERT    │                                     ║           │
│  │        │          │                                     ║           │
│  └────────┼──────────┘                                     ║           │
│           │                                                ║           │
│  ┌────────▼──────────────────────────────┐   ┌─────────────╩────────┐ │
│  │ PostgreSQL 16                          │   │ Backfill Sidecar     │ │
│  │ :5432 (listen localhost only)          │   │ (Rust/Axum on :3001) │ │
│  │                                        │   │                      │ │
│  │ ├─ backfill_jobs                       │   │ Jetstreamer streams  │ │
│  │ ├─ backfill_chunks                     │   │ from Old Faithful    │ │
│  │ └─ user_schema_*                       │   │ → filter → NDJSON   │ │
│  │                                        │   │                      │ │
│  │ WAL → /backup/wal (pg_basebackup)     │   │ systemd MemoryMax=10G│ │
│  └────────────────────────────────────────┘   └──────────────────────┘ │
│                                                         │               │
│  Docker Compose manages: postgres, backend, dashboard   │               │
│  systemd manages: sidecar (native binary, needs CPU)    │               │
│  Caddy runs as system service (auto-TLS via Let's Encrypt)             │
└─────────────────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                                files.old-faithful.net
                                                (Solana CAR archive CDN)
```

**Data flow summary:**
1. User triggers backfill → backend creates job in Postgres
2. Backend calls sidecar on `localhost:3001` (no network hop, no TLS overhead)
3. Sidecar runs Jetstreamer, filters matching txs through bounded channel
4. Single drain task streams NDJSON back to backend over localhost
5. Backend decodes events via IDL → batch INSERTs into co-located Postgres
6. Dashboard polls for progress updates

---

## 2. Current State `[EXISTS]`

**What works:**
- RPC `getSignaturesForAddress` backfill, capped at 10K slots (~67 min of history)
- Sidecar prototype: Jetstreamer plugin filtering by program ID, NDJSON to stdout, spawned as subprocess
- Pipeline: Sidecar → `EventDecoder.decodeLogMessages()` → `EventWriter.writeEvents()` → Postgres
- Cancellation via in-memory `cancelledJobs` Set; auth check on job ownership

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

**Thread-safe output**: Dedicated writer task drains a bounded channel.

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

**ALT support**:
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

**Input validation**:
```rust
fn parse_program_id(s: &str) -> Result<[u8; 32]> {
    let bytes = bs58::decode(s).into_vec().context("Invalid base58")?;
    bytes.try_into().map_err(|v: Vec<u8>| anyhow!("Expected 32 bytes, got {}", v.len()))
}
```

**Authentication**: Shared secret via `Authorization: Bearer <secret>`. Reject all unauthenticated requests.

**Circuit breaker**: Monitor RSS via `/proc/self/status`. If >80% of `MemoryMax`, stop accepting new jobs. Existing jobs continue to drain.

**Graceful shutdown**: SIGTERM → set shutdown flag → stop Jetstreamer iteration → flush channel → respond with final stats → exit.

**No unsafe set_var**: Pass config via `JetstreamerRunner` builder API or env vars set *before* runtime init (current approach is fine since it's before `tokio::runtime::Builder`, but use `std::env::set_var` without unsafe block on Rust <1.83, or pass via builder if Jetstreamer supports it).

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

**Zombie recovery on startup**:
```typescript
// Run on every backend boot
await pool.query(`
  UPDATE backfill_jobs SET status = 'failed', error = 'Service restarted'
  WHERE status = 'running' AND updated_at < NOW() - INTERVAL '5 minutes'
`);
```

**Batch writes**:
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

**Cancellation fixes**: `stopBackfill()` must update DB status:
```typescript
async stopBackfill(jobId: string) {
  this.cancelledJobs.add(jobId);
  await this.updateJobStatus(jobId, { status: 'cancelled', completed_at: new Date().toISOString() });
  // Abort HTTP stream to sidecar
  this.activeAbortControllers.get(jobId)?.abort();
}
```

**Graceful shutdown**: On SIGTERM, cancel all active HTTP streams, flush pending batches, update all running jobs to `failed`.

**Rate limiting**: Max 1 backfill start per user per 5 minutes. Enforced in API middleware.

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

**Resume with overlap**: On retry, restart incomplete chunks from `chunk_start - 1000` slots. `ON CONFLICT DO NOTHING` deduplicates the overlap. No events skipped.

### 5.2 Integrity Verification `[PLANNED]`

Post-backfill sampling: Pick 50 random tx signatures from backfilled data, re-fetch from RPC, decode independently, compare stored vs fresh. Report mismatch count.

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

**Skip rate tracking**: Count decode failures per job. If >5%, surface warning: "Your program's IDL may have changed during the backfilled period."

**Phase 2:** Multi-IDL decoder — user provides IDL versions with slot ranges. Decoder picks the right version per transaction slot.

---

## 6. Multi-Tenancy `[PLANNED]`

**Dedup**: Do NOT merge overlapping ranges across users. Each user gets their own sidecar stream. Simpler, avoids fan-out complexity. At current scale (< 10 concurrent backfills), duplicate sidecar work is cheaper than coordination bugs.

**Decision:** Rejected shared streams because (a) slot ranges rarely overlap exactly, (b) fan-out writer adds complexity and failure modes, (c) Old Faithful bandwidth is free.

**Rate limiting**: 1 backfill start per user per 5 min. Max 2 concurrent jobs globally.

---

## 7. Observability `[PLANNED]`

Ship with Phase 1:
- **Per-checkpoint log:** `{ jobId, eventsWritten, eventsSkipped, skipRate, elapsed, currentSlot }`
- **Sidecar `/health`:** active jobs, memory RSS, uptime
- **Decode skip rate** per job — warn at >5%, halt at >25%

Phase 3: Prometheus `/metrics` endpoint on sidecar, Grafana dashboard.

---

## 8. Deployment

> **Strategy:** Single Hetzner VPS running everything. Co-location eliminates network hops between
> backend ↔ sidecar ↔ Postgres. Upgrade path to multi-node when needed.

### 8.1 Infrastructure

| Component | Runtime | Port | Management |
|-----------|---------|------|------------|
| **Caddy** | System package | :80, :443 | systemd |
| **Backend** (Fastify) | Docker | :4000 | Docker Compose |
| **Dashboard** (Next.js) | Docker | :3000 | Docker Compose |
| **PostgreSQL 16** | Docker | :5432 (localhost) | Docker Compose |
| **Backfill sidecar** | Native binary | :3001 (localhost) | systemd |

**Server:** Hetzner CAX31 — 8 ARM vCPU, 16 GB RAM, 160 GB NVMe, 1 Gbps — **€13.20/mo**

**Why this split:**
- Sidecar runs as native binary via systemd (not Docker) — needs raw CPU, direct memory control via `MemoryMax`, and avoids Docker overhead for a CPU-bound Rust process
- Backend + Dashboard + Postgres in Docker Compose — standard, reproducible, easy rollback
- Caddy as system service — manages TLS certificates automatically, routes to Docker ports

### 8.2 Docker Compose

```yaml
# /opt/uho/docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: uho
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: uho
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./pg-conf/postgresql.conf:/etc/postgresql/postgresql.conf
      - ./backups:/backups
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    shm_size: 256mb
    deploy:
      resources:
        limits:
          memory: 4G

  backend:
    image: ghcr.io/OWNER/uho-backend:${TAG:-latest}
    restart: always
    ports:
      - "127.0.0.1:4000:4000"
    environment:
      DATABASE_URL: postgresql://uho:${POSTGRES_PASSWORD}@postgres:5432/uho
      BACKFILL_SIDECAR_URL: http://host.docker.internal:3001
      BACKFILL_SECRET: ${BACKFILL_SECRET}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    deploy:
      resources:
        limits:
          memory: 2G

  dashboard:
    image: ghcr.io/OWNER/uho-dashboard:${TAG:-latest}
    restart: always
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: https://api.uhoindexing.com
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  pg_data:
```

### 8.3 PostgreSQL Tuning (backfill-optimized)

```ini
# /opt/uho/pg-conf/postgresql.conf
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB
maintenance_work_mem = 512MB
wal_buffers = 64MB

# Write-heavy tuning for backfill
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB
wal_level = replica              # needed for PITR
archive_mode = on
archive_command = 'cp %p /backups/wal/%f'

# Connection limits (no pooler needed at this scale)
max_connections = 50

# Logging
log_min_duration_statement = 1000
log_checkpoints = on
```

### 8.4 Caddy (Reverse Proxy + Auto-TLS)

```
# /etc/caddy/Caddyfile

api.uhoindexing.com {
    reverse_proxy localhost:4000
    encode gzip
}

uhoindexing.com {
    reverse_proxy localhost:3000
    encode gzip
}

# Health check endpoint (no TLS)
:8080 {
    respond /health 200
}
```

Install: `sudo apt install caddy` — auto-renews TLS via Let's Encrypt, zero config.

### 8.5 Sidecar systemd Unit

```ini
# /etc/systemd/system/uho-sidecar.service
[Unit]
Description=Uho Backfill Sidecar
After=network.target

[Service]
Type=simple
ExecStart=/opt/uho-sidecar/uho-backfill serve --port 3001
Environment=BACKFILL_SECRET=<secret>
Environment=RUST_LOG=info,jetstreamer=warn
Restart=always
RestartSec=5
MemoryMax=10G
MemoryHigh=8G
User=uho
WorkingDirectory=/opt/uho-sidecar

[Install]
WantedBy=multi-user.target
```

### 8.6 Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 80/tcp    # Caddy HTTP (redirect → HTTPS)
sudo ufw allow 443/tcp   # Caddy HTTPS
# Ports 3000, 3001, 4000, 5432 are localhost-only — not exposed
sudo ufw enable
```

### 8.7 CI/CD (GitHub Actions → Zero-Downtime Deploy)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Build & push backend image
        run: |
          echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker build -t ghcr.io/OWNER/uho-backend:${{ github.sha }} -f backend/Dockerfile backend/
          docker push ghcr.io/OWNER/uho-backend:${{ github.sha }}

      - name: Build & push dashboard image
        run: |
          docker build -t ghcr.io/OWNER/uho-dashboard:${{ github.sha }} -f dashboard/Dockerfile dashboard/
          docker push ghcr.io/OWNER/uho-dashboard:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/uho
            export TAG=${{ github.sha }}
            docker compose pull backend dashboard
            docker compose up -d --no-deps backend    # rolling: backend first
            sleep 5
            curl -sf http://localhost:4000/health || exit 1
            docker compose up -d --no-deps dashboard
            docker image prune -f
```

**Sidecar deploy** (less frequent, manual or separate workflow):
```bash
# On VPS or via SSH action
cd /opt/uho-sidecar
curl -L -o uho-backfill-new https://github.com/OWNER/uho-sidecar/releases/download/$TAG/uho-backfill-aarch64
chmod +x uho-backfill-new
# Wait for active jobs to drain, then:
sudo systemctl stop uho-sidecar
mv uho-backfill-new uho-backfill
sudo systemctl start uho-sidecar
```

### 8.8 Backup Strategy

**Daily base backup** (cron, 03:00 UTC):
```bash
# /etc/cron.d/uho-backup
0 3 * * * uho docker exec uho-postgres-1 pg_basebackup -D /backups/base-$(date +\%Y\%m\%d) -Ft -z -P
```

**WAL archiving:** Continuous via `archive_command` (see §8.3). WAL files copied to `/backups/wal/`.

**Offsite:** Sync `/backups/` to Hetzner Storage Box (BX11, €3.81/mo for 1 TB) via borgbackup:
```bash
# Weekly borg backup
0 4 * * 0 borg create ssh://u123456@u123456.your-storagebox.de:23/./uho::weekly-{now} /backups/
```

**Recovery:** PITR to any point using base backup + WAL replay.

### 8.9 Monitoring (Minimal Viable)

| What | How | Cost |
|------|-----|------|
| **Uptime** | UptimeRobot (free, 5-min checks on api + www) | $0 |
| **Server metrics** | `htop` + Hetzner Cloud console (CPU, disk, bandwidth) | $0 |
| **App health** | Backend `/health` → returns DB status, active jobs, memory | $0 |
| **Sidecar health** | `/health` → active jobs, RSS, uptime | $0 |
| **Alerts** | UptimeRobot → Telegram webhook on downtime | $0 |
| **Logs** | `docker compose logs -f` + `journalctl -u uho-sidecar -f` | $0 |
| **Postgres** | `pg_stat_statements` + log slow queries (>1s) | $0 |

**Phase 3 upgrade:** Add Prometheus node_exporter + Grafana on same box (or Grafana Cloud free tier: 10K metrics).

### 8.10 Scaling Path

**Current ceiling:** CAX31 handles ~15-40K events/sec indexing + API traffic comfortably. Likely sufficient for 50+ programs and moderate API load.

**When to scale:**
| Signal | Action |
|--------|--------|
| CPU sustained >80% during backfill + API | Upgrade to CAX41 (16 vCPU, 32 GB — €25/mo) |
| Postgres disk >120 GB | Attach Hetzner Volume (€4.80/100GB/mo) |
| API latency >200ms p95 | Split: move backend+dashboard to separate CAX21 (€7/mo), keep sidecar+PG on CAX31 |
| >5 concurrent backfills needed | Dedicated sidecar on second CAX31, connect to PG via private network |
| Need HA / zero-downtime DB | Migrate PG to managed (Neon free tier, or Supabase, or Hetzner managed DB at €19/mo) |

**Private networking:** Hetzner vSwitch / private network (free) connects VPSes at 10 Gbps. Split architecture when single-box ceiling is hit.

### 8.11 Cost Summary

| Item | Monthly |
|------|---------|
| Hetzner CAX31 | €13.20 |
| Hetzner Storage Box BX11 (backups) | €3.81 |
| Domain (uhoindexing.com) | ~€1 (amortized) |
| **Total** | **~€18/mo** |

Compared to Railway (~$20-35/mo for equivalent resources, less CPU, shared infra).

### 8.12 Initial Server Setup Checklist

```bash
# 1. Create CAX31 on Hetzner Cloud (Falkenstein DC, Ubuntu 24.04)
# 2. SSH in, harden
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo,docker deploy
# Disable root SSH, password auth in /etc/ssh/sshd_config

# 3. Install Docker
curl -fsSL https://get.docker.com | sh

# 4. Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# 5. Create uho user for sidecar
useradd -r -s /bin/false uho

# 6. Deploy
mkdir -p /opt/uho /opt/uho-sidecar /backups/wal /backups/base
cd /opt/uho
# Copy docker-compose.yml, .env, pg-conf/
docker compose up -d

# 7. DNS
# A record: uhoindexing.com → VPS_IP
# A record: api.uhoindexing.com → VPS_IP
# Caddy auto-provisions TLS on first request
```

---

## 9. Decision Log

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Sidecar hosting | Hetzner CAX31 (co-located) | Railway / separate VPS | Co-location eliminates network hop for NDJSON + Postgres; single box simplifies ops |
| Sidecar ↔ backend | HTTP NDJSON over localhost | Subprocess stdio / cross-network HTTP | Localhost = no TLS overhead, no network hop; HTTP allows independent process lifecycle |
| Thread-safe output | Bounded mpsc channel + drain task | Mutex on stdout | Channel provides backpressure; mutex doesn't |
| Multi-tenant dedup | Separate streams per user | Shared stream + fan-out | Simpler, fewer failure modes; bandwidth is free |
| Batch writes | Multi-row INSERT (200/batch) | Individual inserts | 200x fewer round-trips; ~28h → ~8min for 1M events |
| Checkpointing | Chunk-based (100K slots) | Slot-level | Manageable granularity; slot-level = millions of rows in checkpoint table |
| Integrity check | Post-hoc sampling | Inline verification | Inline would halve throughput; sampling catches systemic issues |
| Connection pooling | Semaphore (4 writers/job) | Unbounded | Prevents pool exhaustion (finding #11) |

---

## 10. Implementation Plan

### Phase 1: Core Backfill (3–5 days)
**No dependencies on later phases.**

1. Sidecar: input validation, bounded channel, drain task, ALT support
2. Sidecar: Axum HTTP server with Bearer auth + `/health`
3. Deploy on Hetzner CAX31 (systemd for sidecar, Docker Compose for backend+dashboard+PG)
4. Backend: HTTP stream consumer (replace subprocess), `BatchWriter` with multi-row INSERT
5. Backend: zombie job recovery on startup, cancellation updates DB status
6. Remove `DEMO_BACKFILL_SLOT_LIMIT`, add decode skip rate tracking

### Phase 2: Reliability & Safety (3–5 days)
**Depends on Phase 1.**

7. Chunk-based checkpointing with resume + overlap buffer
8. Connection pool semaphore + graceful shutdown (both services)
9. Post-backfill integrity verification
10. Memory circuit breaker on sidecar
11. Rate limiting (1 backfill per user per 5 min)

### Phase 3: Scale & Polish (3–5 days)
**Depends on Phase 2.**

12. Prometheus metrics + Grafana dashboard
13. Multi-IDL decoder with slot ranges
14. Per-user job limits + priority queue
15. Incremental backfill (bridge historical → live)
