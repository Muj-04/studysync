'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#ffffff', fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
      padding: '24px', textAlign: 'center',
    }}>
      <div style={{
        background: 'rgba(10,15,25,0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
        padding: '40px 36px', maxWidth: 420, width: '100%',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', margin: '0 auto 20px',
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          ⚠
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 10px' }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 24px', lineHeight: 1.6 }}>
          {error.message || 'An unexpected error occurred. Our team has been notified.'}
        </p>
        <button
          onClick={reset}
          style={{
            padding: '9px 24px', borderRadius: 4,
            background: '#ffffff', color: '#0f172a',
            fontWeight: 600, fontSize: 13, border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', marginRight: 10,
          }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          style={{
            padding: '9px 24px', borderRadius: 4,
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            fontWeight: 500, fontSize: 13,
            border: '1px solid rgba(255,255,255,0.2)',
            textDecoration: 'none', display: 'inline-block',
          }}
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
