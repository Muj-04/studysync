'use client';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Compact bottom page indicator — prev/next + "X of Y" input only.
 *
 * Slimmed from the previous heavy 48px bar (which had insert-blank-page,
 * view-mode toggle, hide-bar etc.) per the bottom-area cleanup:
 *   - Insert blank page moved to BottomPillBar's Image submenu
 *   - View-mode toggle moved out (was rarely-used; PdfTopToolbar owns
 *     this kind of view chrome now)
 *   - Hide-bar dropped (no longer needed at this size)
 *
 * Height 32 · transparent over bg-app · subtle top hairline · centred.
 */

interface Props {
  currentPage: number;
  pageCount:   number;
  isBlankPage?: boolean;
  onPrev:      () => void;
  onNext:      () => void;
  onGoToPage:  (page: number) => void;
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
        width: 24, height: 24, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4,
        background: 'transparent', border: '1px solid transparent',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)',
        });
      }}
      onMouseOut={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)',
        });
      }}
    >
      {children}
    </button>
  );
}

export default function PageNavigation({
  currentPage, pageCount, isBlankPage = false,
  onPrev, onNext, onGoToPage,
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

  return (
    <div style={{
      height: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 4,
      padding: '0 12px',
      background: 'var(--bg-app)',
      borderTop: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      {isBlankPage && (
        <span style={{
          fontSize: 10, fontWeight: 500, flexShrink: 0,
          padding: '2px 6px', borderRadius: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-2)', letterSpacing: '0.03em',
          marginRight: 4,
        }}>
          Blank
        </span>
      )}

      <NavBtn onClick={onPrev} disabled={!canPrev} aria-label="Previous page">
        <ChevronLeft size={14} strokeWidth={2} />
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
          onBlur={() => commit()}
          aria-label="Current page"
          className="app-input"
          style={{
            width: 34, height: 22, textAlign: 'center',
            fontSize: 12, fontWeight: 500, padding: '0 4px',
          }}
        />
        <span style={{
          fontSize: 11.5, color: 'var(--text-3)',
          userSelect: 'none', whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}>
          of {pageCount}
        </span>
      </form>

      <NavBtn onClick={onNext} disabled={!canNext} aria-label="Next page">
        <ChevronRight size={14} strokeWidth={2} />
      </NavBtn>
    </div>
  );
}
