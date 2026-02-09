# QA Report — Sprint 1 + Sprint 2

**Date:** 2026-02-06  
**Tester:** QA Subagent  
**Platform version:** 0.1.0  
**Environment:** localhost:3001, API key auth  

---

## 1. Test Results

### S1.1 — CORS

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | OPTIONS preflight returns 204 | ✅ | Returns `204 No Content` as expected |
| 2 | `Access-Control-Max-Age: 86400` present | ✅ | Confirmed on preflight response |
| 3 | `X-API-Key` in `Access-Control-Allow-Headers` | ✅ | Header includes `Content-Type, Authorization, X-API-Key` |
| 4 | `Access-Control-Allow-Methods` correct | ✅ | `GET, POST, PATCH, DELETE, OPTIONS` |
| 5 | Preflight works from any origin | ✅ | Both `example.com` and `evil.com` get same 204 response |
| 6 | `Access-Control-Allow-Origin` header present | ❌ | **Missing!** Preflight and actual responses do NOT include `Access-Control-Allow-Origin`. Only `access-control-allow-credentials: true` is set. Browsers will **reject** the response without `Allow-Origin`. |
| 7 | Credentials mode consistent | ⚠️ | `allow-credentials: true` is set but without a matching `Allow-Origin` (cannot be `*` with credentials), this is a broken CORS config |

### S1.2 — Field-level Filtering

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Exact string: `symbol=GLIDE` | ✅ | Returns 1 matching CreateEvent with symbol "GLIDE" |
| 2 | Boolean filter: `is_buy=true` | ✅ | All returned records have `is_buy: true` |
| 3 | Filter by mint | ✅ | Returns only records matching the specified mint address |
| 4 | Range `sol_amount_gte=1000000000` | ✅ | All results have sol_amount ≥ 1B lamports |
| 5 | Range `sol_amount_lt=100000` | ✅ | All results have sol_amount < 100000 (e.g., 19, 40) |
| 6 | Combined: `is_buy=true&mint=X` | ✅ | Correctly applies both filters; results match both conditions |
| 7 | Nonexistent field: `nonexistent_field=foo` | ✅ | Silently ignored — returns unfiltered data (acceptable behavior) |
| 8 | SQL injection: `mint='; DROP TABLE--` | ✅ | Returns empty data array, no SQL error. Parameterized queries working. |

### S1.3 — Error Responses

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | 404 nonexistent route | ✅ | `{"error":{"code":"NOT_FOUND","message":"Route not found"}}` |
| 2 | 401 no API key | ✅ | `{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}` |
| 3 | 401 invalid API key | ✅ | Same shape as above |
| 4 | 404 nonexistent program | ✅ | `Program 'nonexistent' not found` |
| 5 | 404 nonexistent event | ✅ | `Event 'FakeEvent' not found in program 'pump'` |
| 6 | Content-Type on errors | ✅ | `application/json; charset=utf-8` on all error responses |
| 7 | Error shape `{ error: { code, message } }` | ✅ | Consistent across all error types |

### S1.5 — order_by

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `order_by=block_time&order=desc` | ✅ | Results ordered by block_time descending |
| 2 | `order_by=sol_amount&order=desc` | ✅ | Largest trades first (43.9B → 24.6B → 9.8B → ...). Verified ordering is correct. |
| 3 | `order_by=sol_amount&order=asc` | ✅ | Smallest first (0, 0, 0, 0, 0). Correct. |
| 4 | `order_by=invalid_field` | ⚠️ | Returns 200 with data — silently ignores invalid field. Falls back to default ordering. Not an error, but could confuse users. |
| 5 | Default ordering (no order_by) | ✅ | Defaults to descending by id (newest first) |

### S2.2 — Schema Introspection

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `GET /api/v1/schema/pump` | ✅ | Returns program info, events array with full field details |
| 2 | `GET /api/v1/schema/pump/CreateEvent` | ✅ | Returns field details for CreateEvent |
| 3 | `GET /api/v1/schema/pump/TradeEvent` | ✅ | 17 fields, all with correct types |
| 4 | `GET /api/v1/schema/nonexistent` | ✅ | Returns 404 with proper error shape |
| 5 | Fields have name, type, nullable, description | ✅ | All 17 TradeEvent fields have all required properties |
| 6 | Extra metadata: `sqlType`, `source` | ✅ | Bonus fields provided (e.g., `"sqlType": "BIGINT"`, `"source": "metadata"`) |

### S2.3 — OpenAPI/Swagger

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `GET /api/v1/openapi.json` returns valid spec | ✅ | OpenAPI 3.0.3, title "Uho API", 30 paths |
| 2 | `GET /api/docs` serves Swagger UI | ✅ | Returns HTML with `<!DOCTYPE html>` Swagger UI |
| 3 | Spec includes data endpoints | ✅ | `/api/v1/data/{program}/{event}`, count, tx lookup all present |
| 4 | Spec includes schema endpoints | ✅ | Both `/api/v1/schema/{program}` and `/{event}` present |
| 5 | Spec includes auth endpoints | ✅ | register, login, logout, refresh, verify, forgot/reset password |
| 6 | Spec includes status/health | ✅ | Both `/api/v1/status` and `/api/v1/health` present |
| 7 | Spec includes views/webhooks | ✅ | Views and webhooks endpoints documented |

