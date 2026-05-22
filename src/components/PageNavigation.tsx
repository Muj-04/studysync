'use client';
import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Minus, Pencil, ChevronDown } from 'lucide-react';

const BG_THEMES: Array<{ theme: 'white' | 'dark'; label: string; bg: string; dotColor: string }> = [
  { theme: 'white', label: 'White', bg: '#ffffff',  dotColor: 'rgba(0,0,0,0.15)' },
  { theme: 'dark',  label: 'Dark',  bg: '#1e1e2e',  dotColor: 'rgba(255,255,255,0.18)' },
];

interface Props {
  currentPage: number;
  pageCount: number;
  isBlankPage?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  onInsertBlankPage: (theme: 'white' | 'dark') => void;
  onToggleDraw?: () => void;
  isDrawing?: boolean;
  zoom: number;
  onZoomChange: (z: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHideBar: () => void;
  viewMode?: 'page' | 'scroll';
  onViewModeChange?: (mode: 'page' | 'scroll') => void;
}

function NavBtn({
  onClick, disabled, 'aria-label': ariaLabel, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  'aria-label': string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 28, height: 28, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        background: 'transparent', border: '1px solid transparent',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
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

function SmBtn({
  onClick, disabled, 'aria-label': ariaLabel, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  'aria-label': string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 24, height: 24, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5,
        background: 'transparent', border: '1px solid transparent',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
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

export default function PageNavigation({
  currentPage, pageCount, isBlankPage = false,
  onPrev, onNext, onGoToPage, onInsertBlankPage,
  onToggleDraw, isDrawing = false,
  zoom, onZoomChange, onZoomIn, onZoomOut, onHideBar,
  viewMode = 'page', onViewModeChange,
}: Props) {
  const [inputValue, setInputValue] = useState(String(currentPage));
  const [showBgPicker, setShowBgPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(String(currentPage)); }, [currentPage]);

  useEffect(() => {
    if (!showBgPicker) return;
    const fn = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowBgPicker(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [showBgPicker]);

  const commit = () => {
    const page = parseInt(inputValue, 10);
    if (!isNaN(page)) onGoToPage(page);
    else setInputValue(String(currentPage));
  };

  const canPrev    = currentPage > 1;
  const canNext    = currentPage < pageCount;
  const canZoomOut = zoom > 0.5;
  const canZoomIn  = zoom < 2;

  return (
    <div style={{
      height: 48,
      display: 'flex', alignItems: 'center',
      padding: '0 8px',
      gap: 4,
      background: 'var(--bg-sidebar)',
      borderTop: '1px solid var(--border-subtle)',
      flexShrink: 0,
      overflow: 'hidden',
      minWidth: 0,
    }}>

      {/* ── 1. Insert blank page ── */}
      <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowBgPicker((v) => !v)}
          title="Insert blank page after current"
          aria-label="Insert blank page"
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            height: 26, padding: '0 7px',
            borderRadius: 6,
            background: showBgPicker ? 'var(--bg-hover)' : 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontSize: 11.5, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.13s, color 0.13s, border-color 0.13s',
            whiteSpace: 'nowrap',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border-strong)',
          })}
          onMouseOut={(e) => {
            if (!showBgPicker) Object.assign(e.currentTarget.style, {
              background: 'transparent', color: 'var(--text-2)', borderColor: 'var(--border)',
            });
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
          <span className="hidden sm:inline">Blank</span>
          <ChevronDown size={9} strokeWidth={2.5} style={{ opacity: 0.6 }} />
        </button>

        {/* Background picker popover */}
        {showBgPicker && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}>
            <p style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8,
            }}>
              Background
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {BG_THEMES.map(({ theme, label, bg, dotColor }) => (
                <button
                  key={theme}
                  onClick={() => { onInsertBlankPage(theme); setShowBgPicker(false); }}
                  title={`Add ${label} blank page`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    border: '1px solid var(--border)', borderRadius: 6, padding: '5px 6px',
                    cursor: 'pointer', background: 'transparent', fontFamily: 'inherit',
                    minWidth: 60, transition: 'background 0.13s, border-color 0.13s',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  <div style={{
                    width: 52, height: 36, borderRadius: 3,
                    backgroundColor: bg,
                    backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.2px)`,
                    backgroundSize: '10px 10px',
                    border: '1px solid rgba(128,128,128,0.2)',
                  }} />
                  <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

      {/* ── 2. Page navigation — takes all remaining space, centered ── */}
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 3,
      }}>
        {isBlankPage && (
          <span style={{
            fontSize: 10, fontWeight: 500, flexShrink: 0,
            padding: '2px 6px', borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-2)', letterSpacing: '0.03em',
          }}>
            Blank
          </span>
        )}

        <NavBtn onClick={onPrev} disabled={!canPrev} aria-label="Previous page">
          <ChevronLeft size={15} strokeWidth={2} />
        </NavBtn>

        <form
          onSubmit={(e) => { e.preventDefault(); commit(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <input
            type="number"
            min={1} max={pageCount}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={(e) => { commit(); void e; }}
            className="app-input"
            style={{ width: 38, height: 26, textAlign: 'center', fontSize: 12.5, fontWeight: 500, padding: '0 4px' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-3)', userSelect: 'none', whiteSpace: 'nowrap' }}>
            of {pageCount}
          </span>
        </form>

        <NavBtn onClick={onNext} disabled={!canNext} aria-label="Next page">
          <ChevronRight size={15} strokeWidth={2} />
        </NavBtn>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

      {/* ── 2b. View mode icon toggle — between nav arrows and zoom ── */}
      {onViewModeChange && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            {/* Page mode — single page rectangle */}
            <button
              onClick={() => onViewModeChange('page')}
              title="Page mode"
              aria-label="Page mode"
              style={{
                width: 26, height: 26, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 5, border: 'none', cursor: 'pointer',
                background: viewMode === 'page' ? 'var(--violet-muted)' : 'transparent',
                color: viewMode === 'page' ? '#a78bfa' : 'var(--text-3)',
                transition: 'background 0.13s, color 0.13s',
              }}
              onMouseOver={(e) => {
                if (viewMode !== 'page') Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-2)' });
              }}
              onMouseOut={(e) => {
                if (viewMode !== 'page') Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' });
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="1" width="10" height="12" rx="1.2"/>
              </svg>
            </button>

            {/* Scroll mode — three stacked page rectangles */}
            <button
              onClick={() => onViewModeChange('scroll')}
              title="Scroll mode"
              aria-label="Scroll mode"
              style={{
                width: 26, height: 26, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 5, border: 'none', cursor: 'pointer',
                background: viewMode === 'scroll' ? 'var(--violet-muted)' : 'transparent',
                color: viewMode === 'scroll' ? '#a78bfa' : 'var(--text-3)',
                transition: 'background 0.13s, color 0.13s',
              }}
              onMouseOver={(e) => {
                if (viewMode !== 'scroll') Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-2)' });
              }}
              onMouseOut={(e) => {
                if (viewMode !== 'scroll') Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' });
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1"   width="12" height="3"  rx="0.7"/>
                <rect x="1" y="5.5" width="12" height="3"  rx="0.7"/>
                <rect x="1" y="10"  width="12" height="3"  rx="0.7"/>
              </svg>
            </button>
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
        </>
      )}

      {/* ── 3. Zoom controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <SmBtn onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out">
          <Minus size={12} />
        </SmBtn>

        {/* Slider + label: shown via CSS media query (.nav-zoom-slider-wrap in globals.css) */}
        <div className="nav-zoom-slider-wrap">
          <input
            type="range"
            min={50} max={200} step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
            className="zoom-slider"
            aria-label="Zoom level"
            style={{ width: 80 }}
          />
          <span style={{
            fontSize: 11, fontWeight: 500, minWidth: 30, textAlign: 'right',
            color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
          }}>
            {`${Math.round(zoom * 100)}%`}
          </span>
        </div>

        <SmBtn onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in">
          <Plus size={12} />
        </SmBtn>
      </div>

      {/* ── 4. Draw toggle (PDF pages only) ── */}
      {!isBlankPage && onToggleDraw && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
          <button
            onClick={onToggleDraw}
            title={isDrawing ? 'Exit drawing mode' : 'Annotate this page'}
            aria-label={isDrawing ? 'Exit drawing mode' : 'Annotate this page'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 26, padding: '0 8px',
              borderRadius: 6, flexShrink: 0,
              background: isDrawing ? 'var(--violet-muted)' : 'transparent',
              border: `1px solid ${isDrawing ? 'rgba(139,92,246,.35)' : 'var(--border)'}`,
              color: isDrawing ? '#a78bfa' : 'var(--text-2)',
              fontSize: 11.5, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.13s, color 0.13s, border-color 0.13s',
              whiteSpace: 'nowrap',
            }}
            onMouseOver={(e) => {
              if (!isDrawing) Object.assign(e.currentTarget.style, {
                background: 'var(--violet-muted)', borderColor: 'rgba(139,92,246,.25)', color: '#c4b5fd',
              });
            }}
            onMouseOut={(e) => {
              if (!isDrawing) Object.assign(e.currentTarget.style, {
                background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-2)',
              });
            }}
          >
            <Pencil size={11} />
            <span className="hidden sm:inline">{isDrawing ? 'Done' : 'Annotate'}</span>
          </button>
        </>
      )}

      {/* ── 5. Hide bar ── */}
      <SmBtn onClick={onHideBar} aria-label="Hide toolbar">
        <ChevronDown size={13} />
      </SmBtn>
    </div>
  );
}
