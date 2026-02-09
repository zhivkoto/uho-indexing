# Uho Platform — Railway Deployment

## Project

| Field | Value |
|-------|-------|
| **Project Name** | uho |
| **Project ID** | `d3cd8842-6218-4dc9-99d8-24b70be261b4` |
| **Environment** | production (`40432f03-c6f7-40ab-b2e8-1ecc4d305309`) |
| **Workspace** | zhivkoto's Projects (`1d8f3374-3ef8-4577-8b3c-4ed1370668aa`) |
| **Plan** | Hobby |

## Services

### Backend (API + Indexer + WebSocket)

| Field | Value |
|-------|-------|
| **Service ID** | `b7ebafbf-1edd-4f4c-a708-86e45f07731e` |
| **URL** | https://backend-production-5223.up.railway.app |
| **Source** | GitHub: `zhivkoto/uho` (main branch) |
| **Dockerfile** | `Dockerfile` (root) |
| **Ports** | 3010 (API), 3012 (WebSocket) |

### Dashboard (Next.js Frontend)

| Field | Value |
|-------|-------|
| **Service ID** | `412189ae-1c24-453a-bb97-47d387e66007` |
| **URL** | https://dashboard-production-185a.up.railway.app |
| **Source** | GitHub: `zhivkoto/uho` (main branch) |
| **Dockerfile** | `dashboard/Dockerfile` (standalone output) |
| **Root Directory** | `dashboard` |
| **Port** | 3000 |

### PostgreSQL

| Field | Value |
|-------|-------|
| **Service ID** | `9bb0e62e-cb9b-4ee7-8f7e-8ccd58873b38` |
| **Image** | `ghcr.io/railwayapp-templates/postgres-ssl:16` |
| **Internal Host** | `postgresql.railway.internal` |
| **Database** | `uho` |
| **User** | `uho` |
| **Volume** | Mounted at `/var/lib/postgresql/data` |

## Environment Variables (Backend)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://${{PostgreSQL.POSTGRES_USER}}:${{PostgreSQL.POSTGRES_PASSWORD}}@${{PostgreSQL.RAILWAY_PRIVATE_DOMAIN}}:5432/${{PostgreSQL.POSTGRES_DB}}` (Railway interpolation) |
| `JWT_SECRET` | `97c8f247...` (64-char hex) |
| `JWT_REFRESH_SECRET` | `8af6c93e...` (64-char hex) |
| `RESEND_API_KEY` | `re_placeholder_replace_me` ⚠️ **NEEDS REAL KEY** |
| `UHO_MODE` | `platform` |
| `NODE_ENV` | `production` |
| `API_PORT` | `3010` |
| `WS_PORT` | `3012` |
| `PORT` | `3010` |
| `BASE_URL` | `https://backend-production-5223.up.railway.app` |
| `DASHBOARD_URL` | `https://dashboard-production-185a.up.railway.app` |
| `CORS_ORIGINS` | `https://dashboard-production-185a.up.railway.app` |
| `HELIUS_API_KEY` | `your-helius-api-key-here` |
| `EMAIL_FROM` | `Uho <noreply@uhoindexing.com>` |
| `EMAIL_DOMAIN` | `uhoindexing.com` |

## Environment Variables (Dashboard)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://backend-production-5223.up.railway.app` |
| `PORT` | `3000` |
| `HOSTNAME` | `0.0.0.0` |

## Domain

- **Purchased:** `uhoindexing.com` (not connected yet — parked for later)

## Action Items

- [ ] Set real `RESEND_API_KEY` for email functionality
- [ ] Connect `uhoindexing.com` custom domain when ready
- [ ] Set up Google/GitHub OAuth credentials if needed
- [ ] Set up Privy credentials if needed
- [ ] Consider adding health checks

## Deployment Notes

- GitHub repo was made **public** to allow Railway access (Railway GitHub App not installed)
- Backend Dockerfile modified to create `/app/.uho` directory with correct permissions
- Dashboard uses Next.js **standalone output** for optimized Docker builds
- Auto-deploy triggers are configured for both services on `main` branch pushes
- Deployed: 2026-02-09
