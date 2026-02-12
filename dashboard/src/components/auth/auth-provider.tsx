'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getAccessToken, setAccessToken, setRefreshToken, clearAccessToken, refreshAccessToken, logout as authLogout } from '@/lib/auth';
import { getMe } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithToken: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isAuthenticated: false,
  loginWithToken: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Try to restore session on mount (via refresh token cookie)
  useEffect(() => {
    async function init() {
      // If there's already a token in memory, use it
      if (getAccessToken()) {
        try {
          const profile = await getMe();
          setUser({
            id: profile.id,
            email: profile.email,
            verified: profile.verified,
            displayName: profile.displayName,
            createdAt: profile.createdAt,
          });
        } catch {
          clearAccessToken();
        }
        setLoading(false);
        return;
      }

      // Otherwise try refresh
      try {
        await refreshAccessToken();
        const profile = await getMe();
        setUser({
          id: profile.id,
          email: profile.email,
          verified: profile.verified,
          displayName: profile.displayName,
          createdAt: profile.createdAt,
        });
      } catch {
        // Not authenticated — that's fine
      }
      setLoading(false);
    }
    init();
  }, []);

  const loginWithToken = useCallback((accessToken: string, refreshToken: string, authUser: AuthUser) => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    setUser(authUser);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    // Also log out of Privy to prevent auto-re-login via bridge
    try {
      const mod = await import('@privy-io/react-auth');
      // getAccessToken is available as a standalone import — if it returns non-null, user is privy-authed
      // We store a logout fn from the bridge
      if ((window as any).__privyLogout) {
        await (window as any).__privyLogout();
      }
    } catch {
      // Privy not loaded — fine
    }
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getMe();
      setUser({
        id: profile.id,
        email: profile.email,
        verified: profile.verified,
        displayName: profile.displayName,
        createdAt: profile.createdAt,
      });
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        loginWithToken,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
