'use client';
import { AlertTriangle } from 'lucide-react';
import { GhostBtn } from './controls';

export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, loading, error }: {
  title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean; error?: string;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h3>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{body}</p>
        {error && <p role="alert" style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <GhostBtn onClick={onCancel} disabled={loading}>Cancel</GhostBtn>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              height: 36, padding: '0 16px',
              background: '#ef4444', color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 12.5, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && <span className="spinner" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', flexShrink: 0 }} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
