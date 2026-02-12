'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/components/auth/auth-provider';
import { ConditionalPrivyProvider } from '@/components/auth/privy-provider';
import { PrivyAuthBridge } from '@/components/auth/privy-auth-bridge';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConditionalPrivyProvider>
      <AuthProvider>
        <PrivyAuthBridge />
        {children}
      </AuthProvider>
      </ConditionalPrivyProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#16161A',
            border: '1px solid #1E1E26',
            color: '#EDEDEF',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        }}
      />
    </QueryClientProvider>
  );
}
