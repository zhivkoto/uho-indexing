'use client';

import { type ReactNode, useEffect, useState } from 'react';

/**
 * Conditionally wraps children in PrivyProvider if NEXT_PUBLIC_PRIVY_APP_ID is set.
 * Dynamically imports @privy-io/react-auth to avoid bundling it when not needed.
 */
export function ConditionalPrivyProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return <>{children}</>;
  }

  return <PrivyWrapper appId={appId}>{children}</PrivyWrapper>;
}

function PrivyWrapper({ appId, children }: { appId: string; children: ReactNode }) {
  const [Provider, setProvider] = useState<any>(null);

  useEffect(() => {
    import('@privy-io/react-auth').then((mod) => {
      setProvider(() => mod.PrivyProvider);
    }).catch((err) => {
      console.error('[Privy] Failed to load:', err);
    });
  }, []);

  if (!Provider) {
    return <>{children}</>;
  }

  return (
    <Provider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#22D3EE',
          walletList: ['phantom', 'solflare', 'backpack', 'detected_solana_wallets'],
        },
        loginMethods: ['wallet'],
        embeddedWallets: {
          createOnLogin: 'off',
        },
      }}
    >
      {children}
    </Provider>
  );
}