### S2.4 — Cursor Pagination

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `limit=5` returns 5 records with `next_cursor` | ✅ | Returns cursor value (last id on page) |
| 2 | `has_more` in first page (offset pagination) | ❌ | `has_more` is **missing** from offset pagination responses. Only appears in cursor (after_id) responses. |
| 3 | `after_id=<cursor>&limit=5` returns next page | ❌ | **BUG: Returns WRONG direction.** `after_id` returns records with IDs *greater* than the cursor instead of *less* (when default order is desc). Page 1 IDs: [6118..6114], Page 2 with after_id=6114: [6115..6119] — **overlaps with page 1!** |
| 4 | No duplicates between pages | ❌ | **4 out of 5 records duplicated** between pages due to direction bug |
| 5 | `after_id=999999999` returns empty | ✅ | Returns `{"data":[],"pagination":{"limit":5,"has_more":false}}` |
| 6 | `next_cursor` value | ⚠️ | Cursor is present but its semantics are broken — it gives the min id from a desc page, then `after_id` fetches ascending from there |

### S2.5 — Indexer Lag

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `chainHeadSlot` present | ✅ | `398464428` — valid Solana slot number |
| 2 | `lagSlots` present and reasonable | ✅ | `25` slots — very reasonable |
| 3 | `lagSeconds` ≈ `lagSlots * 0.4` | ✅ | `10` seconds = `25 * 0.4` exactly |
| 4 | Status includes program details | ✅ | Shows pump program with event counts (381 CreateEvent, 6067 TradeEvent) |

### Quick Wins

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `GET /` returns platform info | ✅ | `{"name":"Uho","version":"0.1.0","docs":"/api/docs","openapi":"/api/v1/openapi.json","health":"/api/v1/health"}` |
| 2 | `X-Request-Id` header | ✅ | UUID format: `a0d591d3-fc51-47db-810d-c9f5bd020bcd` |
| 3 | `X-Response-Time` header | ✅ | e.g., `8.3ms` |
| 4 | Rate limit headers | ✅ | `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining: 93`, `X-RateLimit-Reset: 46` |
| 5 | Rate limit on 401 responses | ✅ | Rate limit headers present even on unauthorized requests |
| 6 | `Content-Type: application/json` on errors | ✅ | Confirmed on 404 and 401 responses |

### SDK

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `/packages/sdk/` exists | ✅ | Proper structure: `src/`, `dist/`, `package.json`, `tsconfig.json` |
| 2 | TypeScript compiles (`tsc --noEmit`) | ✅ | Exit code 0, no errors |
| 3 | Source files well-organized | ✅ | `client.ts`, `errors.ts`, `types.ts`, `index.ts` |
| 4 | README has usage examples | ✅ | Comprehensive: Quick Start, filters, cursor pagination, schema, views, error handling, BigInt |
| 5 | Package.json correct | ✅ | ESM module, proper exports, `@uho/client` name, zero runtime deps |
| 6 | Types exported | ✅ | 15+ type exports including `QueryParams`, `CursorPagination`, `FieldSchema`, etc. |

### Regression

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | `CreateEvent?limit=10&offset=0&order=desc` | ✅ | Returns 10 records, pagination with total=381 |
| 2 | `TradeEvent?limit=10` | ✅ | Returns 10 records with pagination |
| 3 | Status has original + new fields | ✅ | Original fields plus `chainHeadSlot`, `lagSlots`, `lagSeconds` |
| 4 | Offset pagination works | ✅ | `offset=10` correctly skips 10 records |
| 5 | Offset + cursor coexist | ✅ | Response includes both `offset`/`total` and `next_cursor` |

---

## 2. Bugs Found

### 🔴 CRITICAL

**BUG-001: Cursor pagination returns wrong direction**
- **Endpoint:** `GET /api/v1/data/{program}/{event}?after_id=X`
- **Expected:** When default order is `desc` (newest first), `after_id=6114` should return records with id < 6114 (i.e., 6113, 6112, 6111...)
- **Actual:** Returns records with id > 6114 (i.e., 6115, 6116, 6117...) — the OPPOSITE direction
- **Impact:** Cursor pagination is completely broken. Users cannot paginate through results using cursors. Pages overlap massively (4/5 duplicates observed).
- **Root cause (likely):** `after_id` always means "WHERE id > X" but should respect the `order` direction — when `order=desc`, it should be "WHERE id < X ORDER BY id DESC".

### 🟡 MAJOR

