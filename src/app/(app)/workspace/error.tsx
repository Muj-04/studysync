'use client';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#ffffff', fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
      background: 'var(--bg-app)', padding: '24px', textAlign: 'center',
    }}>
      <div style={{
        background: 'rgba(10,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '40px 36px', maxWidth: 400, width: '100%',
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Workspace Error
        </p>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 10px', color: 'var(--text-1)' }}>
          Failed to load workspace
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.6 }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              padding: '8px 20px', borderRadius: 4,
              background: '#ffffff', color: '#0f172a',
              fontWeight: 600, fontSize: 13, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
          <a
            href="/dashboard"
            style={{
              padding: '8px 20px', borderRadius: 4,
              background: 'transparent', color: 'var(--text-2)',
              fontWeight: 500, fontSize: 13,
              border: '1px solid var(--border)',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
