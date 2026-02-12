'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

/**
 * Bridges Privy authentication with the Uho backend.
 * When Privy login succeeds, sends the Privy auth token to our backend
 * to exchange for a Uho JWT, then calls loginWithToken.
 *
 * Must be rendered inside both PrivyProvider and AuthProvider.
 */
export function PrivyAuthBridge() {
  const { loginWithToken, isAuthenticated } = useAuth();
  const [privyHooks, setPrivyHooks] = useState<any>(null);
  const processingRef = useRef(false);

  // Dynamically load Privy hooks
  useEffect(() => {
    import('@privy-io/react-auth')
      .then((mod) => setPrivyHooks(mod))
      .catch(() => {});
  }, []);

  if (!privyHooks) return null;

  return (
    <PrivyAuthBridgeInner
      usePrivy={privyHooks.usePrivy}
      loginWithToken={loginWithToken}
      isAuthenticated={isAuthenticated}
      processingRef={processingRef}
    />
  );
}

function PrivyAuthBridgeInner({
  usePrivy,
  loginWithToken,
  isAuthenticated,
  processingRef,
}: {
  usePrivy: any;
  loginWithToken: (accessToken: string, refreshToken: string, user: any) => void;
  isAuthenticated: boolean;
  processingRef: React.MutableRefObject<boolean>;
}) {
  const { authenticated, getAccessToken, logout: privyLogout } = usePrivy();

  // Expose Privy logout so AuthProvider can call it on sign out
  useEffect(() => {
    (window as any).__privyLogout = privyLogout;
    return () => { delete (window as any).__privyLogout; };
  }, [privyLogout]);

  useEffect(() => {
    // When Privy says we're authenticated but Uho doesn't know yet
    if (authenticated && !isAuthenticated && !processingRef.current) {
      processingRef.current = true;

      (async () => {
        try {
          // Get the Privy auth token
          const privyToken = await getAccessToken();
          if (!privyToken) {
            throw new Error('No Privy token available');
          }

          // Exchange it with our backend
          const res = await fetch(`${API_URL}/api/v1/auth/privy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: privyToken }),
          });

          const data = await res.json() as {
            accessToken?: string;
            refreshToken?: string;
            user?: { id: string; email: string; verified: boolean; displayName?: string; createdAt: string };
            error?: { message: string };
          };

          if (!res.ok || !data.accessToken || !data.user) {
            throw new Error(data.error?.message || 'Wallet authentication failed');
          }

          loginWithToken(data.accessToken, data.refreshToken || '', {
            id: data.user.id,
            email: data.user.email,
            verified: data.user.verified,
            displayName: data.user.displayName,
            createdAt: data.user.createdAt,
          });

          toast.success('Signed in with wallet');
        } catch (err) {
          console.error('[PrivyBridge] Auth exchange failed:', err);
          toast.error((err as Error).message || 'Wallet sign-in failed');
          // Log out of Privy so they can retry
          try { await privyLogout(); } catch {}
        } finally {
          processingRef.current = false;
        }
      })();
    }
  }, [authenticated, isAuthenticated, getAccessToken, loginWithToken, privyLogout, processingRef]);

  return null;
}
