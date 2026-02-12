# QA Auth Report V2 — Uho Indexing Platform
**Date:** 2026-02-12 07:31 EET  
**Tester:** QA Subagent

---

## Test Results Summary

| # | Test | Grade |
|---|------|-------|
| 1 | Backend Health | ✅ PASS |
| 2 | Google OAuth Flow | ✅ PASS |
| 3 | GitHub OAuth Flow | ✅ PASS |
| 4 | Privy/Wallet Auth | ✅ PASS |
| 5 | Email Registration Validation | ✅ PASS |
| 6 | Email Login | ✅ PASS |
| 7 | CORS | ✅ PASS |
| 8 | Frontend Code Review | ✅ PASS |
| 9 | Auth Callback Page | ✅ PASS |
| 10 | Sign Out Flow | ✅ PASS |

**Overall: 10/10 PASS**

---

## Detailed Findings

### 1. Backend Health — PASS
```
GET /api/v1/auth/providers → {"google":true,"github":true,"privy":true}
```
All three providers enabled as expected.

### 2. Google OAuth Flow — PASS
- Returns valid Google OAuth URL with correct `client_id`, `redirect_uri` (`https://api.uhoindexing.com/api/v1/auth/google/callback`), `scope` (openid email profile), `access_type=offline`, `prompt=consent`
- `Set-Cookie: oauth_state=...; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax` ✓
- State in cookie matches state in URL ✓

### 3. GitHub OAuth Flow — PASS
- Returns valid GitHub OAuth URL with correct `client_id`, `redirect_uri` (`https://api.uhoindexing.com/api/v1/auth/github/callback`), `scope=user:email`
- `Set-Cookie: oauth_state=...; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax` ✓
- State in cookie matches state in URL ✓

### 4. Privy/Wallet Auth — PASS
- Fake token → `401 {"error":{"code":"UNAUTHORIZED","message":"Invalid Privy token"}}` ✓ (not 500)
- Empty body → `422 {"error":{"code":"VALIDATION_ERROR","message":"Privy auth token is required"}}` ✓

### 5. Email Registration Validation — PASS
- Missing fields → `422` "Email and password are required" ✓
- Weak password (`123`) → `422` "Password must be at least 8 characters" ✓
- Invalid email (`notanemail`) → `422` "Invalid email format" ✓

### 6. Email Login — PASS
- Wrong credentials → `401` "Invalid credentials" ✓
- Does NOT leak whether user exists (generic message) ✓

### 7. CORS — PASS
- `OPTIONS` preflight returns `204` with:
  - `Access-Control-Allow-Origin: https://www.uhoindexing.com` ✓
  - `Access-Control-Allow-Credentials: true` ✓
  - `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS` ✓
  - `Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key` ✓
  - `Access-Control-Max-Age: 86400` ✓

### 8. Frontend Code Review — PASS

| File | Check | Result |
|------|-------|--------|
| `privy-auth-bridge.tsx` | Exposes `__privyLogout` on window | ✓ Line: `(window as any).__privyLogout = privyLogout` |
| `auth-provider.tsx` | Logout calls `__privyLogout` | ✓ Calls `(window as any).__privyLogout()` in logout |
| `login-form.tsx` | `isAuthenticated` redirect | ✓ `useEffect` redirects to `/dashboard` when authenticated |
| `user-menu.tsx` | `direction="up"` | ✓ `<Dropdown direction="up" ...>` |
| `dropdown.tsx` | `direction` prop + `bottom-full` | ✓ `direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'` |
| `settings/page.tsx` | Sign out button exists | ✓ Red "Sign out" button with `<LogOut>` icon in border-separated section |

### 9. Auth Callback Page — PASS
- `GET https://www.uhoindexing.com/auth/callback` → HTTP 200 ✓
- Code correctly parses hash fragment (`window.location.hash.substring(1)`) via `URLSearchParams` ✓
- Clears fragment from URL after storing tokens (`window.history.replaceState`) ✓
- Redirects to `/login?error=oauth_failed` if tokens missing ✓
- Wrapped in `<Suspense>` for client-side rendering ✓

### 10. Sign Out Flow — PASS
- `auth-provider.tsx` logout:
  1. Calls `authLogout()` (clears tokens) ✓
  2. Calls `(window as any).__privyLogout()` (Privy logout) ✓
  3. Sets user to `null` ✓
- Bridge anti-re-login: condition `authenticated && !isAuthenticated && !processingRef.current` ✓
  - After logout, `isAuthenticated` becomes false but Privy `authenticated` also becomes false (since we called `privyLogout`), so the bridge won't trigger re-login ✓
  - `processingRef` provides additional guard against race conditions ✓
  - On error during bridge exchange, calls `privyLogout()` to reset state ✓

---

## Notes
- All error responses use consistent `{error: {code, message}}` format
- Rate limiting headers present (`x-ratelimit-*`)
- Response times excellent (0.9ms–2.3ms)
- No sensitive data leaked in any error response
