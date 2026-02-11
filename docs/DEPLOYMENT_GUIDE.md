# Uho — Deployment Guide

> Concrete configs and setup steps for deploying Uho on Hetzner CAX31.
> See [BACKFILL_ARCHITECTURE.md](./BACKFILL_ARCHITECTURE.md) for architecture decisions.

---

## 1. Server Setup

```bash
# Create CAX31 on Hetzner Cloud (Falkenstein DC, Ubuntu 24.04)
# SSH in and harden
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo,docker deploy
# Disable root SSH + password auth in /etc/ssh/sshd_config

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# Create sidecar user
useradd -r -s /bin/false uho

# Create directories
mkdir -p /opt/uho /opt/uho-sidecar /backups/wal /backups/base
```

## 2. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Ports 3000, 3001, 4000, 5432 are localhost-only — not exposed
sudo ufw enable
```

## 3. Docker Compose

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

## 4. PostgreSQL Tuning

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
wal_level = replica
archive_mode = on
archive_command = 'cp %p /backups/wal/%f'

max_connections = 50
log_min_duration_statement = 1000
log_checkpoints = on
```

## 5. Caddy (Reverse Proxy + Auto-TLS)

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

:8080 {
    respond /health 200
}
```

## 6. Sidecar systemd Unit

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

## 7. CI/CD (GitHub Actions)

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
      - name: Build & push backend
        run: |
          echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker build -t ghcr.io/OWNER/uho-backend:${{ github.sha }} -f Dockerfile .
          docker push ghcr.io/OWNER/uho-backend:${{ github.sha }}
      - name: Build & push dashboard
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
            docker compose up -d --no-deps backend
            sleep 5
            curl -sf http://localhost:4000/health || exit 1
            docker compose up -d --no-deps dashboard
            docker image prune -f
```

**Sidecar deploy** (manual or separate workflow):
```bash
cd /opt/uho-sidecar
curl -L -o uho-backfill-new https://github.com/OWNER/uho-sidecar/releases/download/$TAG/uho-backfill-aarch64
chmod +x uho-backfill-new
sudo systemctl stop uho-sidecar
mv uho-backfill-new uho-backfill
sudo systemctl start uho-sidecar
```

## 8. Backups

**Daily base backup** (cron, 03:00 UTC):
```bash
# /etc/cron.d/uho-backup
0 3 * * * uho docker exec uho-postgres-1 pg_basebackup -D /backups/base-$(date +\%Y\%m\%d) -Ft -z -P
```

**WAL archiving:** Continuous via `archive_command` in postgresql.conf.

**Offsite** (Hetzner Storage Box BX11, €3.81/mo):
```bash
# Weekly borg backup
0 4 * * 0 borg create ssh://u123456@u123456.your-storagebox.de:23/./uho::weekly-{now} /backups/
```

**Recovery:** PITR using base backup + WAL replay.

## 9. Monitoring

| What | How | Cost |
|------|-----|------|
| Uptime | UptimeRobot (free, 5-min) | $0 |
| Server metrics | Hetzner Cloud console | $0 |
| App health | Backend `/health` endpoint | $0 |
| Sidecar health | `/health` endpoint | $0 |
| Alerts | UptimeRobot → Telegram | $0 |
| Logs | `docker compose logs -f` + `journalctl -u uho-sidecar` | $0 |
| Postgres | `pg_stat_statements` + slow query log (>1s) | $0 |

## 10. DNS

```
A  uhoindexing.com      → VPS_IP
A  api.uhoindexing.com  → VPS_IP
```

Caddy auto-provisions TLS on first request.
