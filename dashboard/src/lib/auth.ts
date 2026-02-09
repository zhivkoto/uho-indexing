/**
 * Auth token management — F1
 * In-memory access token + localStorage refresh token for local dev.
 * Production should use httpOnly cookies.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const STORAGE_KEY_ACCESS = 'uho_access_token';
const STORAGE_KEY_REFRESH = 'uho_refresh_token';

// In-memory storage with localStorage persistence for local dev
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

// Initialize from localStorage on load (client-side only)
if (typeof window !== 'undefined') {
  accessToken = localStorage.getItem(STORAGE_KEY_ACCESS);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ACCESS, token);
  }
}

export function getRefreshToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY_REFRESH);
  }
  return null;
}

export function setRefreshToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_REFRESH, token);
  }
}

export function clearAccessToken(): void {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_ACCESS);
    localStorage.removeItem(STORAGE_KEY_REFRESH);
  }
}

/**
 * Attempt to refresh the access token using localStorage refresh token.
 * Deduplicates concurrent refresh attempts.
 */
export async function refreshAccessToken(): Promise<string> {
  // If a refresh is already in-flight, return the same promise
  if (refreshPromise) return refreshPromise;

  const storedRefreshToken = getRefreshToken();
  if (!storedRefreshToken) {
    throw new Error('No refresh token');
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!res.ok) {
        throw new Error('Refresh failed');
      }

      const data = await res.json();
      setAccessToken(data.accessToken);
      if (data.refreshToken) {
        setRefreshToken(data.refreshToken);
      }
      return data.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Logout — revoke refresh token, clear in-memory state.
 */
export async function logout(): Promise<void> {
  try {
    const token = getAccessToken();
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
  } catch {
    // Ignore errors — we're logging out regardless
  } finally {
    clearAccessToken();
  }
}
