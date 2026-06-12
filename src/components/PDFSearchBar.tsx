'use client';
import { useRef, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function NavBtn({
  onClick, disabled, title, children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, border: '1px solid transparent',
        background: 'transparent',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)',
        });
      }}
      onMouseOut={(e) => {
        Object.assign(e.currentTarget.style, {
          background: 'transparent',
          color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        });
      }}
    >
      {children}
    </button>
  );
}

export default function PDFSearchBar({
  query, onQueryChange, matchCount, activeIndex, onPrev, onNext, onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const noMatches = query.trim() !== '' && matchCount === 0;
  const counter = query.trim() === '' ? '' : matchCount === 0
    ? 'No results'
    : `${activeIndex + 1} of ${matchCount}`;

  return (
    <div style={{
      height: 44, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 6,
      background: 'var(--bg-float)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--bg-float-border)',
      zIndex: 15,
    }}>
      <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); return; }
          if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext(); }
        }}
        placeholder="Search in PDF…"
        className="app-input"
        style={{
          flex: 1, height: 28, fontSize: 13, padding: '0 8px',
          outline: noMatches ? '1.5px solid var(--red)' : undefined,
        }}
      />

      {query.trim() !== '' && (
        <span style={{
          fontSize: 11.5, whiteSpace: 'nowrap', flexShrink: 0,
          minWidth: 68, textAlign: 'right',
          color: noMatches ? 'var(--red)' : 'var(--text-3)',
        }}>
          {counter}
        </span>
      )}

      <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        <NavBtn onClick={onPrev} disabled={matchCount < 2} title="Previous match (Shift+Enter)">
          <ChevronUp size={14} />
        </NavBtn>
        <NavBtn onClick={onNext} disabled={matchCount < 2} title="Next match (Enter)">
          <ChevronDown size={14} />
        </NavBtn>
      </div>

      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

      <button
        onClick={onClose}
        title="Close search (Esc)"
        style={{
          width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 5, border: '1px solid transparent',
          background: 'transparent', color: 'var(--text-3)',
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)',
        })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-3)',
        })}
      >
        <X size={13} />
      </button>
    </div>
  );
}
