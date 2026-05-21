'use client';
import { useRef } from 'react';
import { ImagePlus, Trash2, FileOutput } from 'lucide-react';

const BG_THEMES: Array<{ theme: 'white' | 'dark'; label: string; bg: string; dotColor: string }> = [
  { theme: 'white', label: 'White', bg: '#ffffff',  dotColor: 'rgba(0,0,0,0.15)' },
  { theme: 'dark',  label: 'Dark',  bg: '#1e1e2e',  dotColor: 'rgba(255,255,255,0.18)' },
];

interface Props {
  isOpen:             boolean;
  hasDocument:        boolean;
  isBlankPage:        boolean;
  onInsertBlankPage:  (theme: 'white' | 'dark') => void;
  onInsertImage?:     (dataUrl: string) => void;
  onDeleteBlankPage?: () => void;
  currentBgTheme?:    'white' | 'dark';
  onChangeBgTheme?:   (theme: 'white' | 'dark') => void;
}

function ActionBtn({
  onClick, disabled, icon, label, sub, danger = false,
}: {
  onClick?: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  danger?: boolean;
}) {
  const textColor = disabled ? 'var(--text-3)' : danger ? 'var(--red)' : 'var(--text-2)';
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 3, padding: '9px 11px',
        borderRadius: 8,
        background: 'transparent',
        border: `1px solid ${disabled ? 'var(--border-subtle)' : 'var(--border)'}`,
        color: textColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', textAlign: 'left',
        opacity: disabled ? 0.45 : 1,
        transition: 'background 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = danger ? 'var(--red-muted)' : 'var(--bg-hover)';
        e.currentTarget.style.borderColor = danger ? 'rgba(229,72,77,.25)' : 'var(--border-strong)';
      }}
      onMouseOut={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'inherit' }}>{label}</span>
      </div>
      {sub && (
        <span style={{ fontSize: 10.5, color: 'var(--text-3)', paddingLeft: 24, lineHeight: 1.4 }}>
          {sub}
        </span>
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--text-3)',
      marginBottom: 6,
    }}>
      {children}
    </p>
  );
}

function BgSwatches({
  themes = BG_THEMES,
  active,
  disabled = false,
  onSelect,
}: {
  themes?: typeof BG_THEMES;
  active?: 'white' | 'dark';
  disabled?: boolean;
  onSelect: (t: 'white' | 'dark') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {themes.map(({ theme, label, bg, dotColor }) => {
        const isActive = active === theme;
        return (
          <button
            key={theme}
            onClick={() => !disabled && onSelect(theme)}
            title={`${label} dot-grid`}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 7, padding: '6px 4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: isActive ? 'var(--accent-muted)' : 'transparent',
              fontFamily: 'inherit',
              opacity: disabled ? 0.4 : 1,
              transition: 'border-color 0.13s, background 0.13s',
            }}
            onMouseOver={(e) => {
              if (disabled || isActive) return;
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseOut={(e) => {
              if (disabled || isActive) return;
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <div style={{
              width: '100%', height: 34, borderRadius: 3,
              backgroundColor: bg,
              backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.2px)`,
              backgroundSize: '10px 10px',
              border: '1px solid rgba(128,128,128,0.2)',
              boxSizing: 'border-box',
            }} />
            <span style={{
              fontSize: 10.5,
              color: isActive ? 'var(--accent)' : 'var(--text-2)',
              fontWeight: isActive ? 600 : 400,
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function DocumentToolsPanel({
  isOpen, hasDocument, isBlankPage,
  onInsertBlankPage, onInsertImage, onDeleteBlankPage,
  currentBgTheme, onChangeBgTheme,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside style={{
      width: 220,          // fixed — parent wrapper in page.tsx owns the animated width
      flexShrink: 0,
      height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{
        width: 220,
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.18s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}>
            Document Tools
          </span>
        </div>

        {/* Actions */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>

          {/* ── Add Blank Page ── */}
          <div>
            <SectionLabel>Add Blank Page</SectionLabel>
            <BgSwatches
              disabled={!hasDocument}
              onSelect={onInsertBlankPage}
            />
          </div>

          {/* ── Insert Image ── */}
          <ActionBtn
            onClick={isBlankPage && onInsertImage ? () => fileInputRef.current?.click() : undefined}
            disabled={!isBlankPage || !onInsertImage}
            icon={<ImagePlus size={14} />}
            label="Insert Image"
            sub={isBlankPage ? 'Add to blank page' : 'Select a blank page first'}
          />

          <div style={{ height: 1, background: 'var(--border)', margin: '0' }} />

          {/* ── Page Background (only on blank pages) ── */}
          {isBlankPage && onChangeBgTheme && (
            <div>
              <SectionLabel>Page Background</SectionLabel>
              <BgSwatches
                active={currentBgTheme ?? 'white'}
                onSelect={onChangeBgTheme}
              />
            </div>
          )}

          {/* ── Delete Page ── */}
          {isBlankPage && onDeleteBlankPage && (
            <ActionBtn
              onClick={onDeleteBlankPage}
              icon={<Trash2 size={14} />}
              label="Delete Page"
              sub="Remove this blank page"
              danger
            />
          )}

          <ActionBtn
            disabled
            icon={<FileOutput size={14} />}
            label="Convert PPTX to PDF"
            sub="Coming soon"
          />
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !onInsertImage) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') onInsertImage(reader.result);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />
      </div>
    </aside>
  );
}
