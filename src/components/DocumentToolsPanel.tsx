'use client';
import { useRef, useState, useEffect } from 'react';
import { ImagePlus, Trash2, FileOutput, Mic, Sparkles, Languages, Table2, Quote, FunctionSquare, BookMarked, Loader2 } from 'lucide-react';
import { callAI } from '@/lib/gemini';

// ── PDF text extraction ───────────────────────────────────────────────────────

async function extractPageText(url: string, pageNum: number): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  const doc = await pdfjs.getDocument(url).promise;
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return content.items.map((item: any) => item.str ?? '').join(' ').trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BG_THEMES: Array<{ theme: 'white' | 'dark'; label: string; bg: string; dotColor: string }> = [
  { theme: 'white', label: 'White', bg: '#ffffff',  dotColor: 'rgba(0,0,0,0.15)' },
  { theme: 'dark',  label: 'Dark',  bg: '#1e1e2e',  dotColor: 'rgba(255,255,255,0.18)' },
];

const LANGS = ['Arabic', 'French', 'Spanish'] as const;
type Lang = typeof LANGS[number];

// ── Props ─────────────────────────────────────────────────────────────────────

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
  documentUrl?:       string;
  currentPdfPage?:    number | null;
  selectedText?:      string;
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
        borderColor: 'rgba(37,99,235,0.45)', background: 'var(--bg-hover)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        borderColor: 'var(--border)', background: 'var(--bg-elevated)',
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
  documentUrl, currentPdfPage, selectedText = '',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Summary state ──────────────────────────────────────────────────────────
  const [summaryState, setSummaryState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [summaryBullets, setSummaryBullets] = useState<string[]>([]);
  const [summaryError, setSummaryError]   = useState('');

  useEffect(() => {
    setSummaryState('idle');
    setSummaryBullets([]);
    setSummaryError('');
  }, [documentUrl, currentPdfPage]);

  async function handleSummary() {
    if (!documentUrl || !currentPdfPage || isBlankPage) return;
    setSummaryState('loading');
    try {
      const text = await extractPageText(documentUrl, currentPdfPage);
      if (!text) {
        setSummaryState('error');
        setSummaryError('No extractable text found on this page (may be image-based).');
        return;
      }
      const raw = await callAI('summary', text);
      const bullets = raw
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[•\-\*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
        .filter(Boolean);
      setSummaryBullets(bullets.length ? bullets : [raw.trim()]);
      setSummaryState('done');
    } catch (e) {
      setSummaryState('error');
      setSummaryError((e as Error).message.slice(0, 120));
    }
  }

  // ── Translate state ────────────────────────────────────────────────────────
  const [translateLang, setTranslateLang]     = useState<Lang>('French');
  const [translateState, setTranslateState]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [translateResult, setTranslateResult] = useState('');
  const [translateError, setTranslateError]   = useState('');

  async function handleTranslate() {
    if (!selectedText.trim()) return;
    setTranslateState('loading');
    setTranslateResult('');
    setTranslateError('');
    try {
      const result = await callAI('translate', selectedText, translateLang);
      setTranslateResult(result.trim());
      setTranslateState('done');
    } catch (e) {
      setTranslateState('error');
      setTranslateError((e as Error).message.slice(0, 120));
    }
  }

  const canSummarize = !!documentUrl && !!currentPdfPage && !isBlankPage;
  const canTranslate = !!selectedText.trim() && translateState !== 'loading';

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

          {/* ── AI Assistant ── */}
          <div>
            <SectionLabel>AI Assistant</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* AI Summary card */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 11px',
              }}>
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>
                      AI Summary
                    </span>
                  </div>
                  <button
                    onClick={handleSummary}
                    disabled={!canSummarize || summaryState === 'loading'}
                    style={{
                      height: 22, padding: '0 9px',
                      borderRadius: 5, fontSize: 10.5, fontWeight: 500,
                      background: canSummarize && summaryState !== 'loading'
                        ? 'var(--accent)' : 'var(--bg-active)',
                      border: 'none',
                      color: canSummarize && summaryState !== 'loading'
                        ? '#fff' : 'var(--text-3)',
                      cursor: canSummarize && summaryState !== 'loading'
                        ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit', flexShrink: 0,
                      transition: 'background 0.13s',
                    }}
                    onMouseOver={(e) => {
                      if (canSummarize && summaryState !== 'loading')
                        e.currentTarget.style.background = 'var(--accent-hover)';
                    }}
                    onMouseOut={(e) => {
                      if (canSummarize && summaryState !== 'loading')
                        e.currentTarget.style.background = 'var(--accent)';
                    }}
                  >
                    {summaryState === 'done' ? 'Regenerate' : 'Generate'}
                  </button>
                </div>

                {/* Loading */}
                {summaryState === 'loading' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 4px' }}>
                    <Loader2 size={12} style={{
                      color: 'var(--accent)', flexShrink: 0,
                      animation: 'spin 0.9s linear infinite',
                    }} />
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Analyzing page…</span>
                  </div>
                )}

                {/* Bullets */}
                {summaryState === 'done' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {summaryBullets.map((bullet, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: 'var(--accent)', flexShrink: 0, marginTop: 6,
                        }} />
                        <p style={{
                          fontSize: 11.5, color: 'var(--text-2)',
                          lineHeight: 1.55, margin: 0,
                        }}>
                          {bullet}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error */}
                {summaryState === 'error' && (
                  <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4, margin: 0 }}>
                    {summaryError}
                  </p>
                )}

                {/* Idle hint */}
                {summaryState === 'idle' && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: 0 }}>
                    {!hasDocument
                      ? 'Open a PDF first.'
                      : isBlankPage
                        ? 'Not available on blank pages.'
                        : 'Generate a 3–5 bullet summary of this page.'}
                  </p>
                )}
              </div>

              {/* Translate card */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 11px',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Languages size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>
                    Translate
                  </span>
                </div>

                {/* Language pills */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {LANGS.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setTranslateLang(lang)}
                      style={{
                        flex: 1, height: 24,
                        borderRadius: 5, fontSize: 10, fontWeight: 600,
                        background: translateLang === lang ? 'var(--accent-muted)' : 'transparent',
                        border: `1px solid ${translateLang === lang ? 'var(--accent)' : 'var(--border)'}`,
                        color: translateLang === lang ? 'var(--accent-hover)' : 'var(--text-3)',
                        cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em',
                        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                      }}
                    >
                      {lang === 'Arabic' ? 'AR' : lang === 'French' ? 'FR' : 'ES'}
                    </button>
                  ))}
                </div>

                {/* Selected text preview */}
                {selectedText.trim() ? (
                  <div style={{
                    fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.45,
                    background: 'var(--bg-active)', borderRadius: 5,
                    padding: '5px 8px', marginBottom: 8,
                    border: '1px solid var(--border-subtle)',
                    fontStyle: 'italic',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    &ldquo;{selectedText.slice(0, 150)}{selectedText.length > 150 ? '…' : ''}&rdquo;
                  </div>
                ) : (
                  <p style={{
                    fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 8,
                  }}>
                    Select text on the PDF page.
                  </p>
                )}

                {/* Translate button */}
                <button
                  onClick={handleTranslate}
                  disabled={!canTranslate}
                  style={{
                    width: '100%', height: 28,
                    borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                    background: canTranslate ? 'var(--accent)' : 'var(--bg-active)',
                    border: 'none',
                    color: canTranslate ? '#fff' : 'var(--text-3)',
                    cursor: canTranslate ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background 0.13s',
                  }}
                  onMouseOver={(e) => {
                    if (canTranslate) e.currentTarget.style.background = 'var(--accent-hover)';
                  }}
                  onMouseOut={(e) => {
                    if (canTranslate) e.currentTarget.style.background = 'var(--accent)';
                  }}
                >
                  {translateState === 'loading' ? (
                    <>
                      <Loader2 size={12} style={{ animation: 'spin 0.9s linear infinite' }} />
                      Translating…
                    </>
                  ) : (
                    `Translate to ${translateLang}`
                  )}
                </button>

                {/* Translation result */}
                {translateState === 'done' && translateResult && (
                  <div style={{
                    marginTop: 8,
                    background: 'var(--bg-active)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6, padding: '8px 9px',
                  }}>
                    <p style={{
                      fontSize: 11.5, color: 'var(--text-1)',
                      lineHeight: 1.6, margin: 0,
                    }}>
                      {translateResult}
                    </p>
                  </div>
                )}

                {/* Error */}
                {translateState === 'error' && (
                  <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4, marginTop: 6 }}>
                    {translateError}
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* ── Quick Templates ── */}
          <div>
            <SectionLabel>Quick Templates</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <TemplateTile icon={<Table2 size={15} />}         label="Data Table" />
              <TemplateTile icon={<Quote size={15} />}          label="Citation" />
              <TemplateTile icon={<FunctionSquare size={15} />} label="Equation" />
              <TemplateTile icon={<BookMarked size={15} />}     label="Key Term" />
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ height: 1, background: 'var(--border-subtle)' }} />

          {/* ── Add Blank Page ── */}
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
              padding: '9px 11px', borderRadius: 8,
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

          {/* Page Background (blank pages only) */}
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
              onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                background: 'var(--red-muted)', borderColor: 'rgba(229,72,77,.25)',
              })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                background: 'transparent', borderColor: 'var(--border)',
              })}
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
              padding: '10px 12px', borderRadius: 8,
              background: isRecording ? 'rgba(229,72,77,0.1)' : 'var(--bg-elevated)',
              border: `1px solid ${isRecording ? 'rgba(229,72,77,0.3)' : 'var(--border)'}`,
              color: 'var(--text-1)',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => {
              if (!isRecording) Object.assign(e.currentTarget.style, {
                borderColor: 'rgba(37,99,235,0.4)', background: 'var(--bg-hover)',
              });
            }}
            onMouseOut={(e) => {
              if (!isRecording) Object.assign(e.currentTarget.style, {
                borderColor: 'var(--border)', background: 'var(--bg-elevated)',
              });
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
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--red)', flexShrink: 0,
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
