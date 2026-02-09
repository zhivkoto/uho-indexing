# Uho Platform — Architecture Document

> **Version:** 1.0  
> **Date:** 2026-02-05  
> **Status:** Approved for implementation  
> **Scope:** All P0 + P1 + P2-1 (custom views) + P2-2 (WebSocket subscriptions) + P2-4 (webhooks)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Schema](#2-database-schema)
3. [API Design](#3-api-design)
4. [Backend File Structure](#4-backend-file-structure)
5. [Frontend File Structure](#5-frontend-file-structure)
6. [Auth System Design](#6-auth-system-design)
7. [Indexer Orchestration](#7-indexer-orchestration)
8. [WebSocket Subscription Design](#8-websocket-subscription-design)
9. [Webhook Design](#9-webhook-design)
10. [Implementation Order](#10-implementation-order)

---

## 1. System Architecture

### 1.1 Service Diagram

```
                          ┌─────────────────────────────────────────────────┐
                          │               CLIENTS                          │
                          │  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
                          │  │ Dashboard │  │ REST API │  │  WebSocket   │ │
                          │  │ (Next.js) │  │  Client  │  │   Client     │ │
                          │  └─────┬─────┘  └────┬─────┘  └──────┬──────┘ │
                          └────────┼──────────────┼───────────────┼────────┘
                                   │              │               │
                             JWT   │     API Key  │     JWT/Key   │
                                   ▼              ▼               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           API SERVICE (port 3010)                            │
│                                                                              │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Auth    │  │  Program     │  │  Data        │  │  Webhook / View     │  │
│  │  Routes  │  │  Routes      │  │  Routes      │  │  Routes             │  │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └─────────┬───────────┘  │
│       │               │                │                     │              │
│       ▼               ▼                ▼                     ▼              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                   Auth Middleware (JWT / API Key)                     │   │
│  │                   Schema Middleware (SET search_path)                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            POSTGRESQL                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  public schema                                                       │     │
│  │  ┌───────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌─────────┐ │     │
│  │  │ users │ │ api_keys │ │ user_programs│ │ webhooks │ │ usage   │ │     │
│  │  └───────┘ └──────────┘ └──────────────┘ └──────────┘ │ metrics │ │     │
│  │  ┌────────────────┐ ┌───────────────────┐ ┌──────────┐└─────────┘ │     │
│  │  │refresh_tokens  │ │user_program_events│ │user_views│            │     │
│  │  └────────────────┘ └───────────────────┘ └──────────┘            │     │
│  │  ┌──────────────────────┐ ┌───────────────────────────┐           │     │
│  │  │email_verifications   │ │ active_program_subscriptions│          │     │
│  │  └──────────────────────┘ └───────────────────────────┘           │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │  u_a1b2c3d4 (User A)   │  │  u_e5f6g7h8 (User B)   │   ...             │
│  │  ┌──────────────────┐   │  │  ┌──────────────────┐   │                   │
│  │  │ dex__swap_event  │   │  │  │ amm__swap_event  │   │                   │
│  │  │ dex__transfer_ev │   │  │  │ _uho_state       │   │                   │
│  │  │ _uho_state       │   │  │  └──────────────────┘   │                   │
│  │  └──────────────────┘   │  └─────────────────────────┘                   │
│  └─────────────────────────┘                                                │
│                                                                              │
│  PG NOTIFY channels:                                                         │
│    uho_events → new indexed events                                           │
│    uho_program_changes → program added/removed/paused                        │
└──────────────────────┬──────────────────────────┬────────────────────────────┘
                       │                          │
           ┌───────────┘                          └──────────────┐
           ▼                                                     ▼
┌──────────────────────────────┐        ┌──────────────────────────────────────┐
│   INDEXER SERVICE            │        │   WEBSOCKET SERVICE (port 3012)      │
│                              │        │                                      │
│  ┌────────────────────────┐  │        │  ┌───────────────────────────────┐   │
│  │  Program Registry      │  │        │  │  PG LISTEN (uho_events)       │   │
│  │  (polls active_program │  │        │  └───────────────┬───────────────┘   │
│  │   _subscriptions)      │  │        │                  │                   │
│  └───────────┬────────────┘  │        │                  ▼                   │
│              │               │        │  ┌───────────────────────────────┐   │
│              ▼               │        │  │  Subscription Manager          │   │
│  ┌────────────────────────┐  │        │  │  (match filters, fan out)     │   │
│  │  Round-Robin Poller    │  │        │  └───────────────┬───────────────┘   │
│  │                        │  │        │                  │                   │
│  │  Program A → poll      │  │        │      ┌───────────┼───────────┐      │
│  │  Program B → poll      │  │        │      ▼           ▼           ▼      │
│  │  Program C → poll      │  │        │  ┌────────┐  ┌────────┐  ┌────────┐│
│  │  ... repeat            │  │        │  │ WS     │  │ WS     │  │ WS     ││
│  └───────────┬────────────┘  │        │  │Client 1│  │Client 2│  │Client 3││
│              │               │        │  └────────┘  └────────┘  └────────┘│
│              ▼               │        │                                      │
│  ┌────────────────────────┐  │        │  Webhook Dispatcher:                 │
│  │  Fan-Out Writer        │  │        │  ┌───────────────────────────────┐   │
│  │  (write to each user   │  │        │  │  PG LISTEN → match webhooks   │   │
│  │   schema that wants    │  │        │  │  → HTTP POST with retry       │   │
│  │   this program)        │  │        │  └───────────────────────────────┘   │
│  └───────────┬────────────┘  │        └──────────────────────────────────────┘
│              │               │
│              ▼               │
│  PG NOTIFY('uho_events',    │
│    JSON payload)             │
└──────────────────────────────┘
```

### 1.2 Service Communication

| From | To | Mechanism | Purpose |
|------|----|-----------|---------|
| API Service | PostgreSQL | SQL (shared pool) | CRUD operations, queries |
| Indexer Service | PostgreSQL | SQL (dedicated pool) | Write events, update state |
| Indexer Service | WebSocket Service | `pg_notify('uho_events', ...)` | Real-time event fanout |
| API Service | Indexer Service | `pg_notify('uho_program_changes', ...)` | Signal program add/remove/pause |
| Indexer Service | PostgreSQL | Poll `active_program_subscriptions` view | Discover which programs to index |
| WebSocket Service | PostgreSQL | `LISTEN uho_events` | Receive new events for streaming |
| WebSocket Service | PostgreSQL | SQL (read-only pool) | Validate auth, load subscriptions |

### 1.3 Process Model

Each service is a separate Node.js process, started via distinct entry points:

```bash
# Start all services (dev/single-machine)
uho platform start                    # starts all 3 services

# Start individual services (production)
uho platform start --service api      # API on port 3010
uho platform start --service indexer  # Indexer (no port, background)
uho platform start --service ws       # WebSocket on port 3012

# Legacy CLI mode (unchanged)
uho start                             # single-user mode, no auth
```

**Environment variable** `UHO_MODE=platform` activates multi-tenant mode. Without it, the existing CLI behavior is preserved exactly as-is.

**Shared configuration** for platform mode uses environment variables (not `uho.yaml`):

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/uho
JWT_SECRET=<random-64-char-hex>
JWT_REFRESH_SECRET=<random-64-char-hex>
RESEND_API_KEY=re_xxxx

# Optional
HELIUS_API_KEY=xxxx
API_PORT=3010
WS_PORT=3012
CORS_ORIGINS=http://localhost:3000,https://app.uho.dev
NODE_ENV=production
```

### 1.4 Shared Components

These modules are used by multiple services and remain in `src/core/`:

| Module | Used By | Purpose |
|--------|---------|---------|
| `db.ts` | All | Connection pool factory |
| `types.ts` | All | Shared type definitions |
| `idl-parser.ts` | Indexer, API | Parse IDL JSON |
| `schema-generator.ts` | Indexer, API | Generate DDL from parsed IDL |
| `config.ts` | CLI mode only | YAML config loader (unchanged) |
| `platform-config.ts` | All (platform) | Env-based config for platform mode |

---

## 2. Database Schema

### 2.1 Platform Tables (public schema)

All platform tables live in the `public` schema. User event data lives in per-user schemas.

```sql
-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    verified        BOOLEAN DEFAULT false,
    schema_name     TEXT UNIQUE NOT NULL,    -- e.g., 'u_a1b2c3d4'
    display_name    TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_schema ON users(schema_name);

-- ============================================================================
-- REFRESH TOKENS
-- ============================================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash) WHERE NOT revoked;

-- ============================================================================
-- EMAIL VERIFICATIONS
-- ============================================================================
CREATE TABLE email_verifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);

-- ============================================================================
-- PASSWORD RESET TOKENS
-- ============================================================================
CREATE TABLE password_resets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_password_resets_hash ON password_resets(token_hash) WHERE NOT used;

-- ============================================================================
-- API KEYS
-- ============================================================================
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,
    key_prefix  TEXT NOT NULL,              -- 'uho_sk_...last4' for display
    label       TEXT DEFAULT '',
    last_used   TIMESTAMPTZ,
    revoked     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE NOT revoked;

-- ============================================================================
-- USER PROGRAMS
-- ============================================================================
CREATE TABLE user_programs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id  TEXT NOT NULL,                              -- Solana program ID (base58)
    name        TEXT NOT NULL,                              -- User-given or IDL-derived name
    idl         JSONB NOT NULL,                             -- Full IDL stored
    chain       TEXT NOT NULL DEFAULT 'solana-mainnet',
    status      TEXT NOT NULL DEFAULT 'provisioning'
                    CHECK (status IN ('provisioning', 'running', 'paused', 'error', 'archived')),
    config      JSONB DEFAULT '{}'::jsonb,                  -- poll interval, batch size, start slot
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, program_id)
);

CREATE INDEX idx_user_programs_user ON user_programs(user_id);
CREATE INDEX idx_user_programs_program ON user_programs(program_id);
CREATE INDEX idx_user_programs_status ON user_programs(status);

-- ============================================================================
-- USER PROGRAM EVENTS (which events/instructions a user has enabled)
-- ============================================================================
CREATE TABLE user_program_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_program_id     UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
    event_name          TEXT NOT NULL,
    event_type          TEXT NOT NULL DEFAULT 'event'
                            CHECK (event_type IN ('event', 'instruction')),
    enabled             BOOLEAN DEFAULT true,
    field_config        JSONB DEFAULT '{}'::jsonb,          -- P1: field selection/exclusion
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_program_id, event_name, event_type)
);

CREATE INDEX idx_user_program_events_program ON user_program_events(user_program_id);

-- ============================================================================
-- USER VIEWS (P2-1: custom aggregation views)
-- ============================================================================
CREATE TABLE user_views (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_program_id     UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    definition          JSONB NOT NULL,                     -- Declarative view definition
    materialized        BOOLEAN DEFAULT false,
    refresh_interval_ms INTEGER DEFAULT 60000,
    last_refreshed      TIMESTAMPTZ,
    status              TEXT DEFAULT 'pending'
                            CHECK (status IN ('pending', 'active', 'error', 'disabled')),
    error               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

CREATE INDEX idx_user_views_user ON user_views(user_id);
CREATE INDEX idx_user_views_program ON user_views(user_program_id);

-- ============================================================================
-- WEBHOOKS (P2-4)
-- ============================================================================
CREATE TABLE webhooks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_program_id     UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
    url                 TEXT NOT NULL,
    secret              TEXT NOT NULL,                      -- HMAC signing secret (stored encrypted)
    events              TEXT[] NOT NULL DEFAULT '{}',       -- event names to match, empty = all
    filters             JSONB DEFAULT '{}'::jsonb,          -- field-level filters
    active              BOOLEAN DEFAULT true,
    last_triggered      TIMESTAMPTZ,
    failure_count       INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhooks_user ON webhooks(user_id);
CREATE INDEX idx_webhooks_program ON webhooks(user_program_id);
CREATE INDEX idx_webhooks_active ON webhooks(active) WHERE active = true;

-- ============================================================================
-- WEBHOOK DELIVERY LOG
-- ============================================================================
CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    response_status INTEGER,
    response_body   TEXT,
    attempt         INTEGER NOT NULL DEFAULT 1,
    success         BOOLEAN DEFAULT false,
    delivered_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_time ON webhook_deliveries(delivered_at);

-- ============================================================================
-- USAGE METRICS
-- ============================================================================
CREATE TABLE usage_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_type     TEXT NOT NULL
                        CHECK (metric_type IN ('api_call', 'event_indexed', 'ws_message', 'webhook_delivery')),
    count           BIGINT NOT NULL DEFAULT 0,
    period_start    TIMESTAMPTZ NOT NULL,                  -- truncated to hour
    period_end      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_usage_metrics_user ON usage_metrics(user_id);
CREATE INDEX idx_usage_metrics_type ON usage_metrics(user_id, metric_type, period_start);
CREATE UNIQUE INDEX uq_usage_metrics ON usage_metrics(user_id, metric_type, period_start);

-- ============================================================================
-- ACTIVE PROGRAM SUBSCRIPTIONS (view for indexer)
-- This aggregated view tells the indexer which program IDs are wanted by
-- at least one user and which user schemas need the data.
-- ============================================================================
CREATE MATERIALIZED VIEW active_program_subscriptions AS
SELECT
    up.program_id,
    up.chain,
    jsonb_agg(jsonb_build_object(
        'user_id', up.user_id,
        'user_program_id', up.id,
        'schema_name', u.schema_name,
        'program_name', up.name,
        'idl', up.idl,
        'config', up.config,
        'enabled_events', (
            SELECT jsonb_agg(jsonb_build_object(
                'event_name', upe.event_name,
                'event_type', upe.event_type,
                'field_config', upe.field_config
            ))
            FROM user_program_events upe
            WHERE upe.user_program_id = up.id AND upe.enabled = true
        )
    )) AS subscribers
FROM user_programs up
JOIN users u ON u.id = up.user_id
WHERE up.status IN ('running', 'provisioning')
GROUP BY up.program_id, up.chain;

CREATE UNIQUE INDEX idx_aps_program ON active_program_subscriptions(program_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_active_subscriptions()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_program_subscriptions;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NOTIFY TRIGGER: fires when events are written to any user schema
-- (Called from the indexer after fan-out writes)
-- ============================================================================
-- Note: PG NOTIFY is called programmatically from the indexer service,
-- not via a trigger, because event tables live in user schemas and we
-- want a single notification per batch, not per row.

-- ============================================================================
-- NOTIFY TRIGGER: fires when user_programs changes
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_program_change()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('uho_program_changes', json_build_object(
        'action', TG_OP,
        'program_id', COALESCE(NEW.program_id, OLD.program_id),
        'user_id', COALESCE(NEW.user_id, OLD.user_id),
        'status', COALESCE(NEW.status, OLD.status)
    )::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_programs_change
    AFTER INSERT OR UPDATE OR DELETE ON user_programs
    FOR EACH ROW EXECUTE FUNCTION notify_program_change();
```

### 2.2 Schema-Per-User Design

When a user registers, a PostgreSQL schema is created using the first 8 characters of their UUID (collision-checked):

```sql
-- Generated schema name: u_{first_8_chars_of_uuid}
-- Example: user id = a1b2c3d4-e5f6-7890-... → schema = u_a1b2c3d4

CREATE SCHEMA u_a1b2c3d4;
```

**Schema naming algorithm:**

```typescript
function generateSchemaName(userId: string): string {
    // Take first 8 hex chars from UUID (remove dashes)
    const prefix = userId.replace(/-/g, '').slice(0, 8);
    return `u_${prefix}`;
}
```

Collision is checked at registration time; if the 8-char prefix collides (vanishingly rare), extend to 12 chars.

**Tables created inside each user schema** (identical structure to current tables, just namespaced):

```sql
-- When user adds program "sample_dex", these are created in u_a1b2c3d4:
SET search_path TO u_a1b2c3d4;

-- _uho_state — per-program indexer state (same as existing)
CREATE TABLE _uho_state (
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

-- Event tables (generated from IDL, same as current)
-- e.g., sample_dex_swap_event, sample_dex_transfer_event
-- Structure identical to what generateEventTable() produces today

-- Custom view tables (P2-1, created on demand)
-- e.g., v_active_traders (materialized view)
```

### 2.3 Migration Strategy from Current Single-User Schema

The current single-user schema has all tables in the `public` schema. Migration path:

1. **Platform tables** are created in `public` alongside existing tables — no conflict (different names).
2. **Existing data** (if any) can be migrated to a "default" user schema:
   ```sql
   -- Create a migration user
   INSERT INTO users (id, email, password_hash, verified, schema_name)
   VALUES ('00000000-0000-0000-0000-000000000000', 'admin@local', '<hash>', true, 'u_00000000');

   CREATE SCHEMA u_00000000;

   -- Move existing tables
   ALTER TABLE sample_dex_swap_event SET SCHEMA u_00000000;
   ALTER TABLE _uho_state SET SCHEMA u_00000000;
   -- ... for each existing table
   ```
3. **CLI mode** continues to use the `public` schema directly (no migration needed). `UHO_MODE=platform` activates the schema-per-user behavior.

**Migration tool:** Use `node-pg-migrate` for platform schema migrations. Migration files stored in `src/migrations/`.

### 2.4 Migration Files

Create migrations in numbered order:

```
src/migrations/
├── 001_create_users.sql
├── 002_create_refresh_tokens.sql
├── 003_create_email_verifications.sql
├── 004_create_password_resets.sql
├── 005_create_api_keys.sql
├── 006_create_user_programs.sql
├── 007_create_user_program_events.sql
├── 008_create_user_views.sql
├── 009_create_webhooks.sql
├── 010_create_webhook_deliveries.sql
├── 011_create_usage_metrics.sql
├── 012_create_active_subscriptions_view.sql
└── 013_create_triggers.sql
```

Run via: `uho platform migrate`

---

## 3. API Design

### 3.1 Base Configuration

- **Base URL:** `http://localhost:3010/api/v1` (dev) / `https://api.uho.dev/api/v1` (prod)
- **Content-Type:** `application/json` for all requests and responses
- **Auth:** See [Section 6](#6-auth-system-design) for full auth flow

### 3.2 Standard Error Response

All errors follow this shape:

```typescript
interface ErrorResponse {
    error: {
        code: string;      // Machine-readable: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, INTERNAL_ERROR
        message: string;   // Human-readable description
        details?: Record<string, unknown>;  // Optional field-level validation errors
    };
}
```

### 3.3 Auth Endpoints

#### `POST /api/v1/auth/register`

Creates a new user account and sends a verification email.

**Auth:** None

```typescript
// Request
{
    email: string;          // valid email format
    password: string;       // min 8 chars, at least 1 letter + 1 number
}

// Response 201
{
    message: "Verification email sent",
    userId: string           // UUID
}

// Errors: 422 VALIDATION_ERROR (bad email/password), 409 CONFLICT (email exists)
```

**Side effects:**
- Creates `users` row with `verified: false`
- Creates user schema (`CREATE SCHEMA u_XXXXXXXX`)
- Generates 6-digit code, stores in `email_verifications`
- Sends email via Resend with code (expires in 1 hour)

#### `POST /api/v1/auth/verify`

Verifies email with the 6-digit code.

**Auth:** None

```typescript
// Request
{
    email: string;
    code: string;           // 6-digit code from email
}

// Response 200
{
    accessToken: string;    // JWT, 15min expiry
    refreshToken: string;   // opaque, 30-day expiry (also set as httpOnly cookie)
    user: {
        id: string;
        email: string;
        verified: boolean;
        createdAt: string;
    }
}

// Errors: 400 (invalid/expired code), 404 (email not found)
```

#### `POST /api/v1/auth/login`

Authenticates with email + password.

**Auth:** None

```typescript
// Request
{
    email: string;
    password: string;
}

// Response 200
{
    accessToken: string;
    refreshToken: string;   // also set as httpOnly cookie
    user: {
        id: string;
        email: string;
        verified: boolean;
        createdAt: string;
    }
}

// Errors: 401 UNAUTHORIZED (invalid credentials — generic message, no email enumeration)
```

**Rate limit:** 5 attempts per minute per IP.

#### `POST /api/v1/auth/refresh`

Rotates tokens. Accepts refresh token from cookie or body.

**Auth:** Refresh token (httpOnly cookie `uho_refresh` or body `refreshToken`)

```typescript
// Request (body is optional if cookie is set)
{
    refreshToken?: string;
}

// Response 200
{
    accessToken: string;
    refreshToken: string;   // new token (old one revoked)
}

// Errors: 401 UNAUTHORIZED (invalid/expired/revoked refresh token)
```

#### `POST /api/v1/auth/logout`

Revokes the current refresh token.

**Auth:** Bearer JWT

```typescript
// Request: empty body (refresh token from cookie)

// Response 200
{
    message: "Logged out"
}
```

#### `POST /api/v1/auth/forgot-password`

Sends a password reset email.

**Auth:** None

```typescript
// Request
{
    email: string;
}

// Response 200 (always — no email enumeration)
{
    message: "If the email exists, a reset link has been sent"
}
```

#### `POST /api/v1/auth/reset-password`

Resets password using the token from the email.

**Auth:** None

```typescript
// Request
{
    token: string;          // from email link
    password: string;       // new password
}

// Response 200
{
    message: "Password reset successfully"
}

// Errors: 400 (invalid/expired token), 422 (weak password)
```

### 3.4 User Endpoints

#### `GET /api/v1/user/me`

Returns the authenticated user's profile.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    id: string;
    email: string;
    displayName: string | null;
    verified: boolean;
    createdAt: string;
    usage: {
        programs: number;           // count of active programs
        programLimit: number;       // tier limit (1 for free)
        eventsIndexed: number;      // current period
        eventLimit: number;         // 1000 for free
        apiCalls: number;           // current period
        apiCallLimit: number;       // 50000 for free
    }
}
```

#### `PATCH /api/v1/user/me`

Updates user profile.

**Auth:** Bearer JWT only (not API key)

```typescript
// Request
{
    displayName?: string;
    currentPassword?: string;       // required if changing password
    newPassword?: string;
}

// Response 200
{
    id: string;
    email: string;
    displayName: string | null;
    updatedAt: string;
}
```

#### `GET /api/v1/user/api-keys`

Lists user's API keys (masked).

**Auth:** Bearer JWT only

```typescript
// Response 200
{
    data: Array<{
        id: string;
        keyPrefix: string;          // "uho_sk_...a1b2"
        label: string;
        lastUsed: string | null;
        createdAt: string;
    }>
}
```

#### `POST /api/v1/user/api-keys`

Generates a new API key. The full key is returned **only once**.

**Auth:** Bearer JWT only

```typescript
// Request
{
    label?: string;                 // "Production Backend"
}

// Response 201
{
    id: string;
    key: string;                    // "uho_sk_a1b2c3d4..." — ONLY shown once
    keyPrefix: string;              // "uho_sk_...a1b2"
    label: string;
    createdAt: string;
}
```

#### `DELETE /api/v1/user/api-keys/:id`

Revokes an API key. Takes effect immediately.

**Auth:** Bearer JWT only

```typescript
// Response 200
{
    message: "API key revoked"
}

// Errors: 404 (key not found or not owned by user)
```

### 3.5 Program Endpoints

#### `GET /api/v1/programs`

Lists user's configured programs.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    data: Array<{
        id: string;                 // user_programs.id (UUID)
        programId: string;          // Solana program ID
        name: string;
        chain: string;
        status: 'provisioning' | 'running' | 'paused' | 'error' | 'archived';
        events: Array<{
            name: string;
            type: 'event' | 'instruction';
            enabled: boolean;
            count: number;
        }>;
        config: object;
        createdAt: string;
        updatedAt: string;
    }>
}
```

#### `POST /api/v1/programs`

Adds a new program to index.

**Auth:** Bearer JWT only

```typescript
// Request
{
    programId: string;              // Solana program ID (base58)
    name?: string;                  // display name, defaults to IDL metadata.name
    idl: object;                    // Full Anchor IDL JSON
    chain?: string;                 // default 'solana-mainnet'
    events?: Array<{                // which events to enable (default: all)
        name: string;
        type: 'event' | 'instruction';
        enabled: boolean;
    }>;
    config?: {
        pollIntervalMs?: number;    // default 2000
        batchSize?: number;         // default 25
        startSlot?: number;         // default: current slot
    };
}

// Response 201
{
    id: string;
    programId: string;
    name: string;
    status: 'provisioning';
    events: Array<{ name: string; type: string; enabled: boolean }>;
    createdAt: string;
}

// Errors:
//   422 VALIDATION_ERROR (invalid program ID, bad IDL)
//   409 CONFLICT (user already indexes this program)
//   403 FORBIDDEN (program limit reached)
```

**Side effects:**
1. Validates IDL (parse with `parseIDL()`)
2. Creates `user_programs` row
3. Creates `user_program_events` rows
4. Generates DDL and applies to user's schema (`CREATE TABLE` in `u_XXXXXXXX`)
5. Creates `_uho_state` entry in user schema
6. `pg_notify('uho_program_changes', ...)` → indexer picks it up
7. Refreshes `active_program_subscriptions` materialized view

#### `GET /api/v1/programs/:id`

Gets detailed program info.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    id: string;
    programId: string;
    name: string;
    chain: string;
    status: string;
    idl: object;                    // full IDL
    events: Array<{
        name: string;
        type: 'event' | 'instruction';
        enabled: boolean;
        count: number;
        fieldConfig: object;
    }>;
    config: object;
    state: {                        // from _uho_state in user schema
        lastSlot: number;
        eventsIndexed: number;
        lastPollAt: string | null;
        error: string | null;
    };
    createdAt: string;
    updatedAt: string;
}
```

#### `PATCH /api/v1/programs/:id`

Updates program configuration.

**Auth:** Bearer JWT only

```typescript
// Request
{
    name?: string;
    events?: Array<{
        name: string;
        type: 'event' | 'instruction';
        enabled: boolean;
        fieldConfig?: object;       // P1: field selection
    }>;
    config?: {
        pollIntervalMs?: number;
        batchSize?: number;
    };
}

// Response 200
{
    id: string;
    name: string;
    events: Array<{ name: string; type: string; enabled: boolean }>;
    config: object;
    updatedAt: string;
}
```

#### `DELETE /api/v1/programs/:id`

Archives a program (data retained but hidden, indexing stops).

**Auth:** Bearer JWT only

```typescript
// Response 200
{
    message: "Program archived"
}
```

**Side effects:**
1. Sets `user_programs.status = 'archived'`
2. `pg_notify('uho_program_changes', ...)` → indexer stops polling for this user
3. Refreshes `active_program_subscriptions`
4. Tables in user schema are NOT dropped (data retained)

#### `POST /api/v1/programs/:id/pause`

Pauses indexing.

**Auth:** Bearer JWT only

```typescript
// Response 200
{ message: "Indexer paused" }
```

#### `POST /api/v1/programs/:id/resume`

Resumes indexing.

**Auth:** Bearer JWT only

```typescript
// Response 200
{ message: "Indexer resumed" }
```

#### `POST /api/v1/programs/discover-idl`

Attempts to find the IDL for a program from on-chain sources.

**Auth:** Bearer JWT only

```typescript
// Request
{
    programId: string;
}

// Response 200
{
    found: boolean;
    source: 'anchor-onchain' | 'solscan' | 'manual-required';
    idl?: object;                   // full IDL if found
    events?: Array<{                // preview of available events
        name: string;
        type: 'event' | 'instruction';
        fields: Array<{ name: string; type: string }>;
    }>;
    message?: string;               // "IDL not found on-chain. Please upload manually."
}
```

### 3.6 Data Endpoints

These endpoints are **identical in shape** to the current API but are now auth-gated and user-scoped.

#### `GET /api/v1/data/{program}/{event}`

List events (paginated, filterable). The `{program}` is the user's program **name** (snake_case), and `{event}` is the event name (snake_case).

**Auth:** Bearer JWT or API Key

```typescript
// Query Parameters (same as current)
{
    limit?: number;         // 1-1000, default 50
    offset?: number;        // default 0
    orderBy?: string;       // column name, default 'slot'
    order?: 'asc' | 'desc'; // default 'desc'
    from?: string;          // ISO 8601 datetime (block_time >=)
    to?: string;            // ISO 8601 datetime (block_time <=)
    slotFrom?: number;      // slot >=
    slotTo?: number;        // slot <=
    [field]?: string;       // exact match on any IDL field
}

// Response 200
{
    data: Array<Record<string, unknown>>;
    pagination: {
        limit: number;
        offset: number;
        total: number;
    }
}
```

**Key change from current:** The URL prefix changes from `/api/v1/{program}/{event}` to `/api/v1/data/{program}/{event}`. This avoids collision with the `/api/v1/programs` resource routes. The `/api/v1/data/` prefix clearly separates data queries from management APIs.

#### `GET /api/v1/data/{program}/{event}/count`

Count events with optional filters.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    count: number
}
```

#### `GET /api/v1/data/{program}/{event}/:txSignature`

Get events by transaction signature.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    data: Array<Record<string, unknown>>
}
```

#### `GET /api/v1/data/{program}/views/{viewName}`

Query a custom view (P2-1).

**Auth:** Bearer JWT or API Key

```typescript
// Query Parameters
{
    limit?: number;
    offset?: number;
    orderBy?: string;
    order?: 'asc' | 'desc';
}

// Response 200
{
    data: Array<Record<string, unknown>>;
    pagination: {
        limit: number;
        offset: number;
        total: number;
    }
}
```

### 3.7 View Endpoints (P2-1)

#### `GET /api/v1/views`

List user's custom views.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    data: Array<{
        id: string;
        name: string;
        programId: string;          // user_program_id
        programName: string;
        definition: object;
        materialized: boolean;
        refreshIntervalMs: number;
        lastRefreshed: string | null;
        status: string;
        createdAt: string;
    }>
}
```

#### `POST /api/v1/views`

Create a custom view.

**Auth:** Bearer JWT only

```typescript
// Request
{
    userProgramId: string;          // which program to build view from
    name: string;                   // view name (alphanumeric + underscores)
    source: string;                 // event name (e.g., "swap_event")
    definition: {
        groupBy: string | string[];          // field(s) to group by
        select: Record<string, string | {    // output columns
            $count?: string;        // COUNT(field) or COUNT(*)
            $sum?: string;          // SUM(field)
            $avg?: string;          // AVG(field)
            $min?: string;          // MIN(field)
            $max?: string;          // MAX(field)
            $first?: string;        // (first value — ordering by slot)
            $last?: string;         // (last value — ordering by slot)
        }>;
        where?: Record<string, unknown>;     // optional pre-filter
    };
    materialized?: boolean;         // default true
    refreshIntervalMs?: number;     // default 60000 (1 min)
}

// Response 201
{
    id: string;
    name: string;
    status: 'pending';
    createdAt: string;
}
```

**Validation:**
- `groupBy` fields must exist in the source event's IDL
- Aggregate operators only allowed on numeric/timestamp fields (except `$count`)
- `name` must be unique per user, alphanumeric + underscores only
- Max 10 views per user (free tier)

**Side effects:**
1. Validates definition against IDL field types
2. Generates safe SQL `CREATE MATERIALIZED VIEW` in user schema
3. Runs initial `REFRESH MATERIALIZED VIEW`
4. Sets up periodic refresh (tracked by a background job in the API service)

**SQL generation example:**
```sql
-- User definition:
-- { groupBy: "user_wallet", select: { wallet: "user_wallet", total_swaps: { $count: "*" }, total_volume: { $sum: "input_amount" } } }

-- Generated SQL in user schema:
CREATE MATERIALIZED VIEW v_active_traders AS
SELECT
    user_wallet AS wallet,
    COUNT(*) AS total_swaps,
    SUM(input_amount) AS total_volume
FROM sample_dex_swap_event
GROUP BY user_wallet;

CREATE UNIQUE INDEX idx_v_active_traders_wallet ON v_active_traders(wallet);
```

#### `DELETE /api/v1/views/:id`

Deletes a custom view.

**Auth:** Bearer JWT only

```typescript
// Response 200
{ message: "View deleted" }
```

### 3.8 Webhook Endpoints (P2-4)

#### `GET /api/v1/webhooks`

List user's webhooks.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200
{
    data: Array<{
        id: string;
        userProgramId: string;
        url: string;
        events: string[];
        filters: object;
        active: boolean;
        lastTriggered: string | null;
        failureCount: number;
        createdAt: string;
    }>
}
```

#### `POST /api/v1/webhooks`

Create a webhook subscription.

**Auth:** Bearer JWT only

```typescript
// Request
{
    userProgramId: string;          // which program
    url: string;                    // HTTPS URL to POST to
    events?: string[];              // event names to match (empty = all)
    filters?: Record<string, unknown>;  // field-level filters
}

// Response 201
{
    id: string;
    url: string;
    secret: string;                 // HMAC signing secret — SHOWN ONCE
    events: string[];
    active: boolean;
    createdAt: string;
}
```

#### `PATCH /api/v1/webhooks/:id`

Update webhook configuration.

**Auth:** Bearer JWT only

```typescript
// Request
{
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    active?: boolean;
}

// Response 200
{
    id: string;
    url: string;
    events: string[];
    filters: object;
    active: boolean;
    updatedAt: string;
}
```

#### `DELETE /api/v1/webhooks/:id`

Delete a webhook.

**Auth:** Bearer JWT only

```typescript
// Response 200
{ message: "Webhook deleted" }
```

### 3.9 Platform Endpoints

#### `GET /api/v1/health`

Health check.

**Auth:** None

```typescript
// Response 200
{
    status: "ok";
    timestamp: string;
    version: string;
}
```

#### `GET /api/v1/status`

User-scoped indexer status.

**Auth:** Bearer JWT or API Key

```typescript
// Response 200 (same shape as current, but scoped to user)
{
    indexer: {
        status: string;
        currentSlot: number;
        version: string;
    };
    chain: { name: string };
    programs: Array<{
        name: string;
        programId: string;
        status: string;
        events: string[];
        eventCounts: Record<string, number>;
        lastSlot: number;
        eventsIndexed: number;
        lastPollAt: string | null;
        error: string | null;
    }>;
}
```

---

## 4. Backend File Structure

### 4.1 New and Modified Files

```
src/
├── core/
│   ├── types.ts                    ✏️  MODIFY — add platform types
│   ├── config.ts                   ✅  UNCHANGED (CLI mode)
│   ├── platform-config.ts          🆕  NEW — env-based config for platform mode
│   ├── db.ts                       ✏️  MODIFY — add schema-aware helpers
│   ├── idl-parser.ts               ✅  UNCHANGED
│   ├── schema-generator.ts         ✏️  MODIFY — add schema-prefix support
│   └── errors.ts                   🆕  NEW — error classes (AppError, etc.)
│
├── auth/
│   ├── jwt.ts                      🆕  NEW — JWT sign/verify, token generation
│   ├── passwords.ts                🆕  NEW — argon2 hash/verify
│   ├── api-keys.ts                 🆕  NEW — API key generate/validate
│   └── email.ts                    🆕  NEW — Resend email client (verify, reset)
│
├── middleware/
│   ├── auth.ts                     🆕  NEW — JWT + API key auth middleware
│   ├── schema.ts                   🆕  NEW — set search_path per request
│   ├── rate-limit.ts               🆕  NEW — per-IP and per-user rate limiting
│   └── usage.ts                    🆕  NEW — track API calls for usage metrics
│
├── api/
│   ├── server.ts                   ✏️  MODIFY — add auth middleware, new routes
│   ├── routes.ts                   ✏️  MODIFY — wrap with schema middleware
│   ├── auth-routes.ts              🆕  NEW — register, login, verify, refresh, logout
│   ├── user-routes.ts              🆕  NEW — profile, API keys
│   ├── program-routes.ts           🆕  NEW — program CRUD, IDL discovery
│   ├── view-routes.ts              🆕  NEW — custom view CRUD + query
│   ├── webhook-routes.ts           🆕  NEW — webhook CRUD
│   └── data-routes.ts              🆕  NEW — user-scoped event queries
│
├── services/
│   ├── user-service.ts             🆕  NEW — user CRUD, schema creation
│   ├── program-service.ts          🆕  NEW — program lifecycle management
│   ├── view-service.ts             🆕  NEW — view creation, SQL generation, refresh
│   ├── webhook-service.ts          🆕  NEW — webhook management + delivery
│   ├── idl-discovery.ts            🆕  NEW — on-chain IDL fetching
│   └── usage-service.ts            🆕  NEW — usage tracking + limit enforcement
│
├── ingestion/
│   ├── poller.ts                   ✅  UNCHANGED (TransactionPoller class)
│   ├── decoder.ts                  ✅  UNCHANGED
│   ├── instruction-decoder.ts      ✅  UNCHANGED
│   ├── writer.ts                   ✏️  MODIFY — add schema prefix support
│   ├── orchestrator.ts             🆕  NEW — round-robin multi-program poller
│   └── fanout-writer.ts            🆕  NEW — writes to multiple user schemas
│
├── websocket/
│   ├── ws-server.ts                🆕  NEW — WebSocket server setup
│   ├── subscription-manager.ts     🆕  NEW — track client subscriptions
│   ├── pg-listener.ts              🆕  NEW — PG LISTEN/NOTIFY consumer
│   └── protocol.ts                 🆕  NEW — WS message types/validation
│
├── cli/
│   ├── index.ts                    ✏️  MODIFY — add 'platform' subcommand
│   ├── start.ts                    ✅  UNCHANGED (CLI/single-user mode)
│   ├── platform.ts                 🆕  NEW — platform start/stop/migrate commands
│   ├── init.ts                     ✅  UNCHANGED
│   ├── schema.ts                   ✅  UNCHANGED
│   ├── status.ts                   ✅  UNCHANGED
│   └── stop.ts                     ✅  UNCHANGED
│
├── migrations/
│   ├── runner.ts                   🆕  NEW — migration runner
│   ├── 001_create_users.sql        🆕  NEW
│   ├── 002_create_refresh_tokens.sql  🆕  NEW
│   ├── ...                         🆕  (all 13 migration files from §2.4)
│   └── 013_create_triggers.sql     🆕  NEW
│
└── index.ts                        ✅  UNCHANGED
```

### 4.2 File Descriptions and Dependencies

#### `src/core/platform-config.ts` 🆕

Loads platform configuration from environment variables. Returns a `PlatformConfig` type.

```typescript
export interface PlatformConfig {
    databaseUrl: string;
    jwtSecret: string;
    jwtRefreshSecret: string;
    resendApiKey: string;
    heliusApiKey?: string;
    apiPort: number;
    wsPort: number;
    corsOrigins: string[];
    nodeEnv: 'development' | 'production';
}

export function loadPlatformConfig(): PlatformConfig;
```

**Dependencies:** none (reads `process.env`)

#### `src/core/errors.ts` 🆕

Structured error classes for consistent API error responses.

```typescript
export class AppError extends Error {
    constructor(
        public code: string,
        public statusCode: number,
        message: string,
        public details?: Record<string, unknown>
    ) { super(message); }
}

export class UnauthorizedError extends AppError { /* code: UNAUTHORIZED, 401 */ }
export class ForbiddenError extends AppError { /* code: FORBIDDEN, 403 */ }
export class NotFoundError extends AppError { /* code: NOT_FOUND, 404 */ }
export class ConflictError extends AppError { /* code: CONFLICT, 409 */ }
export class ValidationError extends AppError { /* code: VALIDATION_ERROR, 422 */ }
export class RateLimitError extends AppError { /* code: RATE_LIMITED, 429 */ }
```

**Dependencies:** none

#### `src/core/types.ts` ✏️ MODIFY

Add these new types (append, do not change existing types):

```typescript
// === Platform Types (appended to existing file) ===

export interface PlatformUser {
    id: string;
    email: string;
    passwordHash: string;
    verified: boolean;
    schemaName: string;
    displayName: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ApiKeyRecord {
    id: string;
    userId: string;
    keyHash: string;
    keyPrefix: string;
    label: string;
    lastUsed: Date | null;
    revoked: boolean;
    createdAt: Date;
}

export interface UserProgram {
    id: string;
    userId: string;
    programId: string;
    name: string;
    idl: object;
    chain: string;
    status: 'provisioning' | 'running' | 'paused' | 'error' | 'archived';
    config: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserProgramEvent {
    id: string;
    userProgramId: string;
    eventName: string;
    eventType: 'event' | 'instruction';
    enabled: boolean;
    fieldConfig: Record<string, unknown>;
    createdAt: Date;
}

export interface UserView {
    id: string;
    userId: string;
    userProgramId: string;
    name: string;
    definition: ViewDefinition;
    materialized: boolean;
    refreshIntervalMs: number;
    lastRefreshed: Date | null;
    status: 'pending' | 'active' | 'error' | 'disabled';
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ViewDefinition {
    source: string;                                  // event name
    groupBy: string | string[];
    select: Record<string, string | ViewAggregate>;
    where?: Record<string, unknown>;
}

export interface ViewAggregate {
    $count?: string;
    $sum?: string;
    $avg?: string;
    $min?: string;
    $max?: string;
    $first?: string;
    $last?: string;
}

export interface WebhookRecord {
    id: string;
    userId: string;
    userProgramId: string;
    url: string;
    secret: string;
    events: string[];
    filters: Record<string, unknown>;
    active: boolean;
    lastTriggered: Date | null;
    failureCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthPayload {
    userId: string;
    email: string;
    schemaName: string;
}

export interface WsSubscription {
    programs?: string[];            // program names to subscribe to
    events?: string[];              // event names to subscribe to
    filters?: Record<string, unknown>;  // field-level filters
}
```

#### `src/core/db.ts` ✏️ MODIFY

Add schema-aware connection helpers:

```typescript
// Add these functions (keep existing functions unchanged):

/**
 * Creates a pool from a DATABASE_URL connection string (for platform mode).
 */
export function createPoolFromUrl(url: string, max?: number): pg.Pool;

/**
 * Acquires a client from the pool with search_path set to the user's schema.
 * MUST be released by caller.
 */
export async function withUserSchema(
    pool: pg.Pool,
    schemaName: string
): Promise<pg.PoolClient>;

/**
 * Executes a callback with the search_path set to the user's schema.
 * Automatically acquires and releases the client.
 */
export async function inUserSchema<T>(
    pool: pg.Pool,
    schemaName: string,
    fn: (client: pg.PoolClient) => Promise<T>
): Promise<T>;

/**
 * Creates a new PostgreSQL schema for a user.
 */
export async function createUserSchema(pool: pg.Pool, schemaName: string): Promise<void>;
```

Implementation of `withUserSchema`:
```typescript
export async function withUserSchema(pool: pg.Pool, schemaName: string): Promise<pg.PoolClient> {
    // Validate schema name to prevent injection (only allow u_[hex])
    if (!/^u_[a-f0-9]{8,12}$/.test(schemaName)) {
        throw new Error(`Invalid schema name: ${schemaName}`);
    }
    const client = await pool.connect();
    await client.query(`SET search_path TO ${schemaName}, public`);
    return client;
}
```

#### `src/core/schema-generator.ts` ✏️ MODIFY

Add:
```typescript
/**
 * Generates DDL for a user schema (the schema itself + tables).
 * Tables are created inside the specified schema.
 */
export function generateUserSchemaDDL(
    schemaName: string,
    parsed: ParsedIDL,
    enabledEvents: UserProgramEvent[]
): string[];
```

This wraps the existing `generateEventTable()` and `generateInstructionTable()` calls with `SET search_path TO <schema>` prefix and filters by enabled events.

#### `src/auth/jwt.ts` 🆕

```typescript
export function signAccessToken(payload: AuthPayload): string;       // 15min expiry
export function signRefreshToken(userId: string): string;             // 30-day expiry, opaque
export function verifyAccessToken(token: string): AuthPayload;
export function verifyRefreshToken(token: string): { userId: string };
export function hashRefreshToken(token: string): string;              // SHA-256
```

**Dependencies:** `jsonwebtoken`, `src/core/platform-config.ts`

#### `src/auth/passwords.ts` 🆕

```typescript
export async function hashPassword(password: string): Promise<string>;   // argon2id
export async function verifyPassword(password: string, hash: string): Promise<boolean>;
export function validatePasswordStrength(password: string): { valid: boolean; message?: string };
```

**Dependencies:** `argon2`

#### `src/auth/api-keys.ts` 🆕

```typescript
export function generateApiKey(): { key: string; hash: string; prefix: string };
export function hashApiKey(key: string): string;                     // SHA-256
export function isValidApiKeyFormat(key: string): boolean;           // checks uho_sk_ prefix
```

**Dependencies:** `crypto` (built-in)

#### `src/auth/email.ts` 🆕

```typescript
export async function sendVerificationEmail(email: string, code: string): Promise<void>;
export async function sendPasswordResetEmail(email: string, token: string): Promise<void>;
export function generateVerificationCode(): string;   // 6-digit numeric
export function generateResetToken(): string;          // 64-char hex
```

**Dependencies:** `resend`

#### `src/middleware/auth.ts` 🆕

Fastify preHandler hook that extracts and validates auth credentials.

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Auth middleware. Checks (in order):
 * 1. Authorization: Bearer <jwt>
 * 2. X-API-Key: uho_sk_...
 * 3. ?apiKey=uho_sk_...
 *
 * On success: sets request.user = { userId, email, schemaName }
 * On failure: returns 401
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;

/**
 * Stricter middleware: JWT only (no API keys). For write operations.
 */
export async function jwtOnlyMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;

/**
 * Optional auth: sets request.user if token present, but doesn't reject if absent.
 */
export async function optionalAuthMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
```

Adds `user` to the Fastify request via declaration merging:
```typescript
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthPayload;
    }
}
```

**Dependencies:** `src/auth/jwt.ts`, `src/auth/api-keys.ts`, `src/core/db.ts`

#### `src/middleware/schema.ts` 🆕

```typescript
/**
 * Sets search_path on the request's DB connection to the authenticated user's schema.
 * Must run AFTER auth middleware.
 */
export async function schemaMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
```

This decorates `request` with a `schemaClient` (a `pg.PoolClient` with `search_path` set). The client is released in an `onResponse` hook.

```typescript
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthPayload;
        schemaClient?: pg.PoolClient;
    }
}
```

#### `src/middleware/rate-limit.ts` 🆕

Uses `@fastify/rate-limit` plugin with per-route configuration.

```typescript
export function registerRateLimiting(app: FastifyInstance): Promise<void>;
```

Rate limit configuration:
- Auth endpoints: 5/min per IP (login), 3/hr per IP (register)
- API reads: 100/min per user
- API writes: 10/min per user
- WebSocket connections: tracked in subscription-manager

#### `src/middleware/usage.ts` 🆕

```typescript
/**
 * Tracks API call count per user per hour.
 * Increments usage_metrics and enforces free tier limits.
 */
export async function usageMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
```

#### `src/services/user-service.ts` 🆕

```typescript
export class UserService {
    constructor(private pool: pg.Pool);

    async createUser(email: string, password: string): Promise<PlatformUser>;
    async verifyEmail(email: string, code: string): Promise<PlatformUser>;
    async getUserById(id: string): Promise<PlatformUser | null>;
    async getUserByEmail(email: string): Promise<PlatformUser | null>;
    async updateUser(id: string, updates: Partial<PlatformUser>): Promise<PlatformUser>;
    async getUsageStats(userId: string): Promise<UsageStats>;

    // Internal
    private async createSchema(schemaName: string): Promise<void>;
    private generateSchemaName(userId: string): string;
}
```

**Dependencies:** `src/auth/passwords.ts`, `src/auth/email.ts`, `src/core/db.ts`

#### `src/services/program-service.ts` 🆕

```typescript
export class ProgramService {
    constructor(private pool: pg.Pool);

    async addProgram(userId: string, schemaName: string, input: AddProgramInput): Promise<UserProgram>;
    async listPrograms(userId: string): Promise<UserProgramWithEvents[]>;
    async getProgram(userId: string, programId: string): Promise<UserProgramDetail>;
    async updateProgram(userId: string, programId: string, updates: object): Promise<UserProgram>;
    async archiveProgram(userId: string, programId: string): Promise<void>;
    async pauseProgram(userId: string, programId: string): Promise<void>;
    async resumeProgram(userId: string, programId: string): Promise<void>;
    async refreshActiveSubscriptions(): Promise<void>;

    // Internal
    private async provisionTables(schemaName: string, parsedIdl: ParsedIDL, events: UserProgramEvent[]): Promise<void>;
    private async notifyProgramChange(action: string, programId: string): Promise<void>;
}
```

**Dependencies:** `src/core/schema-generator.ts`, `src/core/idl-parser.ts`, `src/core/db.ts`

#### `src/services/view-service.ts` 🆕

```typescript
export class ViewService {
    constructor(private pool: pg.Pool);

    async createView(userId: string, schemaName: string, input: CreateViewInput): Promise<UserView>;
    async listViews(userId: string): Promise<UserView[]>;
    async queryView(schemaName: string, viewName: string, params: QueryParams): Promise<PaginatedResult>;
    async deleteView(userId: string, schemaName: string, viewId: string): Promise<void>;
    async refreshView(schemaName: string, viewName: string): Promise<void>;
    async refreshDueViews(): Promise<void>;  // called on interval

    // Internal
    private generateViewSQL(definition: ViewDefinition, sourceProgramName: string, parsedIdl: ParsedIDL): string;
    private validateDefinition(definition: ViewDefinition, parsedIdl: ParsedIDL): void;
}
```

**Dependencies:** `src/core/db.ts`, `src/core/idl-parser.ts`

**SQL generation safety:**
- All field names are validated against the parsed IDL (whitelist only)
- Aggregate operators are a fixed set (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`)
- No raw user SQL is ever executed
- View names are sanitized: `v_` prefix + alphanumeric/underscores only

#### `src/services/webhook-service.ts` 🆕

```typescript
export class WebhookService {
    constructor(private pool: pg.Pool);

    async create(userId: string, input: CreateWebhookInput): Promise<WebhookRecord>;
    async list(userId: string): Promise<WebhookRecord[]>;
    async update(userId: string, webhookId: string, updates: object): Promise<WebhookRecord>;
    async delete(userId: string, webhookId: string): Promise<void>;

    // Delivery (called from WebSocket service's PG listener)
    async deliverEvent(event: IndexedEvent): Promise<void>;
    async retryFailedDeliveries(): Promise<void>;

    // Internal
    private async sendWebhook(webhook: WebhookRecord, payload: object): Promise<boolean>;
    private signPayload(payload: string, secret: string): string;  // HMAC-SHA256
}
```

#### `src/services/idl-discovery.ts` 🆕

```typescript
export class IdlDiscoveryService {
    constructor(private rpcUrl: string);

    async discover(programId: string): Promise<DiscoveryResult>;

    // Internal
    private async tryAnchorOnChain(programId: string): Promise<object | null>;
    private async trySolscan(programId: string): Promise<object | null>;
}

interface DiscoveryResult {
    found: boolean;
    source: 'anchor-onchain' | 'solscan' | 'manual-required';
    idl?: object;
    events?: Array<{ name: string; type: string; fields: Array<{ name: string; type: string }> }>;
    message?: string;
}
```

**Dependencies:** `@solana/web3.js`, `src/core/idl-parser.ts`

#### `src/services/usage-service.ts` 🆕

```typescript
export class UsageService {
    constructor(private pool: pg.Pool);

    async trackApiCall(userId: string): Promise<void>;
    async trackEventIndexed(userId: string, count: number): Promise<void>;
    async trackWsMessage(userId: string): Promise<void>;
    async trackWebhookDelivery(userId: string): Promise<void>;

    async getUsage(userId: string): Promise<{
        apiCalls: number;           // current month
        eventsIndexed: number;      // total
        programs: number;           // active count
    }>;

    async checkLimit(userId: string, metric: string): Promise<{ allowed: boolean; current: number; limit: number }>;
}
```

#### `src/ingestion/orchestrator.ts` 🆕

The heart of the shared indexer. See [Section 7](#7-indexer-orchestration) for full design.

```typescript
export class IndexerOrchestrator {
    constructor(private pool: pg.Pool, private rpcUrl: string);

    async start(): Promise<void>;
    async stop(): Promise<void>;

    // Internal
    private async loadActivePrograms(): Promise<void>;
    private async pollNextProgram(): Promise<void>;
    private async handleProgramChange(notification: ProgramChange): Promise<void>;
}
```

#### `src/ingestion/fanout-writer.ts` 🆕

```typescript
export class FanoutWriter {
    constructor(private pool: pg.Pool);

    /**
     * Writes decoded events to ALL user schemas that subscribe to this program.
     * Uses a transaction per user schema for isolation.
     */
    async writeToSubscribers(
        programId: string,
        events: DecodedEvent[],
        instructions: DecodedInstruction[],
        subscribers: SubscriberInfo[]
    ): Promise<WriteResult>;

    /**
     * Sends PG NOTIFY for WebSocket/webhook fanout.
     */
    private async notifyNewEvents(
        programId: string,
        events: DecodedEvent[],
        subscribers: SubscriberInfo[]
    ): Promise<void>;
}

interface SubscriberInfo {
    userId: string;
    schemaName: string;
    programName: string;
    parsedIdl: ParsedIDL;
    enabledEvents: string[];
}

interface WriteResult {
    totalWritten: number;
    perSubscriber: Record<string, number>;
}
```

#### `src/ingestion/writer.ts` ✏️ MODIFY

Minimal changes: add optional `schemaPrefix` parameter to constructor so the writer can target a specific schema. The existing constructor signature remains valid (no schema = `public`).

```typescript
// Add to EventWriter constructor:
constructor(pool: pg.Pool, parsedIdl: ParsedIDL, schemaName?: string) {
    // If schemaName provided, all queries use SET search_path
}
```

#### `src/websocket/ws-server.ts` 🆕

See [Section 8](#8-websocket-subscription-design).

```typescript
export async function createWsServer(pool: pg.Pool, config: PlatformConfig): Promise<FastifyInstance>;
```

#### `src/websocket/subscription-manager.ts` 🆕

```typescript
export class SubscriptionManager {
    addClient(clientId: string, userId: string, ws: WebSocket): void;
    removeClient(clientId: string): void;
    subscribe(clientId: string, subscription: WsSubscription): void;
    unsubscribe(clientId: string, subscriptionId: string): void;
    broadcast(event: IndexedEvent): void;  // fans out to matching clients
    getClientCount(): number;
    getUserClientCount(userId: string): number;
}
```

#### `src/websocket/pg-listener.ts` 🆕

```typescript
export class PgEventListener {
    constructor(private pool: pg.Pool, private onEvent: (event: PgNotifyPayload) => void);
    async start(): Promise<void>;   // LISTEN uho_events
    async stop(): Promise<void>;    // UNLISTEN
}
```

#### `src/websocket/protocol.ts` 🆕

```typescript
// Client → Server messages
export interface WsClientMessage {
    action: 'subscribe' | 'unsubscribe' | 'ping';
    id?: string;                    // subscription ID (for unsubscribe)
    programs?: string[];
    events?: string[];
    filters?: Record<string, unknown>;
}

// Server → Client messages
export interface WsServerMessage {
    type: 'event' | 'subscribed' | 'unsubscribed' | 'error' | 'pong';
    subscriptionId?: string;
    program?: string;
    event?: string;
    data?: Record<string, unknown>;
    slot?: number;
    txSignature?: string;
    timestamp?: string;
    message?: string;
}
```

#### `src/api/server.ts` ✏️ MODIFY

Major changes:
1. Add `createPlatformServer()` function alongside existing `createServer()` (which stays for CLI mode)
2. Register auth middleware, rate limiting, CORS, error handler
3. Register all new route modules
4. Add `onResponse` hook to release `schemaClient`

```typescript
// New export:
export async function createPlatformServer(
    pool: pg.Pool,
    config: PlatformConfig
): Promise<FastifyInstance>;
```

#### `src/api/routes.ts` ✏️ MODIFY

Keep existing functions (used by CLI mode). Add a wrapper version for platform mode:

```typescript
/**
 * Registers user-scoped data routes.
 * These are dynamically registered based on the user's programs.
 * Uses schemaClient from request (set by schema middleware).
 */
export function registerUserDataRoutes(
    app: FastifyInstance,
    pool: pg.Pool
): void;
```

In platform mode, the data routes are generic (not per-IDL). They resolve the user's programs dynamically from the DB and validate queries against the stored IDL.

#### `src/api/data-routes.ts` 🆕

Replaces the static per-IDL route registration with dynamic user-scoped routes:

```typescript
export function registerDataRoutes(app: FastifyInstance, pool: pg.Pool): void {
    // GET /api/v1/data/:program/:event — dynamic, resolves from user's programs
    // GET /api/v1/data/:program/:event/count
    // GET /api/v1/data/:program/:event/:txSignature
    // GET /api/v1/data/:program/views/:viewName
}
```

These routes:
1. Look up the user's program by name from `user_programs` table
2. Parse the stored IDL to get field names (for safe filtering)
3. Use `schemaClient` (with `search_path` set) to query the user's schema
4. Reuse `buildWhereClause()` and `serializeRow()` from existing `routes.ts`

#### `src/cli/platform.ts` 🆕

```typescript
export async function platformStartCommand(options: {
    service?: 'api' | 'indexer' | 'ws' | 'all';
}): Promise<void>;

export async function platformMigrateCommand(): Promise<void>;

export async function platformStopCommand(): Promise<void>;
```

#### `src/cli/index.ts` ✏️ MODIFY

Add `platform` subcommand:

```typescript
program
    .command('platform')
    .description('Manage the Uho platform (multi-tenant mode)')
    .command('start')
    .option('--service <service>', 'Service to start: api, indexer, ws, all', 'all')
    .action(platformStartCommand);

program
    .command('platform migrate')
    .description('Run platform database migrations')
    .action(platformMigrateCommand);
```

### 4.3 New Dependencies

Add to `package.json`:

```json
{
    "dependencies": {
        "argon2": "^0.41.0",
        "jsonwebtoken": "^9.0.0",
        "@types/jsonwebtoken": "^9.0.0",
        "resend": "^4.0.0",
        "@fastify/rate-limit": "^10.0.0",
        "@fastify/websocket": "^11.0.0",
        "@fastify/cookie": "^10.0.0",
        "node-pg-migrate": "^7.0.0"
    }
}
```

---

## 5. Frontend File Structure

### 5.1 New and Modified Files

```
dashboard/src/
├── app/
│   ├── layout.tsx                  ✏️  MODIFY — add AuthProvider, conditional sidebar
│   ├── page.tsx                    ✏️  MODIFY — redirect to /dashboard if logged in
│   │
│   ├── (auth)/                     🆕  Auth layout group (no sidebar)
│   │   ├── layout.tsx              🆕  NEW — centered layout, no sidebar
│   │   ├── login/
│   │   │   └── page.tsx            🆕  NEW — login form
│   │   ├── register/
│   │   │   └── page.tsx            🆕  NEW — registration form
│   │   ├── verify/
│   │   │   └── page.tsx            🆕  NEW — email verification (code input)
│   │   ├── forgot-password/
│   │   │   └── page.tsx            🆕  NEW — forgot password form
│   │   └── reset-password/
│   │       └── page.tsx            🆕  NEW — reset password form (with token)
│   │
│   ├── (dashboard)/                🆕  Dashboard layout group (with sidebar, auth-gated)
│   │   ├── layout.tsx              🆕  NEW — sidebar + auth gate
│   │   ├── dashboard/
│   │   │   └── page.tsx            🆕  NEW — main dashboard (moved from current page.tsx)
│   │   ├── events/
│   │   │   ├── page.tsx            ✏️  MODIFY — use authenticated API client
│   │   │   └── [txSignature]/
│   │   │       └── page.tsx        ✏️  MODIFY — use authenticated API client
│   │   ├── programs/
│   │   │   ├── page.tsx            ✏️  MODIFY — full program management
│   │   │   ├── new/
│   │   │   │   └── page.tsx        🆕  NEW — add program form (IDL upload + discovery)
│   │   │   └── [id]/
│   │   │       └── page.tsx        🆕  NEW — program detail view
│   │   ├── views/
│   │   │   ├── page.tsx            🆕  NEW — list custom views
│   │   │   └── new/
│   │   │       └── page.tsx        🆕  NEW — create view wizard
│   │   ├── webhooks/
│   │   │   ├── page.tsx            🆕  NEW — list webhooks
│   │   │   └── new/
│   │   │       └── page.tsx        🆕  NEW — create webhook form
│   │   ├── settings/
│   │   │   └── page.tsx            ✏️  MODIFY — add API key management, profile
│   │   └── logs/
│   │       └── page.tsx            ✅  UNCHANGED
│   │
│   └── globals.css                 ✅  UNCHANGED
│
├── components/
│   ├── auth/
│   │   ├── auth-provider.tsx       🆕  NEW — React context for auth state
│   │   ├── auth-guard.tsx          🆕  NEW — redirect to login if not authenticated
│   │   ├── login-form.tsx          🆕  NEW — email/password form component
│   │   ├── register-form.tsx       🆕  NEW — registration form component
│   │   └── verify-form.tsx         🆕  NEW — OTP code input component
│   │
│   ├── programs/
│   │   ├── program-card.tsx        ✏️  MODIFY — add status controls (pause/resume/delete)
│   │   ├── add-program-form.tsx    🆕  NEW — program ID input + IDL upload/discovery
│   │   ├── idl-preview.tsx         🆕  NEW — shows discovered events/fields from IDL
│   │   ├── event-selector.tsx      🆕  NEW — checkboxes to enable/disable events
│   │   └── program-detail.tsx      🆕  NEW — detailed program view with charts
│   │
│   ├── views/
│   │   ├── view-card.tsx           🆕  NEW — view summary card
│   │   ├── view-builder.tsx        🆕  NEW — visual view definition builder
│   │   └── view-results.tsx        🆕  NEW — data table for view query results
│   │
│   ├── webhooks/
│   │   ├── webhook-card.tsx        🆕  NEW — webhook summary card
│   │   ├── webhook-form.tsx        🆕  NEW — create/edit webhook form
│   │   └── delivery-log.tsx        🆕  NEW — webhook delivery history
│   │
│   ├── settings/
│   │   ├── api-key-list.tsx        🆕  NEW — list API keys with revoke
│   │   ├── api-key-dialog.tsx      🆕  NEW — generate new key dialog (show once)
│   │   ├── profile-form.tsx        🆕  NEW — update display name, password
│   │   └── usage-display.tsx       🆕  NEW — usage stats cards
│   │
│   ├── layout/
│   │   ├── sidebar.tsx             ✏️  MODIFY — add new nav items, user menu
│   │   ├── page-container.tsx      ✅  UNCHANGED
│   │   ├── header.tsx              ✏️  MODIFY — add user dropdown
│   │   └── user-menu.tsx           🆕  NEW — avatar + dropdown (profile, logout)
│   │
│   ├── dashboard/                  ✅  UNCHANGED (existing components)
│   ├── events/                     ✅  UNCHANGED
│   ├── shared/                     ✅  UNCHANGED
│   ├── ui/                         ✅  UNCHANGED (existing base components)
│   │   ├── modal.tsx               🆕  NEW — reusable modal component
│   │   ├── tabs.tsx                🆕  NEW — tab navigation component
│   │   ├── toast.tsx               🆕  NEW — toast notification component
│   │   └── dropdown.tsx            🆕  NEW — dropdown menu component
│   │
│   └── providers.tsx               ✏️  MODIFY — add AuthProvider
│
├── lib/
│   ├── api.ts                      ✏️  MODIFY — add auth headers, new endpoints
│   ├── auth.ts                     🆕  NEW — token management (store, refresh, logout)
│   ├── types.ts                    ✏️  MODIFY — add platform types
│   └── utils.ts                    ✅  UNCHANGED
│
└── hooks/
    ├── use-auth.ts                 🆕  NEW — useAuth() hook (login state, user info)
    ├── use-programs.ts             🆕  NEW — usePrograms() hook (list, create, delete)
    └── use-websocket.ts            🆕  NEW — useWebSocket() hook (subscribe to events)
```

### 5.2 Auth Flow

#### Token Storage

- **Access token:** In-memory (React state via `AuthProvider` context). Never persisted to `localStorage`.
- **Refresh token:** `httpOnly` secure cookie (`uho_refresh`), set by the API server. Not accessible from JavaScript.

#### Flow

```
1. User navigates to any dashboard page
2. AuthGuard checks: is there an access token in context?
   ├── YES → proceed (token might be expired)
   │         On 401 from API → try /auth/refresh (cookie sent automatically)
   │         ├── Refresh succeeds → update access token in context, retry request
   │         └── Refresh fails → redirect to /login
   └── NO → try /auth/refresh (maybe page was reloaded)
             ├── Refresh succeeds → set access token, proceed
             └── Refresh fails → redirect to /login

3. Login form → POST /auth/login → receive accessToken in body, refreshToken as cookie
4. Register form → POST /auth/register → redirect to /verify
5. Verify form → POST /auth/verify → receive tokens, redirect to /dashboard
```

#### `dashboard/src/lib/auth.ts` 🆕

```typescript
// In-memory token storage
let accessToken: string | null = null;

export function getAccessToken(): string | null;
export function setAccessToken(token: string): void;
export function clearAccessToken(): void;

export async function refreshAccessToken(): Promise<string>;  // calls /auth/refresh
export async function logout(): Promise<void>;                  // calls /auth/logout, clears state
```

#### `dashboard/src/lib/api.ts` ✏️ MODIFY

Modify the base `fetchApi` to:
1. Attach `Authorization: Bearer <token>` header
2. On 401, attempt token refresh and retry once
3. Add new endpoint functions

```typescript
// Modified fetchApi
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers as Record<string, string>,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

    // Auto-refresh on 401
    if (res.status === 401) {
        try {
            const newToken = await refreshAccessToken();
            headers['Authorization'] = `Bearer ${newToken}`;
            res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
        } catch {
            clearAccessToken();
            window.location.href = '/login';
            throw new Error('Session expired');
        }
    }

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new ApiError(res.status, error.error?.code, error.error?.message);
    }

    return res.json();
}

// New endpoint functions:

// Auth
export async function register(email: string, password: string): Promise<{ message: string; userId: string }>;
export async function login(email: string, password: string): Promise<LoginResponse>;
export async function verifyEmail(email: string, code: string): Promise<LoginResponse>;
export async function forgotPassword(email: string): Promise<{ message: string }>;
export async function resetPassword(token: string, password: string): Promise<{ message: string }>;

// User
export async function getMe(): Promise<UserProfile>;
export async function updateMe(data: object): Promise<UserProfile>;
export async function getApiKeys(): Promise<{ data: ApiKeyInfo[] }>;
export async function createApiKey(label?: string): Promise<ApiKeyCreated>;
export async function revokeApiKey(id: string): Promise<void>;

// Programs
export async function getPrograms(): Promise<{ data: ProgramInfo[] }>;
export async function createProgram(input: CreateProgramInput): Promise<ProgramInfo>;
export async function getProgram(id: string): Promise<ProgramDetail>;
export async function updateProgram(id: string, updates: object): Promise<ProgramInfo>;
export async function archiveProgram(id: string): Promise<void>;
export async function pauseProgram(id: string): Promise<void>;
export async function resumeProgram(id: string): Promise<void>;
export async function discoverIdl(programId: string): Promise<DiscoveryResult>;

// Data (note: /data/ prefix in URL)
export async function getEvents(program: string, event: string, params?: object): Promise<EventListResponse>;
export async function getEventCount(program: string, event: string): Promise<{ count: number }>;
export async function getEventByTx(program: string, event: string, tx: string): Promise<{ data: object[] }>;

// Views
export async function getViews(): Promise<{ data: ViewInfo[] }>;
export async function createView(input: CreateViewInput): Promise<ViewInfo>;
export async function queryView(program: string, viewName: string, params?: object): Promise<EventListResponse>;
export async function deleteView(id: string): Promise<void>;

// Webhooks
export async function getWebhooks(): Promise<{ data: WebhookInfo[] }>;
export async function createWebhook(input: CreateWebhookInput): Promise<WebhookCreated>;
export async function updateWebhook(id: string, updates: object): Promise<WebhookInfo>;
export async function deleteWebhook(id: string): Promise<void>;
```

### 5.3 Layout Changes

#### `dashboard/src/app/layout.tsx` ✏️ MODIFY

Wrap with `AuthProvider`. Remove the always-present sidebar (it moves to the dashboard layout group).

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark">
            <head>{/* fonts */}</head>
            <body className="bg-[#09090B] text-[#EDEDEF] font-sans antialiased">
                <Providers>
                    <AuthProvider>
                        {children}
                    </AuthProvider>
                </Providers>
            </body>
        </html>
    );
}
```

#### `dashboard/src/app/(auth)/layout.tsx` 🆕

Centered layout for auth pages (no sidebar):

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Uho logo */}
                <div className="text-center mb-8">
                    <span className="text-2xl font-bold text-[#EDEDEF]">uho</span>
                    <span className="text-2xl font-bold text-[#22D3EE]">.</span>
                </div>
                {children}
            </div>
        </div>
    );
}
```

#### `dashboard/src/app/(dashboard)/layout.tsx` 🆕

Dashboard layout with sidebar and auth gate:

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthGuard>
            <div className="flex min-h-screen">
                <Sidebar />
                <div className="flex-1 ml-60 transition-all duration-200">
                    {children}
                </div>
            </div>
        </AuthGuard>
    );
}
```

### 5.4 Updated Sidebar Navigation

```typescript
const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/events', label: 'Event Explorer', icon: Search },
    { href: '/programs', label: 'Programs', icon: Code2 },
    { href: '/views', label: 'Views', icon: Table2 },           // NEW
    { href: '/webhooks', label: 'Webhooks', icon: Webhook },     // NEW
    { href: '/logs', label: 'Logs', icon: ScrollText },
    { href: '/settings', label: 'Settings', icon: Settings },
];
```

Add a user menu at the bottom of the sidebar (above collapse button):
```tsx
<UserMenu user={currentUser} onLogout={logout} />
```

---

## 6. Auth System Design

### 6.1 JWT Token Flow

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser    │         │  API Server  │         │  PostgreSQL  │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │  POST /auth/login      │                        │
       │  {email, password}     │                        │
       ├───────────────────────►│                        │
       │                        │  SELECT * FROM users   │
       │                        │  WHERE email = $1      │
       │                        ├───────────────────────►│
       │                        │◄───────────────────────┤
       │                        │                        │
       │                        │  argon2.verify()       │
       │                        │                        │
       │                        │  INSERT refresh_tokens │
       │                        ├───────────────────────►│
       │                        │◄───────────────────────┤
       │                        │                        │
       │  200 OK                │                        │
       │  Body: {accessToken}   │                        │
       │  Cookie: uho_refresh   │                        │
       │◄───────────────────────┤                        │
       │                        │                        │
       │                        │                        │
       │  GET /api/v1/programs  │                        │
       │  Auth: Bearer <JWT>    │                        │
       ├───────────────────────►│                        │
       │                        │  jwt.verify()          │
       │                        │  → {userId, email,     │
       │                        │     schemaName}        │
       │                        │                        │
       │                        │  SET search_path TO    │
       │                        │  u_a1b2c3d4, public    │
       │                        ├───────────────────────►│
       │                        │                        │
       │                        │  SELECT * FROM         │
       │                        │  user_programs ...     │
       │                        ├───────────────────────►│
       │                        │◄───────────────────────┤
       │  200 OK {data: [...]}  │                        │
       │◄───────────────────────┤                        │
       │                        │                        │
       │  (15 min later — token expired)                 │
       │                        │                        │
       │  POST /auth/refresh    │                        │
       │  Cookie: uho_refresh   │                        │
       ├───────────────────────►│                        │
       │                        │  SELECT * FROM         │
       │                        │  refresh_tokens        │
       │                        │  WHERE token_hash=$1   │
       │                        ├───────────────────────►│
       │                        │◄───────────────────────┤
       │                        │                        │
       │                        │  Revoke old token      │
       │                        │  Insert new token      │
       │                        ├───────────────────────►│
       │                        │                        │
       │  200 OK                │                        │
       │  Body: {accessToken}   │                        │
       │  Cookie: uho_refresh   │  (new cookie)         │
       │◄───────────────────────┤                        │
```

### 6.2 Access Token Structure

```typescript
// JWT payload (signed with JWT_SECRET, HS256)
{
    userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    email: "user@example.com",
    schemaName: "u_a1b2c3d4",
    iat: 1706140000,
    exp: 1706140900          // 15 minutes
}
```

### 6.3 Refresh Token Flow

- **Format:** 64-char random hex string (not a JWT)
- **Storage:** SHA-256 hash in `refresh_tokens` table
- **Rotation:** Every refresh issues a new token and revokes the old one
- **Cookie settings:**
  ```typescript
  {
      httpOnly: true,
      secure: true,           // production only
      sameSite: 'lax',
      path: '/api/v1/auth',   // only sent to auth endpoints
      maxAge: 30 * 24 * 60 * 60  // 30 days
  }
  ```

### 6.4 API Key Validation

```typescript
// API key format: uho_sk_{32 hex chars}
// Example: uho_sk_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4

// Validation flow in auth middleware:
async function validateApiKey(key: string, pool: pg.Pool): Promise<AuthPayload | null> {
    if (!key.startsWith('uho_sk_')) return null;

    const hash = crypto.createHash('sha256').update(key).digest('hex');

    const result = await pool.query(`
        SELECT ak.user_id, u.email, u.schema_name
        FROM api_keys ak
        JOIN users u ON u.id = ak.user_id
        WHERE ak.key_hash = $1 AND ak.revoked = false
    `, [hash]);

    if (result.rows.length === 0) return null;

    // Update last_used timestamp (fire-and-forget)
    pool.query('UPDATE api_keys SET last_used = now() WHERE key_hash = $1', [hash]);

    return {
        userId: result.rows[0].user_id,
        email: result.rows[0].email,
        schemaName: result.rows[0].schema_name,
    };
}
```

### 6.5 Middleware Chain

Every authenticated request goes through this chain:

```
Request
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ 1. Rate Limit Middleware                             │
│    Check IP/user rate limits → 429 if exceeded       │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 2. Auth Middleware                                    │
│    Extract JWT or API key                            │
│    Verify token/key → 401 if invalid                 │
│    Set request.user = { userId, email, schemaName }  │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 3. Usage Middleware                                   │
│    Increment api_call counter for user               │
│    Check free tier limit → 429 if exceeded           │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 4. Schema Middleware (for data routes only)           │
│    Acquire poolClient                                │
│    SET search_path TO u_XXXXXXXX, public             │
│    Attach to request.schemaClient                    │
│    Register onResponse hook to release client        │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 5. Route Handler                                     │
│    Process request using request.schemaClient        │
└─────────────────────────────────────────────────────┘
```

### 6.6 Schema Enforcement

The `search_path` is the only mechanism for data isolation. It's enforced at two levels:

1. **API requests:** Schema middleware acquires a client with `SET search_path TO u_XXXXXXXX, public` before any data query runs.

2. **Indexer writes:** The `FanoutWriter` sets the search_path per subscriber when writing events.

**Critical safety rule:** No data query may ever run without `search_path` being set. The schema middleware validates the `schemaName` format (`/^u_[a-f0-9]{8,12}$/`) to prevent injection.

---

## 7. Indexer Orchestration

### 7.1 Shared Poller Architecture

The indexer runs as a single process that polls all active programs in a round-robin loop. When multiple users index the same program ID, only one poller instance exists for that program — events are fanned out to all subscriber schemas.

### 7.2 Round-Robin Loop Design

```
┌────────────────────────────────────────────────────┐
│                IndexerOrchestrator                  │
│                                                    │
│  Active Programs Registry:                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ Program ID      │ Subscribers  │ Poller State │  │
│  │─────────────────┼──────────────┼──────────────│  │
│  │ Dex111...       │ [User A, B]  │ lastSig: x   │  │
│  │ Amm222...       │ [User C]     │ lastSig: y   │  │
│  │ Swap333...      │ [User A]     │ lastSig: z   │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  Round-Robin Loop:                                 │
│  while (running) {                                 │
│    for (program of activePrograms) {               │
│      txs = poll(program)      // fetch new txs     │
│      events = decode(txs)     // decode events     │
│      fanout(events, program.subscribers) // write   │
│      await sleep(delayBetweenPrograms)             │
│    }                                               │
│    await sleep(pollInterval)                       │
│  }                                                 │
└────────────────────────────────────────────────────┘
```

### 7.3 Orchestrator Implementation

```typescript
// src/ingestion/orchestrator.ts

export class IndexerOrchestrator {
    private pool: pg.Pool;
    private connection: Connection;
    private running = false;

    // Registry: programId → { poller, subscribers[], decoders }
    private programs = new Map<string, ActiveProgram>();

    // Poll interval between full cycles
    private cycleIntervalMs = 2000;
    // Delay between individual program polls within a cycle
    private interProgramDelayMs = 100;

    constructor(pool: pg.Pool, rpcUrl: string) {
        this.pool = pool;
        this.connection = new Connection(rpcUrl, 'confirmed');
    }

    async start(): Promise<void> {
        this.running = true;

        // 1. Load initial active programs from materialized view
        await this.loadActivePrograms();

        // 2. Listen for program changes (add/remove/pause)
        await this.listenForChanges();

        // 3. Start the round-robin loop
        this.runLoop();
    }

    private async loadActivePrograms(): Promise<void> {
        // Refresh the materialized view first
        await this.pool.query('SELECT refresh_active_subscriptions()');

        const result = await this.pool.query(
            'SELECT program_id, chain, subscribers FROM active_program_subscriptions'
        );

        for (const row of result.rows) {
            await this.addProgram(row.program_id, row.subscribers);
        }
    }

    private async addProgram(programId: string, subscribersJson: object[]): Promise<void> {
        if (this.programs.has(programId)) {
            // Update subscribers list
            this.programs.get(programId)!.subscribers = this.parseSubscribers(subscribersJson);
            return;
        }

        const subscribers = this.parseSubscribers(subscribersJson);

        // Use the first subscriber's IDL as the canonical IDL for decoding
        // (All subscribers for the same program have the same IDL)
        const canonicalSub = subscribers[0];
        const parsedIdl = parseIDL(canonicalSub.idl as AnchorIDL);

        const poller = new TransactionPoller(
            this.connection,
            new PublicKey(programId),
            { pollIntervalMs: 0, batchSize: 25 }  // interval managed by orchestrator
        );

        // Resume from the most advanced cursor across all subscribers
        const maxSlotSub = await this.getMostAdvancedState(subscribers);
        if (maxSlotSub?.lastSignature) {
            poller.setLastSignature(maxSlotSub.lastSignature);
        }

        const decoder = new EventDecoder(parsedIdl, canonicalSub.idl as AnchorIDL);
        const fanoutWriter = new FanoutWriter(this.pool);

        this.programs.set(programId, {
            programId,
            poller,
            decoder,
            fanoutWriter,
            parsedIdl,
            subscribers,
        });
    }

    private async runLoop(): Promise<void> {
        while (this.running) {
            const programList = Array.from(this.programs.values());

            for (const program of programList) {
                if (!this.running) break;

                try {
                    const txs = await program.poller.poll();
                    if (txs.length > 0) {
                        const events = [];
                        for (const tx of txs) {
                            events.push(...program.decoder.decodeTransaction(tx));
                        }

                        if (events.length > 0) {
                            await program.fanoutWriter.writeToSubscribers(
                                program.programId,
                                events,
                                [],
                                program.subscribers
                            );
                        }
                    }
                } catch (err) {
                    console.error(`[Orchestrator] Error polling ${program.programId}: ${(err as Error).message}`);
                }

                // Small delay between programs to avoid RPC rate limits
                await sleep(this.interProgramDelayMs);
            }

            // Wait before next full cycle
            if (this.running) {
                await sleep(this.cycleIntervalMs);
            }
        }
    }

    private async listenForChanges(): Promise<void> {
        const client = await this.pool.connect();
        await client.query('LISTEN uho_program_changes');

        client.on('notification', async (msg) => {
            if (msg.channel !== 'uho_program_changes') return;

            const change = JSON.parse(msg.payload!);
            console.log(`[Orchestrator] Program change: ${change.action} ${change.program_id}`);

            // Reload active programs from materialized view
            await this.pool.query('SELECT refresh_active_subscriptions()');
            await this.loadActivePrograms();

            // Remove programs that are no longer active
            for (const [pid] of this.programs) {
                const result = await this.pool.query(
                    'SELECT 1 FROM active_program_subscriptions WHERE program_id = $1',
                    [pid]
                );
                if (result.rows.length === 0) {
                    this.programs.delete(pid);
                    console.log(`[Orchestrator] Removed program ${pid}`);
                }
            }
        });
    }

    async stop(): Promise<void> {
        this.running = false;
        // Pollers stop naturally (no internal loop)
    }
}

interface ActiveProgram {
    programId: string;
    poller: TransactionPoller;
    decoder: EventDecoder;
    fanoutWriter: FanoutWriter;
    parsedIdl: ParsedIDL;
    subscribers: SubscriberInfo[];
}
```

### 7.4 Fan-Out: Writing to Multiple User Schemas

```typescript
// src/ingestion/fanout-writer.ts

export class FanoutWriter {
    constructor(private pool: pg.Pool) {}

    async writeToSubscribers(
        programId: string,
        events: DecodedEvent[],
        instructions: DecodedInstruction[],
        subscribers: SubscriberInfo[]
    ): Promise<WriteResult> {
        const result: WriteResult = { totalWritten: 0, perSubscriber: {} };

        for (const sub of subscribers) {
            try {
                // Filter events to only those the subscriber has enabled
                const enabledEvents = events.filter(e =>
                    sub.enabledEvents.includes(e.eventName)
                );

                if (enabledEvents.length === 0 && instructions.length === 0) continue;

                // Write to subscriber's schema
                const writer = new EventWriter(this.pool, sub.parsedIdl, sub.schemaName);
                const written = await writer.writeEvents(enabledEvents);

                result.perSubscriber[sub.userId] = written;
                result.totalWritten += written;

                // Update _uho_state in subscriber's schema
                if (events.length > 0) {
                    const latestSlot = Math.max(...events.map(e => e.slot));
                    const currentState = await writer.getState(programId);
                    await writer.updateState(programId, {
                        lastSlot: latestSlot,
                        eventsIndexed: (currentState?.eventsIndexed ?? 0) + written,
                        lastPollAt: new Date(),
                    });
                }
            } catch (err) {
                console.error(`[FanoutWriter] Error writing to ${sub.schemaName}: ${(err as Error).message}`);
                // Continue to other subscribers — don't let one failure block all
            }
        }

        // Send PG NOTIFY for WebSocket/webhook fanout
        if (result.totalWritten > 0) {
            await this.notifyNewEvents(programId, events, subscribers);
        }

        return result;
    }

    private async notifyNewEvents(
        programId: string,
        events: DecodedEvent[],
        subscribers: SubscriberInfo[]
    ): Promise<void> {
        // Send one notification per event (batched if many)
        // Keep payload small — just enough for WS/webhook matching
        const payload = JSON.stringify({
            programId,
            events: events.map(e => ({
                eventName: e.eventName,
                slot: e.slot,
                txSignature: e.txSignature,
                data: e.data,
            })),
            subscribers: subscribers.map(s => s.userId),
        });

        // PG NOTIFY has a ~8000 byte payload limit
        // If payload too large, split into chunks
        if (payload.length < 7500) {
            await this.pool.query("SELECT pg_notify('uho_events', $1)", [payload]);
        } else {
            // Send individual event notifications
            for (const event of events) {
                const smallPayload = JSON.stringify({
                    programId,
                    events: [{
                        eventName: event.eventName,
                        slot: event.slot,
                        txSignature: event.txSignature,
                        data: event.data,
                    }],
                    subscribers: subscribers.map(s => s.userId),
                });
                await this.pool.query("SELECT pg_notify('uho_events', $1)", [smallPayload]);
            }
        }
    }
}
```

### 7.5 How New Programs Are Picked Up

1. User calls `POST /api/v1/programs` → API creates `user_programs` row
2. The `trg_user_programs_change` trigger fires `pg_notify('uho_program_changes', ...)`
3. Orchestrator's PG listener receives the notification
4. Orchestrator calls `refresh_active_subscriptions()` to refresh the materialized view
5. Orchestrator calls `loadActivePrograms()` which reads the view and updates the registry
6. If the program ID is new, a new poller is created and added to the round-robin
7. If the program ID already exists (another user has it), the subscriber list is updated

**Latency:** New programs are picked up within ~5 seconds (next notification cycle).

---

## 8. WebSocket Subscription Design

### 8.1 Server Setup

```typescript
// src/websocket/ws-server.ts

import Fastify from 'fastify';
import websocket from '@fastify/websocket';

export async function createWsServer(pool: pg.Pool, config: PlatformConfig): Promise<FastifyInstance> {
    const app = Fastify({ logger: true });
    await app.register(websocket);

    const subscriptionManager = new SubscriptionManager();
    const pgListener = new PgEventListener(pool, (event) => {
        subscriptionManager.broadcast(event);
    });
    await pgListener.start();

    // Also start webhook delivery from the same listener
    const webhookService = new WebhookService(pool);
    const webhookListener = new PgEventListener(pool, async (event) => {
        for (const eventData of event.events) {
            await webhookService.deliverEvent({
                programId: event.programId,
                ...eventData,
                subscribers: event.subscribers,
            });
        }
    });
    await webhookListener.start();

    app.get('/ws', { websocket: true }, (socket, request) => {
        handleWsConnection(socket, request, pool, subscriptionManager);
    });

    return app;
}
```

### 8.2 Connection Authentication

Authentication happens in the first message after connection, or via query parameter:

```
Connect: wss://api.uho.dev/ws?token=<jwt>
   OR
Connect: wss://api.uho.dev/ws?apiKey=uho_sk_...
   OR
Connect: wss://api.uho.dev/ws
→ First message: { "action": "auth", "token": "<jwt>" }
→ First message: { "action": "auth", "apiKey": "uho_sk_..." }
```

```typescript
async function handleWsConnection(
    socket: WebSocket,
    request: FastifyRequest,
    pool: pg.Pool,
    manager: SubscriptionManager
): Promise<void> {
    const query = request.query as Record<string, string>;
    let auth: AuthPayload | null = null;

    // Try query param auth
    if (query.token) {
        auth = verifyAccessToken(query.token);
    } else if (query.apiKey) {
        auth = await validateApiKey(query.apiKey, pool);
    }

    // If no query auth, wait for first message
    if (!auth) {
        const timeout = setTimeout(() => {
            socket.send(JSON.stringify({ type: 'error', message: 'Auth timeout' }));
            socket.close(4001, 'Authentication timeout');
        }, 10000);

        socket.once('message', async (data) => {
            clearTimeout(timeout);
            const msg = JSON.parse(data.toString());
            if (msg.action === 'auth') {
                if (msg.token) auth = verifyAccessToken(msg.token);
                else if (msg.apiKey) auth = await validateApiKey(msg.apiKey, pool);
            }
            if (!auth) {
                socket.send(JSON.stringify({ type: 'error', message: 'Invalid credentials' }));
                socket.close(4001, 'Authentication failed');
                return;
            }
            setupAuthenticatedConnection(socket, auth, manager);
        });
        return;
    }

    setupAuthenticatedConnection(socket, auth, manager);
}

function setupAuthenticatedConnection(
    socket: WebSocket,
    auth: AuthPayload,
    manager: SubscriptionManager
): void {
    const clientId = crypto.randomUUID();

    // Check concurrent connection limit (5 per user)
    if (manager.getUserClientCount(auth.userId) >= 5) {
        socket.send(JSON.stringify({ type: 'error', message: 'Connection limit reached' }));
        socket.close(4002, 'Too many connections');
        return;
    }

    manager.addClient(clientId, auth.userId, socket);

    socket.send(JSON.stringify({ type: 'authenticated', clientId }));

    socket.on('message', (data) => {
        const msg: WsClientMessage = JSON.parse(data.toString());
        handleClientMessage(clientId, msg, manager);
    });

    socket.on('close', () => {
        manager.removeClient(clientId);
    });

    // Heartbeat: ping every 30s
    const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
        }
    }, 30000);

    socket.on('close', () => clearInterval(pingInterval));
}
```

### 8.3 Subscription Protocol

#### Client → Server Messages

```typescript
// Subscribe to events
{
    "action": "subscribe",
    "programs": ["sample_dex"],              // optional: filter by program name
    "events": ["swap_event"],                // optional: filter by event name
    "filters": {                             // optional: field-level filters
        "input_mint": "So111..."
    }
}
// Server response:
{
    "type": "subscribed",
    "subscriptionId": "sub_abc123"
}

// Unsubscribe
{
    "action": "unsubscribe",
    "id": "sub_abc123"
}
// Server response:
{
    "type": "unsubscribed",
    "subscriptionId": "sub_abc123"
}

// Ping (client-side keepalive)
{
    "action": "ping"
}
// Server response:
{
    "type": "pong",
    "timestamp": "2026-02-05T20:00:00Z"
}
```

#### Server → Client Messages

```typescript
// Event push
{
    "type": "event",
    "subscriptionId": "sub_abc123",
    "program": "sample_dex",
    "event": "swap_event",
    "data": {
        "amm": "...",
        "input_mint": "So111...",
        "input_amount": "1000000",
        "output_mint": "EPjF...",
        "output_amount": "500000"
    },
    "slot": 298765432,
    "txSignature": "5abc...",
    "timestamp": "2026-02-05T20:00:00.123Z"
}

// Error
{
    "type": "error",
    "message": "Invalid subscription filter",
    "code": "INVALID_FILTER"
}
```

### 8.4 PG NOTIFY → WebSocket Fan-Out

```typescript
// src/websocket/subscription-manager.ts

interface ClientState {
    clientId: string;
    userId: string;
    ws: WebSocket;
    subscriptions: Map<string, WsSubscription>;  // subId → subscription
}

export class SubscriptionManager {
    private clients = new Map<string, ClientState>();
    private userClientCount = new Map<string, number>();

    addClient(clientId: string, userId: string, ws: WebSocket): void {
        this.clients.set(clientId, { clientId, userId, ws, subscriptions: new Map() });
        this.userClientCount.set(userId, (this.userClientCount.get(userId) ?? 0) + 1);
    }

    removeClient(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            const count = (this.userClientCount.get(client.userId) ?? 1) - 1;
            if (count <= 0) this.userClientCount.delete(client.userId);
            else this.userClientCount.set(client.userId, count);
        }
        this.clients.delete(clientId);
    }

    subscribe(clientId: string, sub: WsSubscription): string {
        const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
        const client = this.clients.get(clientId);
        if (client) {
            client.subscriptions.set(subId, sub);
        }
        return subId;
    }

    unsubscribe(clientId: string, subId: string): void {
        this.clients.get(clientId)?.subscriptions.delete(subId);
    }

    /**
     * Called when a PG NOTIFY event arrives.
     * Matches against all client subscriptions and sends to matching ones.
     */
    broadcast(notification: PgNotifyPayload): void {
        for (const [, client] of this.clients) {
            // Only send to users who are subscribers of this program
            if (!notification.subscribers.includes(client.userId)) continue;

            for (const [subId, sub] of client.subscriptions) {
                for (const event of notification.events) {
                    if (this.matchesSubscription(event, sub, notification.programId)) {
                        const message: WsServerMessage = {
                            type: 'event',
                            subscriptionId: subId,
                            program: notification.programId,  // TODO: resolve to name
                            event: event.eventName,
                            data: event.data,
                            slot: event.slot,
                            txSignature: event.txSignature,
                            timestamp: new Date().toISOString(),
                        };

                        try {
                            client.ws.send(JSON.stringify(message));
                        } catch {
                            // Client disconnected, will be cleaned up
                        }
                    }
                }
            }
        }
    }

    private matchesSubscription(
        event: { eventName: string; data: Record<string, unknown> },
        sub: WsSubscription,
        programId: string
    ): boolean {
        // Check program filter
        if (sub.programs?.length && !sub.programs.includes(programId)) return false;

        // Check event filter
        if (sub.events?.length && !sub.events.includes(event.eventName)) return false;

        // Check field filters
        if (sub.filters) {
            for (const [key, value] of Object.entries(sub.filters)) {
                if (event.data[key] !== value) return false;
            }
        }

        return true;
    }

    getUserClientCount(userId: string): number {
        return this.userClientCount.get(userId) ?? 0;
    }

    getClientCount(): number {
        return this.clients.size;
    }
}
```

### 8.5 Backpressure

If a client's WebSocket buffer grows beyond 100 messages (client is slow), the server:

1. Drops the oldest buffered messages
2. Sends a gap notification:
   ```json
   {
       "type": "error",
       "code": "BUFFER_OVERFLOW",
       "message": "Dropped 15 events due to slow consumption"
   }
   ```
3. If buffer repeatedly overflows (10 times in 1 minute), closes the connection with code `4003`.

---

## 9. Webhook Design

### 9.1 Webhook Registration

When a user creates a webhook via `POST /api/v1/webhooks`:

1. Validate the URL (must be HTTPS in production)
2. Generate a 64-char hex HMAC signing secret
3. Store webhook config in `webhooks` table
4. Return the secret to the user (shown once, like API keys)
5. Optionally: send a test `ping` event to the URL for verification

### 9.2 Event Delivery

Webhook delivery is handled by the WebSocket service (which already listens on PG NOTIFY):

```
PG NOTIFY('uho_events', payload)
         │
         ▼
PgEventListener (in WS service)
         │
         ▼
WebhookService.deliverEvent()
         │
         ▼
1. Load all active webhooks for the subscriber users
2. For each webhook, check if the event matches:
   - Does the event name match the webhook's events[] filter?
   - Do the event's fields match the webhook's filters?
3. If match: HTTP POST to webhook URL
```

### 9.3 HTTP Delivery Format

```http
POST https://user-server.com/webhooks/uho
Content-Type: application/json
X-Uho-Signature: sha256=<hmac_hex>
X-Uho-Event: swap_event
X-Uho-Delivery-Id: <uuid>
X-Uho-Timestamp: 1706140000
User-Agent: Uho-Webhook/1.0

{
    "id": "del_abc123",
    "event": "swap_event",
    "program": "sample_dex",
    "programId": "Dex111...",
    "data": {
        "amm": "...",
        "input_mint": "So111...",
        "input_amount": "1000000",
        "output_mint": "EPjF...",
        "output_amount": "500000"
    },
    "slot": 298765432,
    "txSignature": "5abc...",
    "timestamp": "2026-02-05T20:00:00.123Z"
}
```

### 9.4 Signature Verification (User's Server)

```typescript
// User verifies the webhook signature:
import crypto from 'crypto';

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
    const expected = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return `sha256=${expected}` === signature;
}
```

### 9.5 Retry Logic

| Attempt | Delay | Max Time |
|---------|-------|----------|
| 1 | Immediate | 0s |
| 2 | 30 seconds | 30s |
| 3 | 2 minutes | 2.5min |
| 4 | 10 minutes | 12.5min |
| 5 | 1 hour | 1h 12.5min |

**Implementation:**

```typescript
const RETRY_DELAYS = [0, 30_000, 120_000, 600_000, 3_600_000];

