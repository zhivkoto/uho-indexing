import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Uho — Agent-Native Solana Indexer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
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
          background: 'linear-gradient(135deg, #09090B 0%, #0C1222 40%, #0A1628 70%, #09090B 100%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow effects */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '50%',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)',
            transform: 'translateX(-50%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-200px',
            right: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)',
            display: 'flex',
          }}
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
          <span style={{ color: '#22D3EE', fontSize: '16px' }}>⚡</span>
          <span style={{ color: '#22D3EE', fontSize: '16px', fontWeight: 500 }}>
            Agent-native · IDL-driven · Zero config
          </span>
        </div>

        {/* Title */}
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
              fontSize: '72px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-2px',
              lineHeight: 1.1,
            }}
          >
            Uho
          </span>
          <span
            style={{
              fontSize: '32px',
              fontWeight: 500,
              color: '#A1A1AA',
              marginTop: '8px',
            }}
          >
            Agent-Native Solana Indexer
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: 'flex',
            marginTop: '32px',
            fontSize: '20px',
            color: '#71717A',
            maxWidth: '700px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Hassle-free Solana indexing for the Agentic era.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            color: '#52525B',
            fontSize: '16px',
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
