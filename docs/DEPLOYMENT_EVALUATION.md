# Uho Indexer — Deployment Platform Evaluation

> Evaluated: 2026-02-11  
> Status: Railway being dropped. Need unified deployment for Backend (Node/Fastify), Dashboard (Next.js), PostgreSQL, and Backfill Sidecar (Rust/Jetstreamer).

---

## TL;DR

| Rank | Option | Monthly Cost | Verdict |
|------|--------|-------------|---------|
| **🥇 Primary** | Coolify on Hetzner CAX41 | **~€25–30** | Best balance of cost, DX, and performance |
| **🥈 Runner-up** | Hetzner VPS (all-in-one, Docker Compose) | **~€22–26** | Simpler, but manual deploy pipeline |

---

## Component Resource Requirements

| Component | CPU | RAM | Disk | Network | Notes |
|-----------|-----|-----|------|---------|-------|
| Backend (Fastify) | 1 vCPU | 512MB–1GB | Minimal | Moderate (WS connections) | Long-running, event-driven |
| Dashboard (Next.js) | 0.5 vCPU | 256–512MB | Minimal | Low | SSR, could be static export |
| PostgreSQL | 1–2 vCPU | 2–4GB | 50–200GB SSD | Low | Heavy writes during backfill |
| Backfill Sidecar | 2–4 vCPU | 2–4GB | Temp storage | High (streaming) | Burst workload, CPU-bound |
| **Total** | **4–8 vCPU** | **5–10GB** | **50–200GB** | **20TB/mo+** | |

---

## Option 1: Hetzner VPS All-in-One (CAX41)

**Instance:** CAX41 (ARM64) — 16 vCPU, 32GB RAM, 320GB SSD, 20TB traffic  
**Price:** €15.49/mo

**Setup:** Docker Compose with all four services + nginx reverse proxy.

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐⭐⭐⭐⭐ | €15.49 + ~€5-10 for extra volume = **~€22/mo** |
| Performance | ⭐⭐⭐⭐⭐ | ARM is excellent for Node.js + Rust. 16 vCPU is overkill — plenty of headroom |
| Postgres perf | ⭐⭐⭐⭐⭐ | Local SSD, no network latency, can tune `shared_buffers`, `wal_level`, etc. |
| Ops complexity | ⭐⭐⭐ | Manual: Docker Compose, systemd, backup scripts, monitoring setup |
| Auto-deploy | ⭐⭐ | DIY: GitHub Actions SSH + docker compose pull, or Watchtower |
| SSL/domains | ⭐⭐⭐⭐ | Caddy or Traefik with auto Let's Encrypt |
| Reliability | ⭐⭐⭐⭐ | Single point of failure. Docker restart policies help. No managed backups. |
| Backups | ⭐⭐⭐ | Hetzner snapshots (€0.01/GB/mo) + pg_dump cron to S3/Backblaze |

**Pros:** Unbeatable price-to-performance. Full control. Local Postgres = fastest writes.  
**Cons:** You're the sysadmin. No git-push deploy. Backup/monitoring is on you.

---

## Option 2: Hetzner VPS + Managed Postgres

**Compute:** CAX31 (8 vCPU, 16GB, 160GB) — €10.49/mo  
**Postgres options:**

| Provider | Plan | Price | Latency from Hetzner | Notes |
|----------|------|-------|---------------------|-------|
| Supabase Pro | 8GB, dedicated | $25/mo | ~20-50ms (US/EU) | Good DX, but backfill writes may hit connection limits |
| Neon Scale | Autoscaling | $19/mo + compute | Variable | Branching is nice, but cold starts hurt WS connections |
| Hetzner Managed DB | (not available as of 2025) | — | — | Hetzner doesn't offer managed Postgres |

**Total: ~€35-45/mo**

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐⭐⭐ | 2x the all-in-one option for less Postgres performance |
| Performance | ⭐⭐⭐ | Network latency to managed DB hurts backfill writes significantly |
| Postgres perf | ⭐⭐ | **Dealbreaker risk.** Heavy backfill writes over network = slow. Connection pooling limits. |
| Ops complexity | ⭐⭐⭐⭐ | Postgres is managed (backups, upgrades) |
| Reliability | ⭐⭐⭐⭐ | Managed DB has better backup story |

**Verdict:** ❌ **Not recommended for Uho.** The backfill sidecar does massive bulk inserts. Network latency to external Postgres would bottleneck the entire pipeline. Only makes sense if you can tolerate 2-5x slower backfills.

---

## Option 3: Fly.io

