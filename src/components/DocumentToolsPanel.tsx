'use client';
import { useRef } from 'react';
import { ImagePlus, Trash2, FileOutput, Mic, Sparkles, Languages, Table2, Quote, FunctionSquare, BookMarked } from 'lucide-react';

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
  onVoiceNote?:       () => void;
  isRecording?:       boolean;
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--text-3)',
      marginBottom: 6, paddingLeft: 2,
    }}>
      {children}
    </p>
  );
}

// ── Glass card tool button ────────────────────────────────────────────────────

function ToolCard({
  icon, title, sub, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 11px',
        borderRadius: 8,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-1)',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        transition: 'border-color 0.13s, background 0.13s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        borderColor: 'rgba(37,99,235,0.45)',
        background: 'var(--bg-hover)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        borderColor: 'var(--border)',
        background: 'var(--bg-elevated)',
      })}
    >
      <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.3 }}>{title}</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{sub}</p>
      </div>
    </button>
  );
}

// ── Quick template tile ───────────────────────────────────────────────────────

function TemplateTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
        padding: '10px 10px',
        borderRadius: 8,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-2)',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        transition: 'border-color 0.13s, background 0.13s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        borderColor: 'rgba(37,99,235,0.45)',
        background: 'var(--bg-hover)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        borderColor: 'var(--border)',
        background: 'var(--bg-elevated)',
      })}
    >
      <span style={{ color: 'var(--text-3)' }}>{icon}</span>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-2)' }}>{label}</span>
    </button>
  );
}

// ── Blank page swatches ───────────────────────────────────────────────────────

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
              width: '100%', height: 28, borderRadius: 3,
              backgroundColor: bg,
              backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.2px)`,
              backgroundSize: '10px 10px',
              border: '1px solid rgba(128,128,128,0.2)',
              boxSizing: 'border-box',
            }} />
            <span style={{
              fontSize: 10,
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

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentToolsPanel({
  isOpen, hasDocument, isBlankPage,
  onInsertBlankPage, onInsertImage, onDeleteBlankPage,
  currentBgTheme, onChangeBgTheme,
  onVoiceNote, isRecording = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside style={{ width: '100%', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
      <div style={{
        width: '100%', height: '100%',
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
            Page Tools
          </span>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>

          {/* ── AI Tools ── */}
          <div>
            <SectionLabel>AI Assistant</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ToolCard
                icon={<Sparkles size={15} />}
                title="AI Summary"
                sub="Generate a concise summary of current page content."
              />
              <ToolCard
                icon={<Languages size={15} />}
                title="Translate Section"
                sub="Select text to translate to a secondary language."
              />
            </div>
          </div>

          {/* ── Quick Templates ── */}
          <div>
            <SectionLabel>Quick Templates</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <TemplateTile icon={<Table2 size={15} />}    label="Data Table" />
              <TemplateTile icon={<Quote size={15} />}     label="Citation" />
              <TemplateTile icon={<FunctionSquare size={15} />} label="Equation" />
              <TemplateTile icon={<BookMarked size={15} />} label="Key Term" />
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ height: 1, background: 'var(--border-subtle)' }} />

          {/* ── Page Actions (blank page tools) ── */}
          <div>
            <SectionLabel>Add Blank Page</SectionLabel>
            <BgSwatches disabled={!hasDocument} onSelect={onInsertBlankPage} />
          </div>

          {/* Insert image (blank pages only) */}
          <button
            onClick={isBlankPage && onInsertImage ? () => fileInputRef.current?.click() : undefined}
            disabled={!isBlankPage || !onInsertImage}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 11px',
              borderRadius: 8,
              background: 'transparent',
              border: `1px solid ${(!isBlankPage || !onInsertImage) ? 'var(--border-subtle)' : 'var(--border)'}`,
              color: (!isBlankPage || !onInsertImage) ? 'var(--text-3)' : 'var(--text-2)',
              cursor: (!isBlankPage || !onInsertImage) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', textAlign: 'left',
              opacity: (!isBlankPage || !onInsertImage) ? 0.45 : 1,
              transition: 'background 0.13s, border-color 0.13s',
              fontSize: 12.5, fontWeight: 500,
            }}
            onMouseOver={(e) => {
              if (!isBlankPage || !onInsertImage) return;
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseOut={(e) => {
              if (!isBlankPage || !onInsertImage) return;
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <ImagePlus size={14} />
            Insert Image
          </button>

          {/* Page Background */}
          {isBlankPage && onChangeBgTheme && (
            <div>
              <SectionLabel>Page Background</SectionLabel>
              <BgSwatches active={currentBgTheme ?? 'white'} onSelect={onChangeBgTheme} />
            </div>
          )}

          {/* Delete blank page */}
          {isBlankPage && onDeleteBlankPage && (
            <button
              onClick={onDeleteBlankPage}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 11px', borderRadius: 8,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--red)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                fontSize: 12.5, fontWeight: 500,
                transition: 'background 0.13s, border-color 0.13s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--red-muted)', borderColor: 'rgba(229,72,77,.25)' })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', borderColor: 'var(--border)' })}
            >
              <Trash2 size={14} />
              Delete Page
            </button>
          )}

          <button
            disabled
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 11px', borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-3)',
              cursor: 'not-allowed', fontFamily: 'inherit', textAlign: 'left',
              fontSize: 12.5, fontWeight: 500,
              opacity: 0.45,
            }}
          >
            <FileOutput size={14} />
            Convert PPTX to PDF
          </button>
        </div>

        {/* ── Voice Note button at bottom ── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px' }}>
          <button
            onClick={onVoiceNote}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 8,
              background: isRecording ? 'rgba(229,72,77,0.1)' : 'var(--bg-elevated)',
              border: `1px solid ${isRecording ? 'rgba(229,72,77,0.3)' : 'var(--border)'}`,
              color: 'var(--text-1)',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => {
              if (!isRecording) Object.assign(e.currentTarget.style, { borderColor: 'rgba(37,99,235,0.4)', background: 'var(--bg-hover)' });
            }}
            onMouseOut={(e) => {
              if (!isRecording) Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' });
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: isRecording ? 'rgba(229,72,77,0.2)' : 'var(--bg-active)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Mic size={14} style={{ color: isRecording ? 'var(--red)' : 'var(--text-2)' }} />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: isRecording ? 'var(--red)' : 'var(--text-1)' }}>
                {isRecording ? 'Recording…' : 'Record Voice Note'}
              </span>
            </div>
            {isRecording && (
              <span className="rec-dot" style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0,
              }} />
            )}
          </button>
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