async function deliverWithRetry(webhook: WebhookRecord, payload: object): Promise<boolean> {
    const body = JSON.stringify(payload);
    const signature = signPayload(body, webhook.secret);

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAYS[attempt]);

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Uho-Signature': `sha256=${signature}`,
                    'X-Uho-Event': payload.event,
                    'X-Uho-Delivery-Id': crypto.randomUUID(),
                    'X-Uho-Timestamp': String(Math.floor(Date.now() / 1000)),
                    'User-Agent': 'Uho-Webhook/1.0',
                },
                body,
                signal: AbortSignal.timeout(10_000),  // 10s timeout per attempt
            });

            // Log delivery attempt
            await logDelivery(webhook.id, payload.event, payload, response.status, attempt + 1, response.ok);

            if (response.ok) {
                // Reset failure count
                await resetFailureCount(webhook.id);
                return true;
            }

            // 4xx errors (except 429) are permanent — don't retry
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                await incrementFailureCount(webhook.id);
                return false;
            }
        } catch (err) {
            await logDelivery(webhook.id, payload.event, payload, 0, attempt + 1, false);
        }
    }

    // All retries exhausted
    await incrementFailureCount(webhook.id);

    // Auto-disable after 10 consecutive failures
    const webhook_updated = await getWebhook(webhook.id);
    if (webhook_updated && webhook_updated.failureCount >= 10) {
        await disableWebhook(webhook.id);
    }

    return false;
}
```

### 9.6 Webhook Lifecycle

- **Active:** Delivers events normally
- **Failed (1-9):** Still active, failure count tracked
- **Auto-disabled (10+ failures):** `active` set to `false`, user notified (via email? or just visible in dashboard)
- **User re-enables:** Resets failure count, user can test with a ping

---

## 10. Implementation Order

### 10.1 Backend Tasks (ordered)

| # | Task | Dependencies | Est. |
|---|------|-------------|------|
| **B1** | Platform config (`platform-config.ts`, `errors.ts`) | — | 0.5d |
| **B2** | DB modifications (`db.ts` changes, `createUserSchema`, `withUserSchema`) | B1 | 0.5d |
| **B3** | Migration system + all SQL migrations | B2 | 1d |
| **B4** | Auth core (`jwt.ts`, `passwords.ts`, `api-keys.ts`, `email.ts`) | B1 | 1d |
| **B5** | Auth middleware (`auth.ts`, `schema.ts`) | B4, B2 | 1d |
| **B6** | User service + auth routes (`user-service.ts`, `auth-routes.ts`) | B5, B3 | 1.5d |
| **B7** | Program service + routes (`program-service.ts`, `program-routes.ts`) | B6, B2 | 1.5d |
| **B8** | Schema generator modifications (schema-prefix support) | B2 | 0.5d |
| **B9** | Data routes (`data-routes.ts`) — user-scoped queries | B5, B7, B8 | 1d |
| **B10** | API server modifications (`server.ts` platform mode) | B5, B6, B7, B9 | 1d |
| **B11** | Rate limiting + usage tracking middleware | B5 | 1d |
| **B12** | User routes (`user-routes.ts` — profile, API key management) | B6 | 0.5d |
| **B13** | Indexer orchestrator (`orchestrator.ts`, `fanout-writer.ts`) | B8, B3 | 2d |
| **B14** | `writer.ts` modifications (schema prefix support) | B2 | 0.5d |
| **B15** | IDL discovery service (`idl-discovery.ts`) | B7 | 1d |
| **B16** | View service + routes (`view-service.ts`, `view-routes.ts`) | B9, B7 | 1.5d |
| **B17** | WebSocket server + subscription manager | B13 | 2d |
| **B18** | PG listener for WebSocket fanout | B17, B13 | 0.5d |
| **B19** | Webhook service + routes (`webhook-service.ts`, `webhook-routes.ts`) | B18, B7 | 1.5d |
| **B20** | Webhook delivery + retry logic | B19 | 1d |
| **B21** | CLI platform commands (`platform.ts`, index.ts changes) | B10, B13, B17 | 0.5d |
| **B22** | Integration testing (auth → program → data → WS → webhook flow) | All | 2d |

**Total backend estimate:** ~20 dev-days

### 10.2 Frontend Tasks (ordered)

| # | Task | Dependencies | Est. |
|---|------|-------------|------|
| **F1** | Auth lib (`auth.ts` — token storage, refresh logic) | — | 0.5d |
| **F2** | API client modifications (`api.ts` — auth headers, auto-refresh) | F1 | 1d |
| **F3** | Auth components (`login-form`, `register-form`, `verify-form`) | F1 | 1d |
| **F4** | Auth pages (`/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`) | F3 | 0.5d |
| **F5** | Auth provider + guard (`auth-provider.tsx`, `auth-guard.tsx`) | F1, F2 | 0.5d |
| **F6** | Layout restructuring (auth layout, dashboard layout, route groups) | F5 | 1d |
| **F7** | Sidebar updates (new nav items, user menu) | F5 | 0.5d |
| **F8** | Dashboard page migration to `/dashboard` route | F6 | 0.5d |
| **F9** | Settings page — profile form + API key management | F2, F6 | 1.5d |
| **F10** | Programs page — list with status controls | F2, F6 | 1d |
| **F11** | Add program page — form + IDL upload + discovery | F10 | 2d |
| **F12** | Program detail page — status, events, charts | F10 | 1.5d |
| **F13** | Event explorer — update to use authenticated API | F2, F8 | 0.5d |
| **F14** | Views pages — list + create wizard + results table | F2, F10 | 2d |
| **F15** | Webhooks pages — list + create form + delivery log | F2, F10 | 1.5d |
| **F16** | WebSocket hook (`use-websocket.ts`) | F2 | 1d |
| **F17** | New UI components (modal, tabs, toast, dropdown) | — | 1d |
| **F18** | Usage display on settings/dashboard | F2 | 0.5d |
| **F19** | Polish: empty states, loading states, error handling | All | 1.5d |

**Total frontend estimate:** ~18 dev-days

### 10.3 Parallelization Plan

```
Week 1:
  Backend:  B1 → B2 → B3 → B4 → B5
  Frontend: F1 → F2 → F3 → F4 → F5 → F17

