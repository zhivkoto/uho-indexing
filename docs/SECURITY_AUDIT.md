# Uho Platform — Security Audit Report

**Date:** 2026-02-12
**Auditor:** Automated Security Review
**Scope:** All API endpoints, middleware, services, WebSocket server

---

## Executive Summary

The Uho platform has a solid security foundation: auth middleware is consistently applied, user data is isolated via per-user PostgreSQL schemas, and most queries use parameterized inputs. However, several **SQL injection vectors** exist through unquoted table/schema name interpolation, and one design choice (storing full API keys) weakens the key management model.

**Critical: 1 | High: 3 | Medium: 4 | Low: 3**

---

## CRITICAL

### C1 — SQL Injection via Table Name Interpolation in Data Routes

**Endpoints:** `GET /api/v1/data/:program/:event`, `GET /api/v1/data/all`, `GET /api/v1/status`, `GET /api/v1/metrics/throughput`
**Files:** `src/api/data-routes.ts`, `src/api/server.ts`

**Issue:** Table names are derived from user-uploaded IDL program/event names and interpolated directly into SQL without quoting or parameterization:

```typescript
// data-routes.ts — resolveTable() returns unquoted table name
const tableName = eventTableName(idlProgramName, event.name); // e.g., "my_program_swap_event"
// Then used as:
const dataSql = `SELECT * FROM ${tableName} ...`;
```

```typescript
// server.ts — /api/v1/status endpoint
const userSchema = `u_${auth.userId.replace(/-/g, '').slice(0, 8)}`;
const countResult = await pool.query(
  `SELECT COUNT(*)::int as count FROM "${userSchema}"."${tableName}"`
);
```

The `eventTableName()` function just concatenates `programName + "_" + toSnakeCase(eventName)`. If an attacker uploads an IDL with a crafted program name like `x"; DROP TABLE users; --`, the `toSnakeCase()` conversion may not fully sanitize it.

**Severity:** CRITICAL — A malicious IDL upload could execute arbitrary SQL in the user's schema context (and potentially the public schema).

**Fix:**
1. Validate program and event names against a strict allowlist pattern (e.g., `/^[a-z][a-z0-9_]{0,62}$/`) at IDL upload time in `addProgram()`.
2. Always use `pg-format` or double-quote identifiers with proper escaping: `format('SELECT * FROM %I', tableName)`.
3. The `userSchema` construction in `/api/v1/status` should use the `auth.schemaName` from the token (which is DB-sourced) rather than re-deriving it.

---

## HIGH

### H1 — SQL Injection in View Definition WHERE Clause

**Endpoint:** `POST /api/v1/views`
**File:** `src/services/view-service.ts` (line ~220)

**Issue:** The `generateViewSQL()` method builds WHERE clauses by string-interpolating user-provided values with only single-quote escaping:

