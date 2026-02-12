'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface OAuthProviders {
  google: boolean;
  github: boolean;
  privy: boolean;
}

/**
 * OAuth sign-in buttons — shown only for configured providers.
 * Fetches available providers from the backend on mount.
 */
export function OAuthButtons() {
  const [providers, setProviders] = useState<OAuthProviders | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/auth/providers`)
      .then((res) => res.json())
      .then((data) => setProviders(data as OAuthProviders))
      .catch(() => setProviders({ google: false, github: false, privy: false }));
  }, []);

  if (!providers) return null;

  const hasAny = providers.google || providers.github || providers.privy;
  if (!hasAny) return null;

  const handleOAuth = async (provider: 'google' | 'github') => {
    setLoading(provider);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });
      const data = await res.json() as { url?: string; error?: { message: string } };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error?.message || `Failed to start ${provider} sign-in`);
        setLoading(null);
      }
    } catch {
      toast.error(`Failed to start ${provider} sign-in`);
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      {providers.google && (
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={loading === 'google'}
          className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm font-medium text-[#EDEDEF] hover:bg-[#1C1C22] hover:border-[#3A3A48] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/50 focus:ring-offset-2 focus:ring-offset-[#09090B] transition-colors duration-150 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
        >
          <GoogleIcon />
          {loading === 'google' ? 'Redirecting...' : 'Continue with Google'}
        </button>
      )}

      {providers.github && (
        <button
          type="button"
          onClick={() => handleOAuth('github')}
          disabled={loading === 'github'}
          className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm font-medium text-[#EDEDEF] hover:bg-[#1C1C22] hover:border-[#3A3A48] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/50 focus:ring-offset-2 focus:ring-offset-[#09090B] transition-colors duration-150 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
        >
          <GitHubIcon />
          {loading === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
        </button>
      )}

      {providers.privy && (
        <PrivyButton />
      )}

      {/* Divider */}
      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#2A2A35]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-[#09090B] px-3 text-[#63637A]">or continue with email</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Privy wallet sign-in button.
 * Dynamically loads Privy SDK and uses the usePrivy hook to trigger login.
 * The PrivyAuthBridge component handles the post-login token exchange.
 */
function PrivyButton() {
  const [PrivyInner, setPrivyInner] = useState<any>(null);

  useEffect(() => {
    import('@privy-io/react-auth')
      .then((mod) => setPrivyInner(() => mod.usePrivy))
      .catch(() => {});
  }, []);

  if (!PrivyInner) return null;

  return <PrivyLoginButtonInner usePrivy={PrivyInner} />;
}

function PrivyLoginButtonInner({ usePrivy }: { usePrivy: any }) {
  const { login } = usePrivy();
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    login();
    setTimeout(() => setLoading(false), 5000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm font-medium text-[#EDEDEF] hover:bg-[#1C1C22] hover:border-[#3A3A48] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/50 focus:ring-offset-2 focus:ring-offset-[#09090B] transition-colors duration-150 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
    >
      <SolanaIcon />
      {loading ? 'Connecting...' : 'Continue with Solana'}
    </button>
  );
}

// =============================================================================
// Icons (inline SVG to avoid extra dependencies)
// =============================================================================

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 98 96" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6C29.304 70.67 17.9 66.352 17.9 47.217c0-5.541 2.022-10.105 5.18-13.609-.484-1.303-2.264-6.437.484-13.364 0 0 4.285-1.384 13.91 5.052 3.963-1.14 8.33-1.71 12.61-1.71 4.282 0 8.648.57 12.61 1.71 9.626-6.436 13.83-5.052 13.83-5.052 2.748 6.927.968 12.061.484 13.364 3.24 3.504 5.18 8.068 5.18 13.609 0 19.135-11.484 23.37-22.404 24.592 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0Z"/>
    </svg>
  );
}

function SolanaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 397 311" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M64.6 237.9a11.5 11.5 0 0 1 8.1-3.4h317.4c5.1 0 7.7 6.2 4 9.8l-61.3 61.3a11.5 11.5 0 0 1-8.1 3.4H7.3c-5.1 0-7.7-6.2-4-9.8l61.3-61.3Z" fill="url(#sol_a)"/>
      <path d="M64.6 3.8A11.8 11.8 0 0 1 72.7.4h317.4c5.1 0 7.7 6.2 4 9.8L332.8 71.4a11.5 11.5 0 0 1-8.1 3.4H7.3c-5.1 0-7.7-6.2-4-9.8L64.6 3.8Z" fill="url(#sol_b)"/>
      <path d="M332.8 120.2a11.5 11.5 0 0 0-8.1-3.4H7.3c-5.1 0-7.7 6.2-4 9.8l61.3 61.3a11.5 11.5 0 0 0 8.1 3.4h317.4c5.1 0 7.7-6.2 4-9.8l-61.3-61.3Z" fill="url(#sol_c)"/>
      <defs>
        <linearGradient id="sol_a" x1="360" y1="-37" x2="141" y2="350" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="sol_b" x1="264" y1="-76" x2="45" y2="311" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="sol_c" x1="312" y1="-57" x2="93" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