Week 2:
  Backend:  B6 → B7 → B8 → B9 → B10 → B11 → B12
  Frontend: F6 → F7 → F8 → F9 → F10

Week 3:
  Backend:  B13 → B14 → B15 → B16
  Frontend: F11 → F12 → F13 → F14

Week 4:
  Backend:  B17 → B18 → B19 → B20 → B21
  Frontend: F15 → F16 → F18 → F19

Week 5:
  Backend:  B22 (integration testing)
  Frontend: F19 (polish + e2e testing)
```

### 10.4 Critical Path

The longest dependency chain is:

```
B1 → B2 → B3 → B5 → B6 → B7 → B9 → B10 → B13 → B17 → B18 → B19 → B22
```

This is ~16 dev-days, forming the minimum calendar time (if one backend dev).

### 10.5 What Can Be Parallelized

| Backend | Frontend | Notes |
|---------|----------|-------|
| B1-B5 (core + auth) | F1-F5 (auth client) | Frontend only needs API contract, not running backend |
| B6-B7 (services) | F6-F8 (layout) | Layout restructuring is independent |
| B13 (orchestrator) | F10-F12 (programs UI) | Programs UI works against B7 APIs |
| B17-B18 (WebSocket) | F14-F15 (views + webhooks UI) | UI for views/webhooks works against B16/B19 APIs |
| B22 (integration) | F19 (polish) | Both are final-phase |

**Key dependency:** Frontend data pages (F13) need backend data routes (B9) to be functional. Frontend auth pages (F4) need backend auth routes (B6). Plan backend to stay ~1 week ahead of frontend.

---

## Appendix A: Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UHO_MODE` | No | `cli` | Set to `platform` for multi-tenant mode |
| `DATABASE_URL` | Yes (platform) | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes (platform) | — | HMAC secret for access tokens (64+ chars) |
| `JWT_REFRESH_SECRET` | Yes (platform) | — | HMAC secret for refresh tokens (64+ chars) |
| `RESEND_API_KEY` | Yes (platform) | — | Resend API key for transactional email |
| `HELIUS_API_KEY` | No | — | Helius RPC API key (better rate limits) |
| `API_PORT` | No | `3010` | API server port |
| `WS_PORT` | No | `3012` | WebSocket server port |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `LOG_LEVEL` | No | `info` | Pino log level |

## Appendix B: Free Tier Limits

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Programs per user | 1 | Checked in `POST /api/v1/programs` |
| Events indexed | 1,000 total | Checked in indexer before write |
| API calls per month | 50,000 | Checked in usage middleware |
| WebSocket connections | 5 concurrent | Checked in subscription manager |
| Custom views | 3 | Checked in `POST /api/v1/views` |
| Webhooks | 3 | Checked in `POST /api/v1/webhooks` |
| API keys | 2 | Checked in `POST /api/v1/user/api-keys` |
| IDL upload size | 5 MB | Validated in program routes |

## Appendix C: PG NOTIFY Payload Formats

### `uho_events` channel

```json
{
    "programId": "Dex111...",
    "events": [
        {
            "eventName": "swap_event",
            "slot": 298765432,
            "txSignature": "5abc...",
            "data": { "input_mint": "So111...", "input_amount": "1000000" }
        }
    ],
    "subscribers": ["userId-1", "userId-2"]
}
```

### `uho_program_changes` channel

```json
{
    "action": "INSERT",
    "program_id": "Dex111...",
    "user_id": "a1b2c3d4-...",
    "status": "provisioning"
}
```

---

*Architecture document written 2026-02-05. Ready for implementation.*