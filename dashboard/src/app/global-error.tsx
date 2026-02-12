'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: '#09090B', color: '#EDEDEF', fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
          <h2>Something went wrong</h2>
          <button onClick={reset} style={{ padding: '0.5rem 1rem', borderRadius: '9999px', background: '#22D3EE', color: '#000', border: 'none', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
