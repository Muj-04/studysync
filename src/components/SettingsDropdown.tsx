'use client';
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Sun, Moon, X, RotateCcw, ExternalLink } from 'lucide-react';

// ── Shared small icons ────────────────────────────────────────────────────────

function PageModeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="1" width="10" height="12" rx="1.2"/>
    </svg>
  );
}

function ScrollModeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1"   width="12" height="3" rx="0.7"/>
      <rect x="1" y="5.5" width="12" height="3" rx="0.7"/>
      <rect x="1" y="10"  width="12" height="3" rx="0.7"/>
    </svg>
  );
}

// ── Reusable option button (two-up layout) ────────────────────────────────────

function OptionBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 4,
        background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? 'var(--accent-hover)' : 'var(--text-2)',
        fontSize: 12, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)',
        });
      }}
      onMouseOut={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-elevated)', color: 'var(--text-2)',
        });
      }}
    >
      {children}
    </button>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 7px',
      }}>
        {label}
      </p>
      {children}
    </div>
  );
}

// ── Mini dotted blank-page preview swatch ─────────────────────────────────────

function BgSwatch({ theme }: { theme: 'white' | 'dark' }) {
  const dark = theme === 'dark';
  return (
    <div style={{
      width: 18, height: 13, borderRadius: 2, flexShrink: 0,
      backgroundColor: dark ? '#1e1e2e' : '#ffffff',
      backgroundImage: `radial-gradient(circle, ${dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} 1px, transparent 1px)`,
      backgroundSize: '4px 4px',
      border: '1px solid rgba(128,128,128,0.22)',
    }} />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isDark: boolean;
  onThemeChange: () => void;
  viewMode: 'page' | 'scroll';
  onViewModeChange: (m: 'page' | 'scroll') => void;
  defaultBgTheme: 'white' | 'dark';
  onDefaultBgThemeChange: (t: 'white' | 'dark') => void;
  onZoomReset: () => void;
  hasDocument: boolean;
  isPPTX: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsDropdown({
  isDark, onThemeChange,
  viewMode, onViewModeChange,
  defaultBgTheme, onDefaultBgThemeChange,
  onZoomReset,
  hasDocument, isPPTX,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>

      {/* ── Display-options trigger ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Display options"
        aria-label="Display options"
        style={{
          width: 42, height: 42,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4, flexShrink: 0,
          background: open ? 'var(--bg-active)' : 'transparent',
          border: `1px solid ${open ? 'var(--border-strong)' : 'transparent'}`,
          color: open ? 'var(--text-1)' : 'var(--text-2)',
          cursor: 'pointer',
          transition: 'background 0.13s, color 0.13s, border-color 0.13s',
        }}
        onMouseOver={(e) => {
          if (!open) Object.assign(e.currentTarget.style, {
            background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
          });
        }}
        onMouseOut={(e) => {
          if (!open) Object.assign(e.currentTarget.style, {
            background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
          });
        }}
      >
        <SlidersHorizontal size={17} />
      </button>

      {/* ── Panel ── */}
      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 248,
            transformOrigin: 'top right',
            background: 'var(--bg-float)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--bg-float-border)',
            boxShadow: 'var(--shadow-float)',
            borderRadius: 4,
            zIndex: 9999,
            padding: '14px',
          }}
        >
          {/* Panel title row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <SlidersHorizontal size={13} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
                Display options
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close display options"
              style={{
                width: 22, height: 22, borderRadius: 4,
                border: '1px solid transparent',
                background: 'transparent', color: 'var(--text-3)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
              })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent',
              })}
            >
              <X size={12} />
            </button>
          </div>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 0 14px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 1 ── View Mode */}
            {hasDocument && !isPPTX && (
              <Section label="View Mode">
                <div style={{ display: 'flex', gap: 6 }}>
                  <OptionBtn active={viewMode === 'page'} onClick={() => onViewModeChange('page')}>
                    <PageModeIcon />
                    Page by Page
                  </OptionBtn>
                  <OptionBtn active={viewMode === 'scroll'} onClick={() => onViewModeChange('scroll')}>
                    <ScrollModeIcon />
                    Scroll
                  </OptionBtn>
                </div>
              </Section>
            )}

            {/* 2 ── Theme */}
            <Section label="Theme">
              <div style={{ display: 'flex', gap: 6 }}>
                <OptionBtn active={!isDark} onClick={() => { if (isDark) onThemeChange(); }}>
                  <Sun size={13} />
                  Light
                </OptionBtn>
                <OptionBtn active={isDark} onClick={() => { if (!isDark) onThemeChange(); }}>
                  <Moon size={13} />
                  Dark
                </OptionBtn>
              </div>
            </Section>

            {/* 3 ── Default blank page */}
            <Section label="Default Blank Page">
              <div style={{ display: 'flex', gap: 6 }}>
                <OptionBtn active={defaultBgTheme === 'white'} onClick={() => onDefaultBgThemeChange('white')}>
                  <BgSwatch theme="white" />
                  White dots
                </OptionBtn>
                <OptionBtn active={defaultBgTheme === 'dark'} onClick={() => onDefaultBgThemeChange('dark')}>
                  <BgSwatch theme="dark" />
                  Dark dots
                </OptionBtn>
              </div>
            </Section>

            {/* 4 ── Zoom reset */}
            {hasDocument && (
              <Section label="Zoom">
                <button
                  onClick={() => { onZoomReset(); setOpen(false); }}
                  style={{
                    width: '100%', height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-2)',
                    fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.13s, color 0.13s, border-color 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                    background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border-strong)',
                  })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                    background: 'var(--bg-elevated)', color: 'var(--text-2)', borderColor: 'var(--border)',
                  })}
                >
                  <RotateCcw size={12} />
                  Reset zoom to 100%
                </button>
              </Section>
            )}

            {/* 5 ── Full settings link */}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            <a
              href="/settings"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 12, fontWeight: 500, color: 'var(--text-2)',
                textDecoration: 'none', padding: '4px 0',
                transition: 'color 0.13s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)'; }}
            >
              <span>All settings</span>
              <ExternalLink size={11} style={{ color: 'var(--text-3)' }} />
            </a>

          </div>
        </div>
      )}
    </div>
  );
}
