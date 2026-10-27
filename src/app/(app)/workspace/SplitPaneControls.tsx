import { FilePlus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PDFDocument } from '@/types';

function MiniBtn({
  onClick, disabled, children, title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 22, height: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, flexShrink: 0,
        background: 'transparent',
        border: '1px solid transparent',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, fontFamily: 'inherit', fontWeight: 500,
        opacity: disabled ? 0.45 : 1,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
        });
      }}
    >
      {children}
    </button>
  );
}

// ── Right pane header ─────────────────────────────────────────────────────────

export function RightPaneHeader({
  rightSideMode, setRightSideMode,
  documents, rightDocId, setRightDocId,
  rightDoc, rightDocPage, setRightDocPage,
  rightZoom, onRightZoomChange,
}: {
  rightSideMode: 'blank' | 'document';
  setRightSideMode: (m: 'blank' | 'document') => void;
  documents: PDFDocument[];
  rightDocId: string | null;
  setRightDocId: (id: string | null) => void;
  rightDoc: PDFDocument | null;
  rightDocPage: number;
  setRightDocPage: (p: number) => void;
  rightZoom: number;
  onRightZoomChange: (z: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div style={{
      height: 34, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 8px', gap: 5,
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Mode toggle pills */}
      <div style={{
        display: 'flex', gap: 1,
        background: 'var(--bg-elevated)',
        borderRadius: 4, padding: 2, flexShrink: 0,
      }}>
        {(['blank', 'document'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setRightSideMode(m)}
            style={{
              height: 20, padding: '0 7px',
              borderRadius: 3, fontSize: 10.5, fontWeight: 500,
              background: rightSideMode === m ? 'var(--bg-active)' : 'transparent',
              border: `1px solid ${rightSideMode === m ? 'var(--border-strong)' : 'transparent'}`,
              color: rightSideMode === m ? 'var(--text-1)' : 'var(--text-3)',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {m === 'blank' ? t('ws_blank_tab') : t('ws_doc_tab')}
          </button>
        ))}
      </div>

      {/* Document picker (doc mode only) */}
      {rightSideMode === 'document' && (
        <select
          value={rightDocId ?? ''}
          onChange={(e) => setRightDocId(e.target.value || null)}
          className="app-input"
          style={{ flex: 1, height: 22, fontSize: 10.5, padding: '0 4px', minWidth: 0 }}
        >
          <option value="">Pick document…</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}

      {rightSideMode === 'blank' && <div style={{ flex: 1 }} />}

      {/* Page nav — doc mode with a doc selected */}
      {rightSideMode === 'document' && rightDoc && (
        <>
          <MiniBtn
            onClick={() => setRightDocPage(Math.max(1, rightDocPage - 1))}
            disabled={rightDocPage <= 1}
            title="Previous page"
          >
            ‹
          </MiniBtn>
          <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {rightDocPage}/{rightDoc.pageCount}
          </span>
          <MiniBtn
            onClick={() => setRightDocPage(Math.min(rightDoc!.pageCount, rightDocPage + 1))}
            disabled={rightDocPage >= rightDoc.pageCount}
            title="Next page"
          >
            ›
          </MiniBtn>
          <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0, margin: '0 1px' }} />
        </>
      )}

      {/* Zoom controls (always shown) */}
      <MiniBtn
        onClick={() => onRightZoomChange(rightZoom - 0.1)}
        disabled={rightZoom <= 0.5}
        title="Zoom out"
      >
        −
      </MiniBtn>
      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={Math.round(rightZoom * 100)}
        onChange={(e) => onRightZoomChange(Number(e.target.value) / 100)}
        className="zoom-slider"
        aria-label="Zoom level"
        style={{ width: 64 }}
      />
      <span style={{
        fontSize: 10, color: 'var(--text-3)',
        minWidth: 30, textAlign: 'center', flexShrink: 0,
        fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
      }}>
        {Math.round(rightZoom * 100)}%
      </span>
      <MiniBtn
        onClick={() => onRightZoomChange(rightZoom + 0.1)}
        disabled={rightZoom >= 2.0}
        title="Zoom in"
      >
        +
      </MiniBtn>
    </div>
  );
}

// ── Pane empty states ─────────────────────────────────────────────────────────

export function BlankPaneEmpty({ onAdd }: { onAdd: () => void }) {
  const { t } = useLanguage();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, background: 'var(--bg-app)', padding: 32,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FilePlus size={20} style={{ color: 'var(--text-3)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
          {t('ws_no_blank_page')}
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {t('ws_add_blank_hint')}
        </p>
      </div>
      <button
        onClick={onAdd}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 16px',
          borderRadius: 4,
          background: '#ffffff',
          border: '1px solid transparent',
          color: '#0f172a',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 500,
          transition: 'background 0.13s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = '#ffffff'; }}
      >
        <FilePlus size={13} />
        {t('ws_add_blank')}
      </button>
    </div>
  );
}

export function DocPickEmpty() {
  const { t } = useLanguage();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 8, background: 'var(--bg-app)', padding: 32,
    }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{t('ws_no_doc_selected')}</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
        {t('ws_choose_doc_hint')}
      </p>
    </div>
  );
}
