'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAccessToken, setRefreshToken } from '@/lib/auth';

/**
 * OAuth callback page — receives tokens from the URL fragment (hash)
 * and stores them before redirecting to the dashboard.
 *
 * Tokens are passed via fragment (#access_token=...&refresh_token=...)
 * rather than query params to prevent leakage in server logs, browser
 * history, and Referer headers.
 */
function CallbackHandler() {
  const router = useRouter();

  useEffect(() => {
    // Parse tokens from URL fragment (hash), not query params
    const hash = window.location.hash.substring(1); // remove leading '#'
    const params = new URLSearchParams(hash);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      setAccessToken(accessToken);
      setRefreshToken(refreshToken);

      // Clear the fragment from the URL to avoid token persistence in browser history
      window.history.replaceState(null, '', window.location.pathname);

      router.replace('/dashboard');
    } else {
      router.replace('/login?error=oauth_failed');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#22D3EE]/30 border-t-[#22D3EE] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-[#A0A0AB]">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#22D3EE]/30 border-t-[#22D3EE] rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