**Machines:**
- Backend: `shared-cpu-2x` (2 vCPU, 1GB) — ~$15/mo
- Dashboard: `shared-cpu-1x` (1 vCPU, 256MB) — ~$7/mo  
- Postgres: Fly Postgres (not truly managed, it's a Fly app) `dedicated-cpu-1x` 4GB — ~$62/mo
- Sidecar: `performance-4x` (4 vCPU, 8GB) — ~$124/mo
- Volumes: 100GB — ~$15/mo

**Total: ~$220/mo** (😬)

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐⭐ | Expensive for what you get. Compute pricing adds up fast. |
| Performance | ⭐⭐⭐ | Decent, but shared CPUs are noisy neighbors |
| Postgres perf | ⭐⭐⭐ | Fly Postgres is just a container with a volume. You still manage it. |
| Ops complexity | ⭐⭐⭐⭐ | `fly deploy` is nice. `fly.toml` per service. |
| Auto-deploy | ⭐⭐⭐⭐⭐ | GitHub Actions with `flyctl deploy` — well documented |
| SSL/domains | ⭐⭐⭐⭐⭐ | Automatic. `fly certs add` and done. |
| Reliability | ⭐⭐⭐ | Fly has had outages. Postgres on Fly is "bring your own backups." |

**Verdict:** ❌ **Too expensive.** You're paying 8-10x what Hetzner costs for comparable resources. The DX is good but doesn't justify the cost for a bootstrapping project.

---

## Option 4: DigitalOcean App Platform + Managed Postgres

**Services:**
- Backend: Basic plan (1 vCPU, 1GB) — $12/mo
- Dashboard: Static site or Basic — $5-12/mo
- Managed Postgres: Basic (1 vCPU, 2GB, 25GB) — $25/mo; Production (2 vCPU, 4GB) — $60/mo
- Sidecar: Not a great fit for App Platform. Would need a separate Droplet ($24-48/mo).

**Total: ~$100-130/mo**

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐⭐⭐ | Mid-range. Managed DB drives the cost up. |
| Postgres perf | ⭐⭐⭐ | Managed, same datacenter, decent write perf. Connection pooling included. |
| Ops complexity | ⭐⭐⭐⭐ | App Platform handles deploys, SSL, scaling |
| Auto-deploy | ⭐⭐⭐⭐⭐ | Native GitHub integration |
| Sidecar fit | ⭐⭐ | Sidecar doesn't fit App Platform well — needs separate Droplet |

**Verdict:** ⚠️ Decent but awkward. The sidecar needs to run on a separate Droplet, splitting your infra. Cost is moderate but 4-5x Hetzner.

---

## Option 5: AWS (ECS/Fargate + RDS)

**Services:**
- ECS Fargate: Backend (0.5 vCPU, 1GB) ~$18/mo + Dashboard ~$12/mo + Sidecar (4 vCPU, 8GB) ~$140/mo
- RDS PostgreSQL: db.t4g.medium (2 vCPU, 4GB) — ~$55/mo + storage
- NAT Gateway: ~$32/mo (the hidden AWS tax)
- ALB: ~$22/mo

**Total: ~$280-350/mo**

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐ | Absurdly expensive for this stage. NAT Gateway alone costs more than a Hetzner VPS. |
| Performance | ⭐⭐⭐⭐ | Solid, tunable, autoscaling |
| Ops complexity | ⭐⭐ | Terraform/CDK, IAM, VPC, security groups — massive overhead |
| Reliability | ⭐⭐⭐⭐⭐ | Best-in-class |

**Verdict:** ❌ **Overkill.** Save this for when you have revenue and need multi-region. Right now it's burning money on infrastructure tax.

---

## Option 6: Coolify on Hetzner ⭐ RECOMMENDED

**Instance:** CAX41 (16 vCPU, 32GB RAM, 320GB SSD) — €15.49/mo  
**Coolify:** Self-hosted, free (open source). Install on the VPS.

**What Coolify gives you:**
- **Git-push auto-deploy** from GitHub (webhook-based, like Railway/Vercel)
- **Docker-based** — each service is a container, managed via Coolify UI
- **SSL auto-provisioned** via Let's Encrypt (Traefik under the hood)
- **Postgres as a managed service** within Coolify (one-click deploy, with scheduled backups)
- **Environment variables UI** — no more SSH to update `.env`
- **Monitoring dashboard** — basic CPU/RAM/disk
- **Wildcard domains** — `*.uhoindexing.com` easy
- **Build packs** — Dockerfile, Nixpacks (like Railway), Docker Compose
- **Webhooks, health checks, rollbacks**

**Setup:**
```
1. Provision CAX41 on Hetzner (Falkenstein or Nuremberg DC)
2. Install Coolify: curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
3. Point DNS: uhoindexing.com → VPS IP
4. Add services via Coolify UI:
   - Backend: GitHub repo, Dockerfile, port 3000
   - Dashboard: GitHub repo, Nixpacks/Dockerfile, port 3001
   - PostgreSQL: One-click from Coolify service library
   - Sidecar: GitHub repo, Dockerfile (manual trigger or webhook)
5. Configure auto-deploy webhooks for Backend + Dashboard
6. Set up Postgres backup schedule to S3-compatible storage (Backblaze B2: ~$0.50/mo)
```

**Total: ~€25-30/mo** (VPS €15.49 + extra volume €5 + Backblaze backups ~€1 + domain)

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐⭐⭐⭐⭐ | €25-30/mo for everything. Can't beat it. |
| Performance | ⭐⭐⭐⭐⭐ | Same as all-in-one — local Postgres, 16 vCPU ARM |
| Postgres perf | ⭐⭐⭐⭐⭐ | Local, tuneable, no connection limits, no network hop |
| Ops complexity | ⭐⭐⭐⭐ | Coolify handles 80% of Railway's DX. You still own the server. |
| Auto-deploy | ⭐⭐⭐⭐⭐ | GitHub webhook → auto build → deploy. Per-branch previews available. |
| SSL/domains | ⭐⭐⭐⭐⭐ | Automatic via Traefik + Let's Encrypt |
| Reliability | ⭐⭐⭐⭐ | Single server, but Docker auto-restart + Coolify health checks |
| Backups | ⭐⭐⭐⭐ | Coolify has built-in scheduled DB backups to S3 |

**Pros:**
- Railway-like DX at Hetzner prices
- All components co-located = best latency for Postgres writes
- Full control when you need it (SSH in, tune Postgres, check logs)
- Coolify is actively maintained, good community
- Sidecar can run alongside without any platform constraints

**Cons:**
- Single server = single point of failure (mitigate: Hetzner snapshots, off-site DB backups)
- Coolify itself has occasional bugs (it's open source, moving fast)
- You own server maintenance (OS updates, disk monitoring)
- If the VPS dies, recovery takes ~30 min (restore snapshot + re-deploy)

---

## Option 7: Hetzner Bare Metal Dedicated

**Server:** AX42 (AMD Ryzen 7, 8C/16T, 64GB DDR5, 2×1TB NVMe) — ~€52/mo  
**Or:** AX52 (Ryzen 9, 12C/24T, 128GB DDR5) — ~€82/mo

| Criteria | Rating | Notes |
|----------|--------|-------|
| Cost | ⭐⭐⭐⭐ | €52-82/mo — great for what you get |
| Performance | ⭐⭐⭐⭐⭐+ | Dedicated cores, NVMe RAID, no noisy neighbors. Backfill would fly. |
| Ops complexity | ⭐⭐⭐ | Same as VPS but you also manage RAID, hardware alerts |
| Provisioning | ⭐⭐ | Takes hours to days to provision (not instant like VPS) |

**Verdict:** ⚠️ **Future upgrade path.** Overkill now, but if backfill workloads grow or you need to index multiple programs simultaneously, the AX42 at €52/mo is incredible value. Revisit when the sidecar is production-ready and you need sustained throughput.

---

## Final Recommendation

### 🥇 Primary: Coolify on Hetzner CAX41 (~€25-30/mo)

**Why:**
1. **Cost:** 5-10x cheaper than any managed platform for equivalent resources
2. **Postgres writes:** Local Postgres on NVMe SSD — no network hop means backfill inserts are as fast as possible
3. **DX:** Coolify gives you git-push deploy, SSL, env management, logs — 80% of Railway's value
4. **Unified:** All four components on one server, one bill, one place to debug
5. **16 vCPU ARM + 32GB RAM** is more than enough headroom for all components simultaneously
6. **Escape hatch:** Everything runs in Docker. If you outgrow it, containers move to any platform.

### 🥈 Runner-up: Hetzner VPS with Docker Compose (~€22/mo)

**Why runner-up instead of primary:**
Same infrastructure, just without Coolify's UI/auto-deploy layer. Choose this if:
- You prefer full control and don't mind writing GitHub Actions for deploys
- You don't want another layer of abstraction
- You're comfortable with `docker compose` + Caddy/Traefik manually

### Migration Path from Railway

```
Week 1: Provision CAX41, install Coolify, set up DNS
Week 1: Deploy Postgres, restore data from Railway pg_dump
Week 1: Deploy Dashboard + Backend, verify functionality
Week 2: Deploy sidecar, test backfill against local Postgres
Week 2: Cut over DNS, decommission Railway
Week 2: Set up backups (Coolify → Backblaze B2) and monitoring (Uptime Kuma)
```

### Scaling Strategy

| Trigger | Action |
|---------|--------|
| CPU consistently >70% | Upgrade to CAX51 (€28.49/mo) or move sidecar to separate VPS |
| Disk >250GB | Add Hetzner volume (€0.052/GB/mo) |
| Need HA/redundancy | Add second VPS, Postgres streaming replication |
| Revenue justifies it | Migrate to AX42 dedicated (€52/mo) for massive headroom |
| Multi-region needed | Then consider Fly.io or AWS |
