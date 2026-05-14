'use client';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Minus, Pencil, ChevronDown } from 'lucide-react';

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.09)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1.5px solid rgba(255,255,255,0.16)',
};

interface Props {
  currentPage: number;
  pageCount: number;
  isBlankPage?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  onInsertBlankPage: () => void;
  onToggleDraw?: () => void;
  isDrawing?: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHideBar: () => void;
}

export default function PageNavigation({
  currentPage, pageCount, isBlankPage = false,
  onPrev, onNext, onGoToPage, onInsertBlankPage,
  onToggleDraw, isDrawing = false,
  zoom, onZoomIn, onZoomOut, onHideBar,
}: Props) {
  const [inputValue, setInputValue] = useState(String(currentPage));
  useEffect(() => { setInputValue(String(currentPage)); }, [currentPage]);

  const commit = () => {
    const page = parseInt(inputValue, 10);
    if (!isNaN(page)) onGoToPage(page);
    else setInputValue(String(currentPage));
  };

  const canPrev = currentPage > 1;
  const canNext = currentPage < pageCount;
  const canZoomOut = !isBlankPage && zoom > 0.5;
  const canZoomIn = !isBlankPage && zoom < 2;

  const navBtnStyle = (enabled: boolean): React.CSSProperties => ({
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    background: enabled ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
    border: `1.5px solid ${enabled ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
    color: enabled ? '#fff' : 'rgba(255,255,255,0.18)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition: 'background 0.15s ease, border-color 0.15s ease',
    flexShrink: 0,
  });

  const zoomBtnStyle = (enabled: boolean): React.CSSProperties => ({
    width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
    background: enabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
    border: `1.5px solid ${enabled ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.05)'}`,
    color: enabled ? '#fff' : 'rgba(255,255,255,0.15)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition: 'background 0.15s ease, border-color 0.15s ease',
    flexShrink: 0,
  });

  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        ...glass,
        height: 52,
        paddingLeft: 14, paddingRight: 14,
        borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0,
        boxShadow: '0 -1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* ── Left: Insert blank page ── */}
      <button
        onClick={onInsertBlankPage}
        title="Insert blank page after current page"
        aria-label="Insert blank page"
        className="flex items-center gap-1.5 cursor-pointer"
        style={{
          height: 32, padding: '0 12px',
          borderRadius: 20, flexShrink: 0,
          background: 'rgba(255,255,255,0.12)',
          border: '1.5px solid rgba(255,255,255,0.22)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
        }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, {
          background: 'rgba(255,255,255,0.22)',
          borderColor: 'rgba(255,255,255,0.45)',
          color: '#fff',
        })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, {
          background: 'rgba(255,255,255,0.12)',
          borderColor: 'rgba(255,255,255,0.22)',
          color: 'rgba(255,255,255,0.85)',
        })}
      >
        <Plus size={12} strokeWidth={2.5} />
        <span className="hidden sm:inline">Blank</span>
      </button>

      {/* ── Center: Arrows flanking the page input ── */}
      <div className="flex items-center gap-2">
        {isBlankPage && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline-flex items-center"
            style={{ background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            Blank
          </span>
        )}

        <button
          onClick={onPrev}
          disabled={!canPrev}
          style={navBtnStyle(canPrev)}
          onMouseOver={(e) => { if (canPrev) e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
          onMouseOut={(e) => { if (canPrev) e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
          aria-label="Previous page"
        >
          <ChevronLeft size={17} strokeWidth={2.5} />
        </button>

        <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex items-center gap-2">
          <input
            type="number"
            min={1} max={pageCount}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.08)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
              e.currentTarget.style.boxShadow = 'none';
              commit();
            }}
            className="glass-input text-center text-sm font-semibold"
            style={{
              width: 44, padding: '4px 4px',
              background: 'rgba(255,255,255,0.09)',
              border: '1.5px solid rgba(255,255,255,0.25)',
              borderRadius: 9, color: '#fff', fontFamily: 'inherit',
              transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
            }}
          />
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
            / {pageCount}
          </span>
        </form>

        <button
          onClick={onNext}
          disabled={!canNext}
          style={navBtnStyle(canNext)}
          onMouseOver={(e) => { if (canNext) e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
          onMouseOut={(e) => { if (canNext) e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
          aria-label="Next page"
        >
          <ChevronRight size={17} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Right: Zoom + Draw + Hide ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={onZoomOut}
            disabled={!canZoomOut}
            style={zoomBtnStyle(canZoomOut)}
            onMouseOver={(e) => { if (canZoomOut) e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseOut={(e) => { if (canZoomOut) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            aria-label="Zoom out"
          >
            <Minus size={13} />
          </button>
          <span
            className="hidden sm:block"
            style={{
              fontSize: 11, fontWeight: 600, minWidth: 40, textAlign: 'center',
              color: isBlankPage ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}
          >
            {isBlankPage ? '—' : `${Math.round(zoom * 100)}%`}
          </span>
          <button
            onClick={onZoomIn}
            disabled={!canZoomIn}
            style={zoomBtnStyle(canZoomIn)}
            onMouseOver={(e) => { if (canZoomIn) e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseOut={(e) => { if (canZoomIn) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            aria-label="Zoom in"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

        {/* Draw toggle (PDF pages only) */}
        {!isBlankPage && onToggleDraw && (
          <button
            onClick={onToggleDraw}
            title={isDrawing ? 'Exit drawing mode' : 'Draw on this page'}
            aria-label={isDrawing ? 'Exit drawing mode' : 'Draw on this page'}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              height: 30, padding: '0 10px',
              borderRadius: 20, flexShrink: 0,
              background: isDrawing ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.1)',
              border: `1.5px solid ${isDrawing ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.2)'}`,
              color: isDrawing ? '#c4b5fd' : 'rgba(255,255,255,0.8)',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
              boxShadow: isDrawing ? '0 0 12px rgba(139,92,246,0.25)' : 'none',
            }}
            onMouseOver={(e) => {
              if (!isDrawing) Object.assign(e.currentTarget.style, {
                background: 'rgba(139,92,246,0.2)',
                borderColor: 'rgba(139,92,246,0.45)',
                color: '#ddd6fe',
              });
            }}
            onMouseOut={(e) => {
              if (!isDrawing) Object.assign(e.currentTarget.style, {
                background: 'rgba(255,255,255,0.1)',
                borderColor: 'rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.8)',
              });
            }}
          >
            <Pencil size={11} />
            <span className="hidden sm:inline">{isDrawing ? 'Done' : 'Draw'}</span>
          </button>
        )}

        {/* Hide bar button */}
        <button
          onClick={onHideBar}
          title="Hide toolbar"
          aria-label="Hide toolbar"
          style={{
            width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.06)',
            border: '1.5px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.38)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.16)', color: '#fff' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.38)' })}
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}
