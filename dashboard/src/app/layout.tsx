import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Uho — IDL-Driven Solana Event Indexer',
  description: 'Feed it an IDL, get a typed API in minutes. Postgres tables, REST endpoints, and WebSocket subscriptions — auto-generated from your program\'s events.',
  metadataBase: new URL('https://www.uhoindexing.com'),
  openGraph: {
    title: 'Uho — IDL-Driven Solana Event Indexer',
    description: 'Feed it an IDL, get a typed API in minutes. Postgres tables, REST endpoints, and WebSocket subscriptions — auto-generated.',
    url: 'https://www.uhoindexing.com',
    siteName: 'Uho',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Uho — IDL-Driven Solana Event Indexer',
    description: 'Feed it an IDL, get a typed API in minutes. Auto-generated Postgres tables, REST endpoints, and WebSocket subscriptions.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#09090B] text-[#EDEDEF] font-sans antialiased">
        <Providers>
          {children}
          <Toaster theme="dark" richColors position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
