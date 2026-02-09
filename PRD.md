# Uho — Product Requirements Document (PRD)

> **Version:** 1.0  
> **Date:** 2026-02-05  
> **Author:** Product (drafted by PO agent, pending founder review)  
> **Status:** DRAFT — Open questions at the end require founder (Z) input

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Priority Tiers](#3-priority-tiers)
4. [Feature Specifications](#4-feature-specifications)
   - 4.1 [User System & Authentication](#41-user-system--authentication)
   - 4.2 [API Key Management](#42-api-key-management)
   - 4.3 [Program Configuration & IDL Discovery](#43-program-configuration--idl-discovery)
   - 4.4 [Multi-Tenant Data Model](#44-multi-tenant-data-model)
   - 4.5 [Dashboard & Data Viewing](#45-dashboard--data-viewing)
   - 4.6 [Authenticated API](#46-authenticated-api)
   - 4.7 [Custom Data Shaping](#47-custom-data-shaping)
   - 4.8 [Subscription / Streaming](#48-subscription--streaming)
5. [Data Model & Multi-Tenancy](#5-data-model--multi-tenancy)
6. [API Contract](#6-api-contract)
7. [Security Requirements](#7-security-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Migration & Backward Compatibility](#9-migration--backward-compatibility)
10. [Open Questions](#10-open-questions)

---

## 1. Executive Summary

Uho is evolving from a single-user, CLI-configured Solana event indexer into a **multi-tenant platform** where users can register, configure indexers for arbitrary Solana programs, consume data through a dashboard and authenticated API, and subscribe to real-time event streams.

**Core value proposition:** *Give any developer a typed, queryable, streamable API for any Anchor program's events — without writing a single decoder, schema, or backend.*

### Scope

This PRD covers the full transformation. Implementation is phased into three priority tiers:

| Tier | Label | Goal |
|------|-------|------|
| **P0** | MVP Must-Have | Multi-tenant auth, program config UI, data isolation, authenticated API, dashboard |
| **P1** | Important | Custom data shaping, API key management, IDL auto-discovery |
| **P2** | Nice-to-Have | Streaming/subscriptions (JSON + gRPC), advanced views, usage analytics |

---

## 2. Current State Analysis

### What Exists

| Layer | Current | Implication |
|-------|---------|-------------|
| **Config** | Single `uho.yaml` file | No concept of users or ownership |
| **Database** | One PG instance, tables named `{program}_{event}` | No tenant isolation; all data in one flat namespace |
| **Indexer** | One poller per program, decoded events written directly | Must support multiple pollers per user without conflict |
| **API** | `/api/v1/{program}/{event}` with open access | No auth, no scoping — anyone who knows the URL can read everything |
| **Frontend** | Next.js dashboard showing all indexed data | No login, no user-specific views |
| **CLI** | `uho init`, `uho start`, `uho schema --apply` | Stays as-is for self-hosted users; platform adds web-based equivalent |

### Key Types & Patterns to Preserve

- `ParsedIDL`, `ParsedEvent`, `ParsedField` — the normalized IDL structures drive schema generation and route creation. These must not change.
- `UhoConfig` / `ProgramConfig` — currently loaded from YAML. For multi-tenant, equivalent config is stored in the database per user.
- `registerEventRoutes()` / `registerInstructionRoutes()` — auto-generated from parsed IDL. Must be extended with auth middleware and tenant scoping.
- `buildWhereClause()` — the safe query builder. Must be extended to always include a tenant filter.

---

## 3. Priority Tiers

### P0 — MVP Must-Have

| ID | Feature | Rationale |
|----|---------|-----------|
| P0-1 | User registration & login (email + password) | Gate the entire platform |
| P0-2 | Auth-gated frontend (all pages require login) | Requirement #2 |
| P0-3 | Program configuration via UI (program ID + IDL upload) | Requirement #3 core |
| P0-4 | Per-user data isolation in database | Requirement #7 |
| P0-5 | Dashboard showing user's own indexed data | Requirement #4 |
| P0-6 | Authenticated REST API with session tokens | Requirement #5 |
| P0-7 | API key generation (at least 1 key per user) | Requirement #8 |

### P1 — Important

| ID | Feature | Rationale |
|----|---------|-----------|
| P1-1 | IDL auto-discovery from on-chain / Solscan | Requirement #3 enhanced UX |
| P1-2 | Multiple API keys per user with labels + revocation | Operational need |
| P1-3 | Custom field selection (exclude fields from indexing) | Requirement #6 partial |
| P1-4 | Event filtering / whitelist per program config | Already partially supported in YAML |
| P1-5 | Usage metrics (API calls, events indexed, storage) | Operational visibility |
| P1-6 | Program management (pause, resume, delete indexer) | Lifecycle management |

### P2 — Nice-to-Have

| ID | Feature | Rationale |
|----|---------|-----------|
| P2-1 | Custom views / aggregations (e.g., "users from swap events") | Requirement #6 advanced |
| P2-2 | Real-time subscription endpoint (JSON over WebSocket) | Requirement #9 partial |
| P2-3 | gRPC streaming endpoint (Yellowstone-inspired) | Requirement #9 full |
| P2-4 | Webhook delivery for events | Common integration pattern |
| P2-5 | Team / organization support (shared indexers) | Growth feature |
| P2-6 | OAuth / social login (Google, GitHub) | UX convenience |
| P2-7 | Rate limit tiers & paid plans | Monetization |

---

## 4. Feature Specifications

### 4.1 User System & Authentication

**Priority:** P0

#### User Stories

**US-1.1: Registration**
> As a new user, I want to create an account with email and password so I can start configuring indexers.

**Acceptance Criteria:**
- [ ] Registration form: email, password, confirm password
- [ ] Email validation (format + uniqueness)
- [ ] Password requirements: min 8 chars, at least 1 number and 1 letter
- [ ] Email verification via OTP or magic link (configurable)
- [ ] On successful registration, user is logged in and redirected to onboarding
- [ ] Duplicate email returns clear error message

**US-1.2: Login**
> As a registered user, I want to log in with email and password to access my dashboard and data.

**Acceptance Criteria:**
- [ ] Login form: email, password
- [ ] On success: JWT issued (access token + refresh token), redirected to dashboard
- [ ] On failure: generic "Invalid credentials" (no email enumeration)
- [ ] "Forgot password" link → password reset flow via email
- [ ] Session persists across browser refreshes (refresh token in httpOnly cookie)

**US-1.3: Auth Gate**
> As the platform, I must ensure no unauthenticated access to any page or API endpoint (except login/register and public health check).

**Acceptance Criteria:**
- [ ] All frontend routes redirect to `/login` if no valid session
- [ ] All API routes (except `/api/v1/health`, `/auth/*`) return `401 Unauthorized` without valid token
- [ ] Expired tokens return `401` with a machine-readable code so the client can refresh

#### Auth Flow Design

```
Registration:
  POST /auth/register { email, password }
    → Create user record (password hashed with bcrypt/argon2)
    → Send verification email
    → Return { message: "Verification email sent" }

  POST /auth/verify { email, code }
    → Mark user as verified
    → Issue JWT pair
    → Return { accessToken, refreshToken, user }

Login:
  POST /auth/login { email, password }
    → Verify credentials
    → Return { accessToken, refreshToken, user }

Token Refresh:
  POST /auth/refresh { refreshToken }
    → Validate refresh token (stored in DB, not expired, not revoked)
    → Issue new JWT pair
    → Revoke old refresh token (rotation)

Logout:
  POST /auth/logout
    → Revoke refresh token
    → Clear httpOnly cookie
```

**Token Strategy:**
- **Access token:** JWT, 15-minute expiry, contains `{ userId, email }`, stored in memory (frontend)
- **Refresh token:** Opaque string, 30-day expiry, stored in `refresh_tokens` table, sent as httpOnly secure cookie
- **API key:** Separate mechanism (see §4.2), for programmatic access only

#### Database Tables

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  verified      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 4.2 API Key Management

**Priority:** P0 (basic) / P1 (advanced)

#### User Stories

**US-2.1: Generate API Key**
> As a user, I want to generate an API key so I can authenticate programmatic requests to my indexed data.

**Acceptance Criteria:**
- [ ] User can generate a key from the Settings page
- [ ] Key is displayed once in full — user must copy it (never shown again)
- [ ] Key is stored as a hash in the database (never in plaintext after creation)
- [ ] Key has an optional label/name (e.g., "Production Backend")
- [ ] P0: At least 1 key per user. P1: Multiple keys with individual labels and revocation.

**US-2.2: Revoke API Key** *(P1)*
> As a user, I want to revoke an API key so compromised keys stop working immediately.

**Acceptance Criteria:**
- [ ] List of active keys shown (masked: `uho_sk_...last4`)
- [ ] Revoke button with confirmation dialog
- [ ] Revoked key returns `401` on next use (no grace period)

#### Key Format

```
uho_sk_{32 random hex chars}
Example: uho_sk_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

- Prefix `uho_sk_` makes keys identifiable in logs, grep-able, and scannable by secret detection tools.
- Stored as SHA-256 hash in the database.

#### Database Table

```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,          -- "uho_sk_...last4" for display
  label       TEXT DEFAULT '',
  last_used   TIMESTAMPTZ,
  revoked     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE NOT revoked;
```

#### API Authentication Priority

When processing a request, the auth middleware checks (in order):
1. `Authorization: Bearer <jwt_access_token>` — session-based (frontend)
2. `X-API-Key: uho_sk_...` — API key (programmatic)
3. `?apiKey=uho_sk_...` — query param fallback (convenience, lower priority)

If none present → `401 Unauthorized`.

---

### 4.3 Program Configuration & IDL Discovery

**Priority:** P0 (manual config) / P1 (auto-discovery)

#### User Stories

**US-3.1: Add a Program (Manual)**
> As a user, I want to specify a Solana program ID and upload its IDL so Uho starts indexing events for me.

**Acceptance Criteria:**
- [ ] Form with: Program ID (base58 text input), IDL file upload (JSON), optional display name
- [ ] Program ID validated: 32-44 character base58 string
- [ ] IDL validated: must parse as valid Anchor IDL (v0.30+ with `address` field, or Shank IDL)
- [ ] If IDL's `address` field doesn't match provided program ID → warning (user can override)
- [ ] After submission: tables are generated, poller starts, events begin appearing
- [ ] User sees a "Setting up..." state with progress indication
- [ ] Error handling: if IDL parsing fails, show specific error (not generic 500)

**US-3.2: IDL Auto-Discovery** *(P1)*
> As a user, when I enter a program ID, I want Uho to check if the IDL is available on-chain or via known registries, so I don't have to upload it manually.

**Acceptance Criteria:**
- [ ] On program ID input (debounced), system queries:
  1. **Anchor IDL account** — fetch from on-chain (`anchorIdlAddress` derivation)
  2. **Solscan API** — check if program is verified with IDL
  3. **Solana Explorer** — check if IDL is published
- [ ] If IDL found: show preview of discovered events/instructions, let user confirm
- [ ] If multiple sources disagree: show options, let user pick
- [ ] If no IDL found: show message "IDL not found on-chain. Please upload manually." with upload button
- [ ] Discovery results cached (per program ID, 24h TTL)

**IDL Discovery Flow:**

```
User enters Program ID
        │
        ▼
  ┌─ Try on-chain Anchor IDL account
  │   (derive PDA, fetch & decompress)
  │
  ├─ Try Solscan API
  │   GET https://api.solscan.io/v2/program/{id}
  │
  ├─ Try Anchor Verifiable Build registry
  │
  └─ No IDL found → prompt manual upload
        │
        ▼
  IDL found → Parse → Show event/instruction preview
        │
        ▼
  User confirms → Create indexer config → Start polling
```

**US-3.3: Select Events to Index**
> As a user, I want to choose which events from the IDL to index, so I don't store data I don't need.

**Acceptance Criteria:**
- [ ] After IDL is loaded, show list of all events and instructions with their fields
- [ ] Checkboxes to select/deselect individual events
- [ ] Default: all events selected
- [ ] At least one event must be selected
- [ ] User can change selection later (adding events starts indexing them; removing stops + optionally drops data)

#### Database Table

```sql
CREATE TABLE user_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id  TEXT NOT NULL,              -- Solana program ID (base58)
  name        TEXT NOT NULL,              -- User-given or IDL-derived name
  idl         JSONB NOT NULL,             -- Full IDL stored for re-parsing
  chain       TEXT NOT NULL DEFAULT 'solana-mainnet',
  status      TEXT NOT NULL DEFAULT 'provisioning',  -- provisioning | running | paused | error | deleted
  config      JSONB DEFAULT '{}',         -- Extra config (poll interval, batch size, start slot, etc.)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, program_id)             -- One indexer per program per user
);

CREATE TABLE user_program_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_program_id UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
  event_name      TEXT NOT NULL,
  event_type      TEXT NOT NULL DEFAULT 'event',  -- 'event' | 'instruction'
  enabled         BOOLEAN DEFAULT true,
  field_config    JSONB DEFAULT '{}',     -- P1: field selection/exclusion
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_program_id, event_name, event_type)
);
```

---

### 4.4 Multi-Tenant Data Model

**Priority:** P0

This is the architectural backbone. Every data table, every query, every API response must be scoped to the requesting user.

#### Tenancy Strategy: **Schema-per-user within shared database**

After evaluating three approaches:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Shared tables + `user_id` column** | Simple, fewer tables | Every query needs `WHERE user_id=...`, index bloat, risk of data leaks | ❌ Risky at scale |
| **Schema-per-user** | Strong isolation, clean namespace, PG Row Level Security optional | More schemas to manage, migration complexity | ✅ **Recommended** |
| **Database-per-user** | Maximum isolation | Operationally expensive, connection pool explosion | ❌ Overkill for MVP |

#### Implementation

Each user gets a PostgreSQL schema named `u_{userId_short}` (first 8 chars of UUID, collision-checked):

```sql
-- On user registration:
CREATE SCHEMA u_a1b2c3d4;

-- Event tables live inside:
-- u_a1b2c3d4.sample_dex__swap_event
-- u_a1b2c3d4.sample_dex__transfer_event
-- u_a1b2c3d4._uho_state
```

**Benefits:**
- `SET search_path = u_a1b2c3d4` at connection start → all existing queries work unchanged
- No accidental cross-tenant data leaks (schema boundary is enforced by PG)
- PG's `GRANT` system can restrict access per schema
- Existing `eventTableName()` / `instructionTableName()` functions unchanged
- Straightforward backup/restore per tenant

**Shared `public` schema** retains:
- `users` table
- `api_keys` table
- `refresh_tokens` table
- `email_verifications` table
- `user_programs` table
- `user_program_events` table
- Platform metadata

#### Query Scoping

Every database connection from the API or indexer sets the schema:

```typescript
// In middleware, after auth resolves userId:
await pool.query(`SET search_path TO u_${userSchemaId}, public`);
```

Or use per-request connection from pool with schema set.

---

### 4.5 Dashboard & Data Viewing

**Priority:** P0

#### User Stories

**US-5.1: Dashboard Overview**
> As a logged-in user, I want to see an overview of my indexers — which programs are running, how many events have been indexed, and overall health.

**Acceptance Criteria:**
- [ ] Stat cards: Programs configured, Total events indexed, Latest slot, Errors (24h)
- [ ] Events/minute throughput chart (per the design system §6.1)
- [ ] List of user's programs with status badges (Running/Syncing/Paused/Error)
- [ ] Latest events feed (last 10 events across all user's programs)
- [ ] Empty state if no programs configured → CTA "Add Your First Program"
- [ ] Must follow design system: dark theme, electric cyan accent, Inter + JetBrains Mono fonts

**US-5.2: Event Explorer**
> As a user, I want to browse, filter, and search through my indexed events in a data table.

**Acceptance Criteria:**
- [ ] Filterable by: program, event type, time range, slot range, any IDL field
- [ ] Sortable by any column
- [ ] Paginated (50 events per page default)
- [ ] Click on event row → detail modal with full JSON data
- [ ] Click on tx signature → opens Solscan/explorer in new tab
- [ ] Copy buttons on addresses and signatures
- [ ] Data shown ONLY for the logged-in user's programs

**US-5.3: Program Detail View**
> As a user, I want to see detailed status and data for a specific program I'm indexing.

**Acceptance Criteria:**
- [ ] Program name, ID (with copy), chain, status
- [ ] Events being indexed (list with individual counts)
- [ ] Start/pause/resume/delete controls
- [ ] Per-event throughput chart
- [ ] Configuration details (poll interval, start slot, etc.)

---

### 4.6 Authenticated API

**Priority:** P0

#### User Stories

**US-6.1: Fetch Data via API**
> As a developer, I want to query my indexed data via authenticated REST endpoints so I can integrate Uho data into my own applications.

**Acceptance Criteria:**
- [ ] Same endpoint pattern as current: `GET /api/v1/{program}/{event}`
- [ ] Requires valid auth (JWT or API key) — see §4.2
- [ ] Returns only data belonging to the authenticated user
- [ ] Supports all existing query params: `limit`, `offset`, `orderBy`, `order`, `from`, `to`, `slotFrom`, `slotTo`, `{field}`
- [ ] Response format unchanged:
  ```json
  {
    "data": [...],
    "pagination": { "limit": 50, "offset": 0, "total": 1234 }
  }
  ```
- [ ] `GET /api/v1/programs` — list user's configured programs
- [ ] `GET /api/v1/status` — returns status scoped to user's programs only

**US-6.2: API Documentation**
> As a developer, I want auto-generated API docs for my specific programs so I know what endpoints and fields are available.

**Acceptance Criteria:**
- [ ] `GET /api/v1/docs` returns OpenAPI/Swagger spec scoped to user's programs
- [ ] Interactive Swagger UI at `/docs` (authenticated)
- [ ] Each endpoint shows available fields, types, and filter options

---

### 4.7 Custom Data Shaping

**Priority:** P1 (field selection) / P2 (views & aggregations)

This is the most architecturally complex feature. Phased approach:

#### Phase 1: Field Selection (P1)

**US-7.1: Exclude Fields from Indexing**
> As a user, I want to exclude specific fields from being indexed so I save storage and reduce noise.

**Acceptance Criteria:**
- [ ] During program setup (or later in settings), user sees field list with toggles
- [ ] Unchecked fields are not stored in the database (column not created, or created but not populated)
- [ ] Changing field selection on an existing indexer:
  - **Adding fields:** Requires re-indexing from start slot (or fields are `NULL` for historical data)
  - **Removing fields:** Column dropped (with confirmation — destructive)
- [ ] API responses reflect the current field selection (excluded fields not returned)

#### Phase 2: Custom Views / Aggregations (P2)

**US-7.2: Create Custom Views**
> As a user, I want to define aggregate views over my events so I can query derived data directly (e.g., "unique traders from swap events").

**Acceptance Criteria:**
- [ ] User defines a view via UI or API:
  ```json
  {
    "name": "active_traders",
    "source": "sample_dex/swap_event",
    "groupBy": "user_wallet",
    "select": {
      "wallet": "user_wallet",
      "total_swaps": { "$count": "*" },
      "total_volume": { "$sum": "input_amount" },
      "first_seen": { "$min": "block_time" },
      "last_seen": { "$max": "block_time" }
    }
  }
  ```
- [ ] View is materialized as a PostgreSQL materialized view (or maintained table)
- [ ] View is queryable via `GET /api/v1/{program}/views/{viewName}`
- [ ] View is refreshed periodically or on new events (configurable)

**Implementation Consideration:**
Custom views are powerful but dangerous (SQL injection, resource abuse). Options:
1. **Predefined templates** — safest. Offer common patterns: "group by field," "count unique," "sum amount."
2. **Declarative DSL** — user specifies `groupBy`, `select` with typed operators. Backend generates safe SQL.
3. **Raw SQL views** — most flexible, most dangerous. Only for advanced tier.

**Recommendation:** Start with predefined templates (P2), evolve to declarative DSL.

#### Database Table

```sql
CREATE TABLE user_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_program_id UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  definition      JSONB NOT NULL,          -- Declarative view definition
  materialized    BOOLEAN DEFAULT false,
  refresh_interval_ms INTEGER DEFAULT 60000,
  last_refreshed  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);
```

---

### 4.8 Subscription / Streaming

**Priority:** P2

Inspired by Yellowstone gRPC but adapted for Uho's use case.

#### User Stories

**US-8.1: WebSocket Subscription (JSON)**
> As a developer, I want to subscribe to real-time events over WebSocket so my application receives new indexed events instantly.

**Acceptance Criteria:**
- [ ] Endpoint: `wss://api.uho.dev/ws`
- [ ] Auth: API key sent as query param or in first message
- [ ] Client sends subscription message:
  ```json
  {
    "action": "subscribe",
    "programs": ["sample_dex"],
    "events": ["swap_event"],
    "filters": {
      "input_mint": "So111..."
    }
  }
  ```
- [ ] Server pushes matching events as they're indexed:
  ```json
  {
    "type": "event",
    "program": "sample_dex",
    "event": "swap_event",
    "data": { ... },
    "slot": 245892100,
    "txSignature": "5KtP..."
  }
  ```
- [ ] Client can update subscriptions without reconnecting
- [ ] Heartbeat/ping-pong to detect dead connections (30s interval)
- [ ] Backpressure: if client is slow, buffer up to N events, then drop oldest with a gap notification

**US-8.2: gRPC Streaming** *(P2, later phase)*
> As a developer using high-performance backends, I want to consume events via gRPC for lower latency and smaller payloads.

**Acceptance Criteria:**
- [ ] Proto definition for `SubscribeRequest` and `EventStream`
- [ ] Auth via gRPC metadata (`x-api-key`)
- [ ] Same filtering capabilities as WebSocket
- [ ] Supports server-streaming RPC pattern

#### Architecture

```
                            ┌──────────────┐
                            │  PostgreSQL   │
                            │  LISTEN/      │
                            │  NOTIFY       │
                            └──────┬───────┘
                                   │
               ┌───────────────────▼────────────────────┐
               │          Event Fanout Service           │
               │  (receives NOTIFY, routes to streams)   │
               └──────┬──────────────────┬──────────────┘
                      │                  │
              ┌───────▼──────┐  ┌────────▼──────┐
              │  WebSocket   │  │  gRPC Stream   │
              │  Server      │  │  Server        │
              └──────────────┘  └────────────────┘
```

**Event Delivery:**
1. Indexer writes event to PG table → triggers `pg_notify('uho_events', payload)`
2. Fanout service listens on channel → routes to matching subscriptions
3. Subscription filters applied in-memory (program, event, field filters)

---

## 5. Data Model & Multi-Tenancy

### Full Schema Overview

```
PostgreSQL Database: uho
│
├── public (shared schema)
│   ├── users
│   ├── refresh_tokens
│   ├── email_verifications
│   ├── api_keys
│   ├── user_programs
│   ├── user_program_events
│   ├── user_views
│   └── platform_config
│
├── u_a1b2c3d4 (User A's schema)
│   ├── sample_dex__swap_event        -- indexed event data
│   ├── sample_dex__transfer_event
│   ├── sample_dex__initialize_ix     -- indexed instruction data
│   ├── _uho_state                    -- indexer state per program
│   └── v_active_traders              -- user's custom views
│
├── u_e5f6g7h8 (User B's schema)
│   ├── raydium_amm__swap_event
│   ├── _uho_state
│   └── ...
│
└── ...
```

### Entity Relationships

```
users ──────── 1:N ──── api_keys
  │
  ├─────────── 1:N ──── refresh_tokens
  │
  ├─────────── 1:N ──── user_programs ──── 1:N ──── user_program_events
  │                                    │
  │                                    └─── 1:N ──── user_views
  │
  └─────────── 1:1 ──── PG Schema (u_{id_prefix})
                            │
                            ├── {program}__{event} tables
                            ├── {program}__{instruction}_ix tables
                            └── _uho_state
```

### Indexer State (Per-User Schema)

The existing `_uho_state` table is replicated into each user's schema:

```sql
CREATE TABLE _uho_state (
  program_name    TEXT PRIMARY KEY,
  program_id      TEXT NOT NULL,
  last_slot       BIGINT DEFAULT 0,
  last_signature  TEXT,
  events_indexed  BIGINT DEFAULT 0,
  status          TEXT DEFAULT 'stopped',
  started_at      TIMESTAMPTZ,
  last_poll_at    TIMESTAMPTZ,
  error           TEXT
);
```

---

## 6. API Contract

### Base URL

```
https://api.uho.dev/api/v1
```

### Authentication

All endpoints (except health and auth) require one of:
- `Authorization: Bearer <jwt>` (session-based)
- `X-API-Key: uho_sk_...` (programmatic)

### Endpoints

#### Auth

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/auth/register` | Create account | None |
| `POST` | `/auth/verify` | Verify email | None |
| `POST` | `/auth/login` | Login, get tokens | None |
| `POST` | `/auth/refresh` | Refresh access token | Refresh token |
| `POST` | `/auth/logout` | Revoke session | Bearer |
| `POST` | `/auth/forgot-password` | Request password reset | None |
| `POST` | `/auth/reset-password` | Reset password | Reset token |

#### User & Settings

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/user/me` | Get current user profile | Bearer / API Key |
| `PATCH` | `/user/me` | Update profile | Bearer |
| `GET` | `/user/api-keys` | List API keys (masked) | Bearer |
| `POST` | `/user/api-keys` | Generate new API key | Bearer |
| `DELETE` | `/user/api-keys/:id` | Revoke API key | Bearer |

#### Programs

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/programs` | List user's programs | Bearer / API Key |
| `POST` | `/programs` | Add a new program | Bearer |
| `GET` | `/programs/:id` | Get program detail | Bearer / API Key |
| `PATCH` | `/programs/:id` | Update program config | Bearer |
| `DELETE` | `/programs/:id` | Delete program + data | Bearer |
| `POST` | `/programs/:id/pause` | Pause indexer | Bearer |
| `POST` | `/programs/:id/resume` | Resume indexer | Bearer |
| `POST` | `/programs/discover-idl` | IDL auto-discovery | Bearer |

#### Data (per program)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/{program}/{event}` | List events (paginated) | Bearer / API Key |
| `GET` | `/{program}/{event}/count` | Count events | Bearer / API Key |
| `GET` | `/{program}/{event}/:txSignature` | Events by tx | Bearer / API Key |
| `GET` | `/{program}/views/{viewName}` | Query custom view | Bearer / API Key |

#### Platform

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Health check | None |
| `GET` | `/status` | User's indexer status | Bearer / API Key |

### Error Response Format

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired API key",
    "details": {}
  }
}
```

Standard error codes:
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (422)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)

---

## 7. Security Requirements

### 7.1 Data Isolation (Critical)

| Requirement | Implementation |
|-------------|----------------|
| Users must never see other users' data | Schema-per-user in PostgreSQL |
| API always scoped to authenticated user | Middleware sets `search_path` before any query |
| No cross-tenant queries possible | PG schemas enforce boundary; no `public` tables contain event data |
| Admin access logged | Separate admin role with audit trail |

### 7.2 Authentication Security

| Requirement | Implementation |
|-------------|----------------|
| Passwords hashed with strong algorithm | Argon2id (preferred) or bcrypt with cost 12 |
| No plaintext secrets in database | API keys stored as SHA-256 hashes |
| Token rotation on refresh | Old refresh token revoked when new one issued |
| Session invalidation | User can log out all sessions (revoke all refresh tokens) |
| Rate limit on auth endpoints | 5 attempts per minute per IP for login; 3 per hour for registration |

### 7.3 Input Validation

| Vector | Mitigation |
|--------|------------|
| SQL injection | Parameterized queries (existing pattern), schema isolation, known-field whitelist |
| IDL upload (malicious JSON) | Zod schema validation, file size limit (5MB), parse in sandbox |
| Program ID spoofing | Validate base58 format; on-chain verification optional (P1) |
| XSS in dashboard | React's default escaping, CSP headers, sanitize user-provided names |
| API key in URL | Discouraged; prefer header; log warnings if query param used |

### 7.4 Rate Limiting

| Tier | Limit | Scope |
|------|-------|-------|
| Auth endpoints | 5 req/min (login), 3 req/hr (register) | Per IP |
| API reads | 100 req/min | Per API key / user |
| API writes (program config) | 10 req/min | Per user |
| WebSocket connections | 5 concurrent | Per user |
| IDL upload | 10 req/hr | Per user |

Rate limit headers in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1706130000
```

### 7.5 Infrastructure

| Requirement | Notes |
|-------------|-------|
| HTTPS only | TLS 1.2+ required for all endpoints |
| CORS | Configurable allowed origins |
| Helmet headers | `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security` |
| Dependency auditing | `npm audit` in CI pipeline |

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Metric | Target | Notes |
|--------|--------|-------|
| API response time (p95) | < 200ms | For paginated queries up to 100 rows |
| API response time (p99) | < 500ms | For complex queries with filters |
| Dashboard initial load | < 2s | On 4G connection |
| Indexer event throughput | ≥ 500 events/sec per program | Current poller must not be bottleneck |
| WebSocket event latency | < 1s from chain confirmation | After event is written to PG |

### 8.2 Scalability

| Dimension | Approach |
|-----------|----------|
| Users | Schema-per-user scales to ~1000s on single PG instance; shard beyond |
| Programs per user | Soft limit: 10 (MVP); configurable per tier |
| Events per program | PG handles millions of rows per table; partition by slot range for >100M |
| Concurrent API requests | Fastify handles 30k+ req/sec; PG connection pool sized appropriately |
| WebSocket connections | 10k concurrent with proper event loop management |

### 8.3 Reliability

| Requirement | Target |
|-------------|--------|
| Uptime | 99.5% (MVP), 99.9% (production) |
| Data durability | PG with WAL + daily backups |
| Indexer recovery | Resume from last processed slot on restart (existing `_uho_state`) |
| Zero data loss | Every event confirmed on-chain must be indexed exactly once |

### 8.4 Observability

| Area | Tool / Approach |
|------|-----------------|
| Application logging | Structured JSON logs (pino via Fastify) |
| Metrics | Prometheus endpoint (`/metrics`): request latency, event throughput, error rates |
| Alerting | On: indexer errors, high error rates, PG connection failures |
| Tracing | Request IDs in all log lines and API responses (`X-Request-Id` header) |

---

## 9. Migration & Backward Compatibility

### CLI Mode Preserved

The existing CLI workflow (`uho init` → `uho schema --apply` → `uho start`) must continue to work for self-hosted, single-user deployments. The multi-tenant platform is an additional deployment mode, not a replacement.

**Approach:**
- `uho.yaml` config file continues to work for CLI mode
- Platform mode is activated by environment variable (`UHO_MODE=platform`) or separate entry point
- Core modules (`idl-parser`, `schema-generator`, `decoder`, `writer`, `poller`) remain shared
- API layer gets auth middleware that is bypassed in CLI mode

### Database Migration

For the shared PostgreSQL instance:
1. Run schema migrations via a migration tool (e.g., `node-pg-migrate` or custom)
2. Platform tables (`users`, `api_keys`, etc.) created in `public` schema
3. Existing single-user tables can be migrated into a "default" user schema if needed
4. Migration is additive — existing tables are not modified

### API Versioning

- Current routes remain at `/api/v1/...`
- Auth is added as middleware, not route change
- Breaking changes (if any) will introduce `/api/v2/...`

---

## 10. Open Questions

**All questions resolved by Z (2026-02-05):**

| # | Question | Decision |
|---|----------|----------|
| 1 | Deployment model | **Hosted SaaS** |
| 2 | Single process or microservices? | **Microservices** — indexer, API, and WebSocket as separate services |
| 3 | Shared indexer vs per-user? | **Shared** — one poller per program ID, fan out to users |
| 4 | Free tier limits | **1 free program per user, 1,000 events, 50,000 API calls** |
| 5 | Email provider | **Resend** |
| 6 | IDL auto-discovery priority | **Yes, P1** (not P0 but must be built) |
| 7 | Custom data shaping | **(a) Field selection for P1, (b) GROUP BY views for P2** |
| 8 | Delete behavior | **Archived** (data retained but hidden) |
| 9 | WebSocket library | **@fastify/websocket** |
| 10 | gRPC priority | **P2** |
| 11 | Connection pool strategy | **Shared pool** (set `search_path` per request) |
| 12 | Frontend framework for auth | **Next.js** (custom auth pages in existing app) |
| 13 | Indexer orchestration | **(c) Round-robin polling loop** for now |

---

## Implementation Scope (Approved)

**Build ALL of P0 + P1, plus these P2 items:**
- P2-1: Custom views / aggregations
- P2-2: Real-time subscription endpoint (JSON over WebSocket)
- P2-4: Webhook delivery for events

**Deferred (not in this build):**
- P2-3: gRPC streaming (deferred)
- P2-5: Team / organization support (deferred)
- P2-6: OAuth / social login (deferred)
- P2-7: Rate limit tiers & paid plans (deferred)

---

*PRD approved by Z on 2026-02-05. Ready for architecture and implementation.*
