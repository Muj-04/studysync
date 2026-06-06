'use client';
import { useRef, useState, useEffect } from 'react';
import {
  ImagePlus, Trash2, FileOutput, Mic,
  Sparkles, Languages, Lightbulb,
  Table2, Quote, FunctionSquare, BookMarked,
  Loader2, Maximize2, Copy, Check, X, Users, Eraser,
} from 'lucide-react';
import { callAI } from '@/lib/gemini';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import type { TextNote, KeyTerm } from '@/types';

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
  activeDocumentId?:  string;
  onInsertTextNote?:  (note: Omit<TextNote, 'id'>) => void;
  onInsertBlankPageWithGrid?: (rows: number, cols: number) => void;
  onCreateRoom?:      () => void;
  onClearAllDrawings?: () => void;
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

function TemplateTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
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

// ── Expand icon button ────────────────────────────────────────────────────────

function ExpandBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Expand result"
      style={{
        width: 20, height: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, border: '1px solid transparent',
        background: 'transparent', color: 'var(--text-3)',
        cursor: 'pointer', flexShrink: 0,
        transition: 'color 0.12s, background 0.12s, border-color 0.12s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        color: 'var(--text-1)', background: 'var(--bg-hover)', borderColor: 'var(--border)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        color: 'var(--text-3)', background: 'transparent', borderColor: 'transparent',
      })}
    >
      <Maximize2 size={11} />
    </button>
  );
}

// ── Result modal ──────────────────────────────────────────────────────────────

interface ModalData {
  title:    string;
  content:  React.ReactNode;
  copyText: string;
}