**BUG-002: `Access-Control-Allow-Origin` header missing from all responses**
- **Endpoint:** All endpoints
- **Expected:** When a request includes `Origin` header, response should include `Access-Control-Allow-Origin: <origin>` (or `*` if not using credentials)
- **Actual:** Header is completely absent. Only `access-control-allow-credentials: true` is returned.
- **Impact:** **All browser-based API calls will fail.** Browsers enforce CORS strictly — without `Allow-Origin`, every cross-origin request is blocked. This makes the API unusable from any web frontend/dApp.
- **Note:** The preflight (OPTIONS) correctly returns other CORS headers (`Allow-Methods`, `Allow-Headers`, `Max-Age`) but is also missing `Allow-Origin`.

### 🟢 MINOR

**BUG-003: `has_more` missing from offset pagination responses**
- **Endpoint:** `GET /api/v1/data/{program}/{event}?limit=X&offset=Y`
- **Expected:** Response should include `has_more` boolean (per S2.4 spec)
- **Actual:** `has_more` only appears in cursor pagination responses (when `after_id` is used). Offset pagination responses only have `limit`, `offset`, `total`, `next_cursor`.
- **Impact:** Low — clients can compute `has_more` from `offset + limit < total`, but it's inconsistent.

**BUG-004: `order_by` with invalid field silently succeeds (200 OK)**
- **Endpoint:** `GET /api/v1/data/{program}/{event}?order_by=invalid_field`
- **Expected:** Return 400/422 error or at least a warning
- **Actual:** Returns 200 with default ordering, no indication the field was invalid
- **Impact:** Low — users may not realize their sorting isn't being applied. Consider returning a 422 with "Unknown field 'invalid_field' for order_by".

---

## 3. Overall Grade: **B**

### Scoring Breakdown

| Area | Score | Weight | Notes |
|------|-------|--------|-------|
| S1.1 CORS | 6/10 | 15% | Headers mostly correct, but missing Allow-Origin breaks browser usage |
| S1.2 Filtering | 10/10 | 15% | All filters work perfectly, SQL injection safe |
| S1.3 Errors | 10/10 | 10% | Consistent shape, correct codes, proper content-type |
| S1.5 order_by | 8/10 | 10% | Sorting works great, but invalid fields silently ignored |
| S2.2 Schema | 10/10 | 10% | Complete, well-structured, all required properties present |
| S2.3 OpenAPI | 10/10 | 10% | Valid spec, Swagger UI works, comprehensive coverage |
| S2.4 Cursor Pagination | 2/10 | 15% | Fundamentally broken — wrong direction, duplicates |
| S2.5 Indexer Lag | 10/10 | 5% | Perfect — accurate lag calculation |
| Quick Wins | 10/10 | 5% | All headers present and correct |
| SDK | 10/10 | 5% | Clean, typed, compiles, documented |

**Weighted Score: ~78/100 → B**

---

## 4. Summary

### ✅ What Works Well
- **Field-level filtering** is excellent — exact match, boolean, range operators, combined filters, SQL injection protection all work flawlessly
- **Error responses** are consistent and well-structured across all error types
- **Schema introspection** returns complete, typed field information with bonus metadata
- **OpenAPI/Swagger** spec is comprehensive (30 endpoints) with working Swagger UI
- **Indexer lag** reporting is accurate (lag seconds = slots × 0.4)
- **SDK** is clean, well-typed, zero-dependency, compiles without errors, and has excellent documentation
- **Standard headers** (Request-Id, Response-Time, Rate Limits) all present and functional
- **Sorting** works correctly for valid fields in both directions
- **Offset pagination** continues to work (no regressions)

### ❌ What's Broken
1. **Cursor pagination is broken** (CRITICAL) — `after_id` goes in the wrong direction, causing massive duplication between pages. This must be fixed before users can rely on cursor-based pagination.
2. **CORS `Access-Control-Allow-Origin` missing** (MAJOR) — The API cannot be called from any browser-based frontend. All the other CORS headers are present, but the one that matters most (`Allow-Origin`) is missing.

### ⚠️ Minor Issues
- `has_more` missing from offset-based pagination responses
- Invalid `order_by` fields silently succeed instead of returning an error
- `access-control-allow-credentials: true` without `Allow-Origin` is technically a spec violation (RFC 6454)

### Recommendations
1. **Fix cursor pagination ASAP** — When `order=desc`, `after_id=X` should query `WHERE id < X ORDER BY id DESC`. When `order=asc`, it should be `WHERE id > X ORDER BY id ASC`.
2. **Add `Access-Control-Allow-Origin`** — Either echo back the `Origin` header value, or use `*` (but then remove `allow-credentials: true` since they're incompatible per the spec).
3. **Consider validating `order_by`** — Check the field against the schema and return 422 if it doesn't exist.
4. **Add `has_more` to offset responses** — Simple: `has_more = offset + limit < total`.