```typescript
conditions.push(`${safeField} = '${value.replace(/'/g, "''")}'`);
```

While field names are sanitized via `replace(/[^a-z0-9_]/g, '')`, string values use manual quote escaping which is fragile. A value containing a backslash + quote combination or unicode tricks could bypass this.

**Severity:** HIGH — Could allow SQL injection within the materialized view definition, executing in the user's schema.

**Fix:** Use parameterized queries or `pg-format`'s `%L` literal escaper for values in generated view SQL.

### H2 — Unquoted Table Names in CLI Mode Routes (No Auth)

**Endpoint:** All `GET /api/v1/{program}/{event}*` routes (CLI mode)
**File:** `src/api/routes.ts`

**Issue:** CLI mode routes have **no authentication** and use table names derived from IDL without quoting:

```typescript
const sql = `SELECT * FROM ${tableName} ...`;
```

While CLI mode is single-user/local, if accidentally exposed to the network, this is an injection vector.

**Severity:** HIGH (if exposed) / LOW (if truly local only)

**Fix:** Always quote identifiers. Add a warning/binding to localhost only for CLI mode.

### H3 — UNION ALL Query in /data/all Interpolates Program Names

**Endpoint:** `GET /api/v1/data/all`
**File:** `src/api/data-routes.ts`

**Issue:** The `/data/all` endpoint builds a UNION ALL query with string-interpolated program and event names:

```typescript
unions.push(
  `SELECT ... '${row.name.replace(/'/g, "''")}' as program_name, '${evt.event_name.replace(/'/g, "''")}' as event_type FROM ${tableName}`
);
```

The `tableName` from `eventTableName()` is unquoted, and string values use manual escaping.

**Severity:** HIGH — Same injection vector as C1, compounded by the UNION construction.

**Fix:** Use `pg-format` for identifier and literal escaping in dynamic SQL.

---

## MEDIUM

### M1 — Full API Keys Stored in Plaintext

**Endpoint:** `POST /api/v1/user/api-keys`, `GET /api/v1/user/api-keys/:id/reveal`
**File:** `src/api/user-routes.ts`

**Issue:** API keys are stored as `key_full` in plaintext alongside the hash. The `/reveal` endpoint returns the full key. This defeats the purpose of hashing — if the database is compromised, all API keys are exposed.

**Severity:** MEDIUM — Database breach would expose all API keys.

**Fix:** Remove `key_full` column. Show the key only once at creation time (already done), and never store it in plaintext. If reveal is a product requirement, use reversible encryption with a separate key.

### M2 — Schema Name Reconstructed Instead of Using Auth Payload

**Endpoint:** `GET /api/v1/status`, `GET /api/v1/metrics/throughput`
**File:** `src/api/server.ts`

**Issue:** Both endpoints reconstruct the schema name from userId:

```typescript
const userSchema = `u_${auth.userId.replace(/-/g, '').slice(0, 8)}`;
```

But `auth.schemaName` is already available from the JWT/API key validation. The reconstructed name could diverge from the actual schema if the generation logic changes.

**Severity:** MEDIUM — Inconsistency risk; could query wrong schema.

**Fix:** Use `auth.schemaName` consistently.

### M3 — Logout Endpoint Doesn't Require Authentication

**Endpoint:** `POST /api/v1/auth/logout`
**File:** `src/api/auth-routes.ts`

**Issue:** The logout endpoint checks `request.authPayload` but doesn't use `authMiddleware` as a preHandler. It accesses `request.authPayload` which is undefined unless auth headers are sent, making the token revocation silently skip.

**Severity:** MEDIUM — Logout may silently fail to revoke tokens if no auth header is sent.

**Fix:** Add `optionalAuthMiddleware` as a preHandler, or add a note that cookie-based refresh token revocation should also be handled.

### M4 — Metrics Throughput Endpoint Has SQL Injection via `hours` Parameter

**Endpoint:** `GET /api/v1/metrics/throughput`
**File:** `src/api/server.ts`

**Issue:** The `hours` value is interpolated into an interval literal:

```typescript
WHERE block_time > now() - interval '${hours} hours'
```

While `hours` is parsed through `parseInt()` and clamped to 1–168, the intermediate string interpolation is unnecessary.

**Severity:** MEDIUM — Currently safe due to parseInt, but fragile pattern.

**Fix:** Use parameterized interval: `WHERE block_time > now() - ($1 || ' hours')::interval` or `WHERE block_time > now() - make_interval(hours => $1)`.

---

## LOW

### L1 — View Routes Use `authMiddleware` Instead of `jwtOnlyMiddleware` for Writes

**Endpoints:** `POST /api/v1/views`, `DELETE /api/v1/views/:id`
**File:** `src/api/view-routes.ts`

**Issue:** View creation and deletion accept API key auth. Other write endpoints (programs, webhooks, API keys) correctly use `jwtOnlyMiddleware`. This is inconsistent.

**Fix:** Use `jwtOnlyMiddleware` for write operations on views.

### L2 — No Rate Limiting on WebSocket Auth Attempts

**File:** `src/websocket/server.ts`

**Issue:** WebSocket connections allow unlimited auth attempts. An attacker could brute-force API keys via the WebSocket endpoint.

**Fix:** Add connection-level rate limiting or close on first auth failure (already done for single-message auth, but the connection setup could be abused at scale).

### L3 — Swagger/OpenAPI Docs Exposed Without Auth

**Endpoint:** `GET /api/docs`, `GET /api/v1/openapi.json`
**File:** `src/api/server.ts`

**Issue:** API documentation is publicly accessible. While not a direct vulnerability, it reveals the full API surface to attackers.

**Fix:** Consider gating docs behind auth in production, or accept the risk if API is meant to be publicly documented.

---

## Positive Findings

1. **✅ Auth middleware consistently applied** — All data endpoints require authentication via `authMiddleware` or `jwtOnlyMiddleware` preHandlers.
2. **✅ Schema isolation is solid** — `withUserSchema()` validates schema names against `/^u_[a-f0-9]{8,12}$/` before setting `search_path`, preventing injection via schema names.
3. **✅ No IDOR vulnerabilities** — All resource queries (programs, views, webhooks, API keys) filter by `user_id`, preventing cross-tenant access by guessing IDs.
4. **✅ CSRF protection on OAuth** — OAuth flows use cryptographic state tokens stored in httpOnly cookies.
5. **✅ Rate limiting on auth endpoints** — Login, register, and verify have per-IP rate limits.
6. **✅ Parameterized queries for user input** — Field filters, pagination, and most data access use parameterized queries.
7. **✅ WebSocket auth required** — WS connections require JWT or API key with 10s timeout.
8. **✅ Refresh tokens in httpOnly cookies** — Prevents XSS-based token theft.
9. **✅ OAuth tokens in URL fragments** — Prevents Referer/log leakage.

---

## Summary of Required Actions

| Priority | Finding | Effort |
|----------|---------|--------|
| **CRITICAL** | C1: Quote/validate all table name identifiers | Medium |
| **HIGH** | H1: Parameterize view WHERE clause values | Low |
| **HIGH** | H3: Use pg-format for UNION ALL construction | Low |
| **MEDIUM** | M1: Remove plaintext API key storage | Low |
| **MEDIUM** | M2: Use auth.schemaName consistently | Trivial |
| **MEDIUM** | M4: Parameterize interval in metrics query | Trivial |