function ResultModal({ title, content, copyText, onClose }: ModalData & { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(copyText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{
          width: '100%', maxWidth: 620,
          maxHeight: '82vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '15px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, border: '1px solid transparent',
              background: 'transparent', color: 'var(--text-3)',
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s, border-color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent',
            })}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          {content}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 16px',
              borderRadius: 7,
              background: copied ? 'var(--green)' : 'var(--bg-elevated)',
              border: `1px solid ${copied ? 'transparent' : 'var(--border)'}`,
              color: copied ? '#fff' : 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 500,
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared action button ──────────────────────────────────────────────────────

function ActionBtn({
  onClick, disabled, loading, loadingLabel, label,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  loadingLabel: string;
  label: string;
}) {
  const active = !disabled && !loading;
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        height: 22, padding: '0 9px',
        borderRadius: 5, fontSize: 10.5, fontWeight: 500,
        background: active ? 'var(--accent)' : 'var(--bg-active)',
        border: 'none',
        color: active ? '#fff' : 'var(--text-3)',
        cursor: active ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit', flexShrink: 0,
        transition: 'background 0.13s',
      }}
      onMouseOver={(e) => { if (active) e.currentTarget.style.background = 'var(--accent-hover)'; }}
      onMouseOut={(e)  => { if (active) e.currentTarget.style.background = 'var(--accent)'; }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentToolsPanel({
  isOpen, hasDocument, isBlankPage,
  onInsertBlankPage, onInsertImage, onDeleteBlankPage,
  currentBgTheme, onChangeBgTheme,
  onVoiceNote, isRecording = false,
  documentUrl, currentPdfPage, selectedText = '',
  activeDocumentId,
  onInsertTextNote,
  onInsertBlankPageWithGrid,
  onCreateRoom,
  onClearAllDrawings,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalData | null>(null);

  // ── Data Table modal ───────────────────────────────────────────────────────
  const [dataTableOpen, setDataTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(4);
  const [tableCols, setTableCols] = useState(4);

  // ── Citation modal ─────────────────────────────────────────────────────────
  const [citationOpen, setCitationOpen] = useState(false);
  const [citAuthor, setCitAuthor] = useState('');
  const [citTitle, setCitTitle] = useState('');
  const [citYear, setCitYear] = useState('');
  const [citPublisher, setCitPublisher] = useState('');
  const [citCopied, setCitCopied] = useState(false);

  // ── Equation modal ─────────────────────────────────────────────────────────
  const [equationOpen, setEquationOpen] = useState(false);
  const [equationText, setEquationText] = useState('');

  // ── Clear drawings confirmation ────────────────────────────────────────────
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // ── Key Term modal ─────────────────────────────────────────────────────────
  const [keyTermOpen, setKeyTermOpen] = useState(false);
  const [ktTerm, setKtTerm] = useState('');
  const [ktDef, setKtDef] = useState('');
  const [keyTerms, setKeyTerms] = useState<KeyTerm[]>([]);

  useEffect(() => {
    if (!activeDocumentId) { setKeyTerms([]); return; }
    const stored = storageGet<Record<string, KeyTerm[]>>(KEYS.KEY_TERMS);
    setKeyTerms(stored?.[activeDocumentId] ?? []);
  }, [activeDocumentId]);

  function persistKeyTerms(terms: KeyTerm[]) {
    if (!activeDocumentId) return;
    const stored = storageGet<Record<string, KeyTerm[]>>(KEYS.KEY_TERMS) ?? {};
    stored[activeDocumentId] = terms;
    storageSet(KEYS.KEY_TERMS, stored);
    setKeyTerms(terms);
  }

  function formatAPA(): string {
    const parts: string[] = [];
    if (citAuthor.trim()) parts.push(citAuthor.trim());
    if (citYear.trim()) parts.push(`(${citYear.trim()})`);
    if (citTitle.trim()) parts.push(citTitle.trim());
    if (citPublisher.trim()) parts.push(citPublisher.trim());
    return parts.length > 0 ? parts.join('. ') + '.' : '';
  }

  function handleInsertCitation() {
    const text = formatAPA();
    if (!text || !onInsertTextNote) return;
    onInsertTextNote({ x: 5, y: 5, width: 90, height: 20, content: text, fontSize: 13, color: '#93c5fd' });
    setCitationOpen(false);
  }

  function handleCopyCitation() {
    navigator.clipboard.writeText(formatAPA()).catch(() => {});
    setCitCopied(true);
    setTimeout(() => setCitCopied(false), 2000);
  }

  function handleInsertEquation() {
    if (!equationText.trim() || !onInsertTextNote) return;
    onInsertTextNote({ x: 5, y: 5, width: 90, height: 15, content: equationText.trim(), fontSize: 16, color: '#a5f3fc' });
    setEquationOpen(false);
    setEquationText('');
  }

  function handleSaveKeyTerm() {
    if (!ktTerm.trim()) return;
    const newTerm: KeyTerm = {
      id: `kt_${Date.now()}`,
      documentId: activeDocumentId ?? '',
      term: ktTerm.trim(),
      definition: ktDef.trim(),
      createdAt: Date.now(),
    };
    const updated = [...keyTerms, newTerm];
    persistKeyTerms(updated);
    if (onInsertTextNote) {
      const content = ktDef.trim() ? `${ktTerm.trim()}: ${ktDef.trim()}` : ktTerm.trim();
      onInsertTextNote({ x: 5, y: 5, width: 90, height: 20, content, fontSize: 13, color: '#fde68a' });
    }
    setKtTerm('');
    setKtDef('');
  }

  function handleDeleteKeyTerm(id: string) {
    const updated = keyTerms.filter((kt) => kt.id !== id);
    persistKeyTerms(updated);
  }

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

  function openSummaryModal() {
    setModal({
      title: 'AI Summary',
      copyText: summaryBullets.map((b, i) => `${i + 1}. ${b}`).join('\n'),
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {summaryBullets.map((bullet, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent)', flexShrink: 0, marginTop: 9,
              }} />
              <p style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.7, margin: 0 }}>
                {bullet}
              </p>
            </div>
          ))}
        </div>
      ),
    });
  }

  // ── Explain state ──────────────────────────────────────────────────────────
  const [explainState, setExplainState]       = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [explainText, setExplainText]         = useState('');
  const [explainExamples, setExplainExamples] = useState<string[]>([]);
  const [explainError, setExplainError]       = useState('');
  const [explainSource, setExplainSource]     = useState('');

  async function handleExplain() {
    if (!selectedText.trim()) return;
    setExplainState('loading');
    setExplainText('');
    setExplainExamples([]);
    setExplainError('');
    setExplainSource(selectedText.slice(0, 80) + (selectedText.length > 80 ? '…' : ''));
    try {
      const raw = await callAI('explain', selectedText);
      const explanationMatch = raw.match(/EXPLANATION\s*\n([\s\S]*?)(?=\nEXAMPLES|\s*$)/i);
      const examplesMatch    = raw.match(/EXAMPLES\s*\n([\s\S]*)/i);
      const explanation = explanationMatch ? explanationMatch[1].trim() : raw.trim();
      const examples = examplesMatch
        ? examplesMatch[1]
            .split('\n')
            .map(l => l.replace(/^\s*[\d]+[.)]\s*/, '').replace(/^\s*[-•]\s*/, '').trim())
            .filter(Boolean)
        : [];
      setExplainText(explanation);
      setExplainExamples(examples);
      setExplainState('done');
    } catch (e) {
      setExplainState('error');
      setExplainError((e as Error).message.slice(0, 120));
    }
  }

  function openExplainModal() {
    const copyText = [
      explainText && `Explanation:\n${explainText}`,
      explainExamples.length > 0 && `\nExamples:\n${explainExamples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}`,
    ].filter(Boolean).join('\n');

    setModal({
      title: 'Explain Concept',
      copyText,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {explainSource && (
            <p style={{
              fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic',
              lineHeight: 1.5, margin: 0,
              borderLeft: '2px solid var(--border)', paddingLeft: 12,
            }}>
              &ldquo;{explainSource}&rdquo;
            </p>
          )}
          {explainText && (
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10,
              }}>
                Explanation
              </p>
              <p style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.75, margin: 0 }}>
                {explainText}
              </p>
            </div>
          )}
          {explainExamples.length > 0 && (
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10,
              }}>
                Examples
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {explainExamples.map((ex, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--accent)',
                      flexShrink: 0, lineHeight: 1.75, minWidth: 18,
                    }}>
                      {i + 1}.
                    </span>
                    <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
                      {ex}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    });
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

  function openTranslateModal() {
    setModal({
      title: `Translation → ${translateLang}`,
      copyText: translateResult,
      content: (
        <div>
          {selectedText && (
            <p style={{
              fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic',
              lineHeight: 1.5, marginBottom: 20,
              borderLeft: '2px solid var(--border)', paddingLeft: 12,
            }}>
              &ldquo;{selectedText.slice(0, 200)}{selectedText.length > 200 ? '…' : ''}&rdquo;
            </p>
          )}
          <p style={{ fontSize: 16, color: 'var(--text-1)', lineHeight: 1.8, margin: 0 }}>
            {translateResult}
          </p>
        </div>
      ),
    });
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const canSummarize = !!documentUrl && !!currentPdfPage && !isBlankPage;
  const canExplain   = !!selectedText.trim() && explainState !== 'loading';
  const canTranslate = !!selectedText.trim() && translateState !== 'loading';

  return (
    <>
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

            {/* ══ AI ASSISTANT ══ */}
            <div>
              <SectionLabel>AI Assistant</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* ── AI Summary card ── */}
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 11px',
                }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {summaryState === 'done' && (
                        <ExpandBtn onClick={openSummaryModal} />
                      )}
                      <ActionBtn
                        onClick={handleSummary}
                        disabled={!canSummarize}
                        loading={summaryState === 'loading'}
                        loadingLabel="…"
                        label={summaryState === 'done' ? 'Regenerate' : 'Generate'}
                      />
                    </div>
                  </div>

                  {summaryState === 'loading' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 4px' }}>
                      <Loader2 size={12} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 0.9s linear infinite' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Analyzing page…</span>
                    </div>
                  )}

                  {summaryState === 'done' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {summaryBullets.map((bullet, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{
                            width: 4, height: 4, borderRadius: '50%',
                            background: 'var(--accent)', flexShrink: 0, marginTop: 6,
                          }} />
                          <p style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
                            {bullet}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {summaryState === 'error' && (
                    <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4, margin: 0 }}>
                      {summaryError}
                    </p>
                  )}

                  {summaryState === 'idle' && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: 0 }}>
                      {!hasDocument ? 'Open a PDF first.'
                        : isBlankPage ? 'Not available on blank pages.'
                        : 'Generate a 3–5 bullet summary of this page.'}
                    </p>
                  )}
                </div>

                {/* ── Explain Concept card ── */}
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 11px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lightbulb size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>
                        Explain Concept
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {explainState === 'done' && (
                        <ExpandBtn onClick={openExplainModal} />
                      )}
                      <ActionBtn
                        onClick={handleExplain}
                        disabled={!canExplain}
                        loading={explainState === 'loading'}
                        loadingLabel="…"
                        label={explainState === 'done' ? 'Re-explain' : 'Explain'}
                      />
                    </div>
                  </div>

                  {explainState === 'idle' && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: 0 }}>
                      {selectedText.trim()
                        ? `"${selectedText.slice(0, 60)}${selectedText.length > 60 ? '…' : ''}"`
                        : 'Select text on the PDF to explain it.'}
                    </p>
                  )}

                  {explainState === 'loading' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0 4px' }}>
                      <Loader2 size={12} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 0.9s linear infinite' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Generating explanation…</span>
                    </div>
                  )}

                  {explainState === 'done' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {explainSource && (
                        <p style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.3, margin: 0 }}>
                          &ldquo;{explainSource}&rdquo;
                        </p>
                      )}
                      {explainText && (
                        <div>
                          <p style={{
                            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3,
                          }}>
                            Explanation
                          </p>
                          <p style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.6, margin: 0 }}>
                            {explainText}
                          </p>
                        </div>
                      )}
                      {explainExamples.length > 0 && (
                        <div>
                          <p style={{
                            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3,
                          }}>
                            Examples
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {explainExamples.map((ex, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, lineHeight: 1.7 }}>
                                  {i + 1}.
                                </span>
                                <p style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
                                  {ex}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {explainState === 'error' && (
                    <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4, margin: 0 }}>
                      {explainError}
                    </p>
                  )}
                </div>

              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            {/* ══ TRANSLATE ══ */}
            <div>
              <SectionLabel>Translate</SectionLabel>

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
                  <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 8 }}>
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
                  onMouseOver={(e) => { if (canTranslate) e.currentTarget.style.background = 'var(--accent-hover)'; }}
                  onMouseOut={(e)  => { if (canTranslate) e.currentTarget.style.background = 'var(--accent)'; }}
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
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--accent)',
                      }}>
                        Result
                      </span>
                      <ExpandBtn onClick={openTranslateModal} />
                    </div>
                    <div style={{
                      background: 'var(--bg-active)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6, padding: '8px 9px',
                    }}>
                      <p style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.6, margin: 0 }}>
                        {translateResult}
                      </p>
                    </div>
                  </div>
                )}

                {translateState === 'error' && (
                  <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4, marginTop: 6 }}>
                    {translateError}
                  </p>
                )}
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            {/* ── Quick Templates ── */}
            <div>
              <SectionLabel>Quick Templates</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <TemplateTile icon={<Table2 size={15} />}         label="Data Table"  onClick={() => setDataTableOpen(true)} />
                <TemplateTile icon={<Quote size={15} />}          label="Citation"    onClick={() => setCitationOpen(true)} />
                <TemplateTile icon={<FunctionSquare size={15} />} label="Equation"    onClick={() => setEquationOpen(true)} />
                <TemplateTile icon={<BookMarked size={15} />}     label="Key Term"    onClick={() => setKeyTermOpen(true)} />
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

            {/* Clear all drawings (PDF pages only) */}
            {onClearAllDrawings && !isBlankPage && (
              <button
                onClick={() => setConfirmClearOpen(true)}
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
                <Eraser size={14} />
                Clear All Drawings
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

          {/* ── Create Study Room button ── */}
          {onCreateRoom && (
            <div style={{ padding: '0 10px 0' }}>
              <button
                onClick={onCreateRoom}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.13s, border-color 0.13s',
                }}
                onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                  borderColor: 'rgba(37,99,235,0.4)', background: 'var(--bg-hover)',
                })}
                onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                  borderColor: 'var(--border)', background: 'var(--bg-elevated)',
                })}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'var(--bg-active)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Users size={14} style={{ color: 'var(--text-2)' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}>
                    Create Study Room
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                    Collaborate in real-time
                  </div>
                </div>
              </button>
            </div>
          )}

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

      {/* ── Result modal ── */}
      {modal && (
        <ResultModal
          title={modal.title}
          content={modal.content}
          copyText={modal.copyText}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Data Table modal ── */}
      {dataTableOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setDataTableOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 420, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.65)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Table2 size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Insert Data Table</span>
              </div>
              <button onClick={() => setDataTableOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>

            <div style={{ padding: '20px 20px 8px' }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rows</p>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[2,3,4,5,6,7,8].map((n) => (
                    <button key={n} onClick={() => setTableRows(n)} style={{ width: 34, height: 30, borderRadius: 6, border: `1px solid ${tableRows === n ? 'var(--accent)' : 'var(--border)'}`, background: tableRows === n ? 'var(--accent-muted)' : 'transparent', color: tableRows === n ? 'var(--accent-hover)' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.1s' }}>{n}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Columns</p>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[2,3,4,5,6,7,8].map((n) => (
                    <button key={n} onClick={() => setTableCols(n)} style={{ width: 34, height: 30, borderRadius: 6, border: `1px solid ${tableCols === n ? 'var(--accent)' : 'var(--border)'}`, background: tableCols === n ? 'var(--accent-muted)' : 'transparent', color: tableCols === n ? 'var(--accent-hover)' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.1s' }}>{n}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tableCols}, 1fr)`, border: '1px solid var(--border-strong)', borderRadius: 6, overflow: 'hidden', height: Math.min(tableRows * 24, 168) }}>
                  {Array.from({ length: tableRows * tableCols }).map((_, i) => (
                    <div key={i} style={{ borderRight: (i % tableCols < tableCols - 1) ? '1px solid var(--border)' : 'none', borderBottom: Math.floor(i / tableCols) < tableRows - 1 ? '1px solid var(--border)' : 'none', background: Math.floor(i / tableCols) === 0 ? 'var(--bg-active)' : 'transparent' }} />
                  ))}
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>{tableRows} rows × {tableCols} columns</p>
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { onInsertBlankPageWithGrid?.(tableRows, tableCols); setDataTableOpen(false); }}
                disabled={!onInsertBlankPageWithGrid}
                style={{ height: 32, padding: '0 18px', borderRadius: 7, background: onInsertBlankPageWithGrid ? 'var(--accent)' : 'var(--bg-active)', border: 'none', color: onInsertBlankPageWithGrid ? '#fff' : 'var(--text-3)', cursor: onInsertBlankPageWithGrid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500 }}
              >
                Insert Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Citation modal ── */}
      {citationOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setCitationOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 480, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.65)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Quote size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Insert Citation</span>
              </div>
              <button onClick={() => setCitationOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>

            <div style={{ padding: '20px' }}>
              {([
                { label: 'Author', value: citAuthor, setter: setCitAuthor, placeholder: 'e.g., Smith, J. A.' },
                { label: 'Title', value: citTitle, setter: setCitTitle, placeholder: 'Title of the work' },
                { label: 'Year', value: citYear, setter: setCitYear, placeholder: 'e.g., 2024' },
                { label: 'Publisher / URL', value: citPublisher, setter: setCitPublisher, placeholder: 'Publisher or URL' },
              ] as { label: string; value: string; setter: (v: string) => void; placeholder: string }[]).map(({ label, value, setter, placeholder }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
                  <input type="text" value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder} className="app-input" style={{ width: '100%', height: 32, fontSize: 12.5, padding: '0 10px', borderRadius: 6, boxSizing: 'border-box' }} />
                </div>
              ))}

              {formatAPA() && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Formatted (APA)</p>
                  <div style={{ background: 'var(--bg-active)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 12px' }}>
                    <p style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.6, margin: 0 }}>{formatAPA()}</p>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleCopyCitation}
                disabled={!formatAPA()}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, background: citCopied ? 'var(--green)' : 'var(--bg-elevated)', border: `1px solid ${citCopied ? 'transparent' : 'var(--border)'}`, color: citCopied ? '#fff' : 'var(--text-2)', cursor: formatAPA() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, opacity: formatAPA() ? 1 : 0.5 }}
              >
                {citCopied ? <Check size={12} /> : <Copy size={12} />}
                {citCopied ? 'Copied!' : 'Copy APA'}
              </button>
              <button
                onClick={handleInsertCitation}
                disabled={!formatAPA() || !onInsertTextNote}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, background: (formatAPA() && onInsertTextNote) ? 'var(--accent)' : 'var(--bg-active)', border: 'none', color: (formatAPA() && onInsertTextNote) ? '#fff' : 'var(--text-3)', cursor: (formatAPA() && onInsertTextNote) ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12, fontWeight: 500 }}
              >
                Insert as Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Equation modal ── */}
      {equationOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setEquationOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 420, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.65)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FunctionSquare size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Insert Equation</span>
              </div>
              <button onClick={() => setEquationOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>

            <div style={{ padding: '20px' }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Equation</label>
              <input
                type="text"
                value={equationText}
                onChange={(e) => setEquationText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && equationText.trim()) handleInsertEquation(); }}
                placeholder="e.g., E = mc², ∫₀^∞ e^-x dx = 1"
                className="app-input"
                style={{ width: '100%', height: 40, fontSize: 15, padding: '0 12px', borderRadius: 6, fontFamily: 'monospace', boxSizing: 'border-box' }}
                autoFocus
              />
              <p style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
                Use Unicode math symbols: ², ³, √, ∫, ∑, π, ±, ≈, ≠, ∞, α, β, θ…
              </p>
              {equationText.trim() && (
                <div style={{ marginTop: 14, background: 'var(--bg-active)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 18, color: 'var(--text-1)', margin: 0, fontFamily: 'monospace', letterSpacing: '0.03em' }}>{equationText}</p>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleInsertEquation}
                disabled={!equationText.trim() || !onInsertTextNote}
                style={{ height: 32, padding: '0 18px', borderRadius: 7, background: (equationText.trim() && onInsertTextNote) ? 'var(--accent)' : 'var(--bg-active)', border: 'none', color: (equationText.trim() && onInsertTextNote) ? '#fff' : 'var(--text-3)', cursor: (equationText.trim() && onInsertTextNote) ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500 }}
              >
                Insert as Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear All Drawings confirmation ── */}
      {confirmClearOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setConfirmClearOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eraser size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                  Clear All Drawings
                </span>
              </div>
              <button
                onClick={() => setConfirmClearOpen(false)}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 6, border: '1px solid transparent',
                  background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.6, margin: '0 0 8px' }}>
                Are you sure? This will permanently remove all drawings from this document.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                Voice notes and text notes will not be affected.
              </p>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex', gap: 8, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setConfirmClearOpen(false)}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 7,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onClearAllDrawings?.();
                  setConfirmClearOpen(false);
                }}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 7,
                  background: 'var(--red)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Eraser size={13} />
                Clear All Drawings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Key Term modal ── */}
      {keyTermOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setKeyTermOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookMarked size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Key Terms</span>
                {keyTerms.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 7px' }}>{keyTerms.length}</span>
                )}
              </div>
              <button onClick={() => setKeyTermOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}><X size={14} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ marginBottom: keyTerms.length > 0 ? 24 : 0 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Term</label>
                  <input type="text" value={ktTerm} onChange={(e) => setKtTerm(e.target.value)} placeholder="e.g., Mitosis" className="app-input" style={{ width: '100%', height: 32, fontSize: 13, padding: '0 10px', borderRadius: 6, boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Definition</label>
                  <textarea value={ktDef} onChange={(e) => setKtDef(e.target.value)} placeholder="Describe the term…" className="app-input" rows={3} style={{ width: '100%', fontSize: 12.5, padding: '8px 10px', borderRadius: 6, resize: 'vertical', minHeight: 72, fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                </div>
                <button
                  onClick={handleSaveKeyTerm}
                  disabled={!ktTerm.trim()}
                  style={{ width: '100%', height: 32, borderRadius: 7, background: ktTerm.trim() ? 'var(--accent)' : 'var(--bg-active)', border: 'none', color: ktTerm.trim() ? '#fff' : 'var(--text-3)', cursor: ktTerm.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500 }}
                >
                  Save & Insert as Note
                </button>
              </div>

              {keyTerms.length > 0 && (
                <div>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Saved Terms</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {keyTerms.map((kt) => (
                      <div key={kt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kt.term}</p>
                          {kt.definition && (
                            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{kt.definition}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteKeyTerm(kt.id)}
                          title="Delete"
                          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.12s, background 0.12s' }}
                          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'rgba(229,72,77,.2)' })}
                          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent' })}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
