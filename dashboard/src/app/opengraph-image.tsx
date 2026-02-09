import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';
export const alt = 'Uho — Agent-Native Solana Indexer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Read logo as base64
  const logoBuffer = await readFile(join(process.cwd(), 'public', 'favicon-192.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(180deg, #09090B 0%, #0C1222 50%, #09090B 100%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow effects matching hero */}
        <div
          style={{
            position: 'absolute',
            top: '-150px',
            left: '50%',
            width: '800px',
            height: '800px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.1) 0%, transparent 60%)',
            transform: 'translateX(-50%)',
            display: 'flex',
          }}
        />

        {/* Logo */}
        <img
          src={logoBase64}
          width="72"
          height="72"
          style={{ borderRadius: '16px', marginBottom: '24px' }}
        />

        {/* Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderRadius: '9999px',
            border: '1px solid rgba(34,211,238,0.3)',
            background: 'rgba(34,211,238,0.08)',
            marginBottom: '32px',
          }}
        >
          <span style={{ color: '#22D3EE', fontSize: '14px' }}>⚡</span>
          <span style={{ color: '#22D3EE', fontSize: '14px', fontWeight: 500 }}>
            Agent-native · IDL-driven · Zero config
          </span>
        </div>

        {/* Hero title — cyan first line, white second */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              fontSize: '56px',
              fontWeight: 700,
              letterSpacing: '-2px',
              lineHeight: 1.1,
              color: '#22D3EE',
            }}
          >
            Agent-native Solana Indexing
          </span>
          <span
            style={{
              fontSize: '56px',
              fontWeight: 700,
              letterSpacing: '-2px',
              lineHeight: 1.1,
              color: '#FFFFFF',
            }}
          >
            for your application
          </span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            display: 'flex',
            marginTop: '24px',
            fontSize: '20px',
            color: '#71717A',
            maxWidth: '700px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Feed it an IDL, get a typed API in minutes. Postgres tables, REST endpoints, and WebSocket subscriptions — auto-generated.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            color: '#52525B',
            fontSize: '15px',
          }}
        >
          <span>uhoindexing.com</span>
          <span style={{ color: '#3F3F46' }}>·</span>
          <span>Open Source</span>
          <span style={{ color: '#3F3F46' }}>·</span>
          <span>Free Tier Available</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
