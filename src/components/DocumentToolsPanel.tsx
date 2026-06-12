'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import {
  ImagePlus, Trash2, FileOutput, FilePlus, Mic,
  Sparkles, Languages,
  Loader2, Maximize2, Copy, Check, X, Users, Eraser, Send,
} from 'lucide-react';
import { callAI, callAIChat } from '@/lib/gemini';
import type { TextNote, PDFPageImage } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';

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

const LANGS = ['Arabic', 'English', 'French', 'Spanish'] as const;
type Lang = typeof LANGS[number];

const LANG_CODE: Record<Lang, string> = {
  Arabic:  'AR',
  English: 'EN',
  French:  'FR',
  Spanish: 'ES',
};

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
  onCreateRoom?:       () => void;
  onClearAllDrawings?: () => void;
  onAddImageToPage?:   (dataUrl: string) => void;
  onAddImageAsNewPage?: (dataUrl: string) => void;
  docPageImages?: Record<number, PDFPageImage[]>;
  currentPdfPageForImages?: number | null;
  onDeletePageImage?: (pageNumber: number, imageId: string) => void;
}

// ── Chat message type ─────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
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
              border: `1px solid ${isActive ? 'rgba(255,255,255,0.5)' : 'var(--border)'}`,
              borderRadius: 4, padding: '6px 4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
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
              color: isActive ? 'var(--text-1)' : 'var(--text-2)',
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
  const { t } = useLanguage();

  function handleCopy() {
    navigator.clipboard.writeText(copyText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
          borderRadius: 4,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
              borderRadius: 4, border: '1px solid transparent',
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          {content}
        </div>
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
              borderRadius: 4,
              background: copied ? 'var(--green)' : 'var(--bg-elevated)',
              border: `1px solid ${copied ? 'transparent' : 'var(--border)'}`,
              color: copied ? '#fff' : 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 500,
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? t('dtp_copied') : t('dtp_copy')}
          </button>
        </div>
      </div>
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
  onCreateRoom,
  onClearAllDrawings,
  onAddImageToPage,
  onAddImageAsNewPage,
  docPageImages,
  currentPdfPageForImages,
  onDeletePageImage,
}: Props) {
  const { t } = useLanguage();
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef    = useRef<HTMLDivElement>(null);

  const translatedBgThemes: typeof BG_THEMES = [
    { ...BG_THEMES[0], label: t('room_bg_white') },
    { ...BG_THEMES[1], label: t('room_bg_dark') },
  ];

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalData | null>(null);

  // ── Add image state ────────────────────────────────────────────────────────
  const [addImageData, setAddImageData] = useState<string | null>(null);

  // ── Remove image modal ─────────────────────────────────────────────────────
  const [removeImgOpen, setRemoveImgOpen] = useState(false);

  // ── Clear drawings confirmation ────────────────────────────────────────────
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

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

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const expandedScrollRef = useRef<HTMLDivElement>(null);
  const expandedInputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setChatMessages([]);
    setChatInput('');
    setChatLoading(false);
  }, [documentUrl, currentPdfPage]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    if (expandedScrollRef.current) {
      expandedScrollRef.current.scrollTop = expandedScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading, chatExpanded]);

  useEffect(() => {
    if (!chatExpanded) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setChatExpanded(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chatExpanded]);

  useEffect(() => {
    if (chatExpanded) setTimeout(() => expandedInputRef.current?.focus(), 60);
  }, [chatExpanded]);

  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      let pageText = '';
      if (documentUrl && currentPdfPage && !isBlankPage) {
        try { pageText = await extractPageText(documentUrl, currentPdfPage); } catch { /* no text layer */ }
      }
      const response = await callAIChat(pageText, msg);
      setChatMessages((prev) => [...prev, { role: 'ai', content: response.trim() }]);
    } catch (e) {
      setChatMessages((prev) => [...prev, {
        role: 'ai',
        content: `Sorry, I ran into an error: ${(e as Error).message.slice(0, 100)}`,
      }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, documentUrl, currentPdfPage, isBlankPage]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const canTranslate = !!selectedText.trim() && translateState !== 'loading';

  return (
    <>
      <aside style={{ width: '100%', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
        <div style={{
          width: '100%', height: '100%',
          background: 'var(--bg-sidebar)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
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
              {t('dtp_page_tools')}
            </span>
          </div>

          {/* Scrollable content */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '12px 10px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>

            {/* ══ AI CHAT ══ */}
            <div>
              {/* Section label row with expand button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--text-3)',
                  margin: 0, paddingLeft: 2,
                }}>
                  AI Assistant
                </p>
                <button
                  onClick={() => setChatExpanded(true)}
                  title="Expand chat"
                  style={{
                    width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, border: '1px solid transparent',
                    background: 'transparent', color: 'var(--text-3)',
                    cursor: 'pointer',
                    transition: 'color 0.12s, background 0.12s, border-color 0.12s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-1)', background: 'var(--bg-hover)', borderColor: 'var(--border)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'transparent', borderColor: 'transparent' })}
                >
                  <Maximize2 size={11} />
                </button>
              </div>

              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}>

                {/* Messages area — sidebar shows last 3 messages only */}
                <div
                  ref={chatScrollRef}
                  style={{
                    height: 200,
                    overflowY: 'auto',
                    padding: '10px 10px 6px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  {chatMessages.length === 0 && (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '8px 4px', gap: 10,
                    }}>
                      <Sparkles size={16} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
                      <div style={{ width: '100%' }}>
                        <p style={{
                          fontSize: 11, color: 'var(--text-2)', fontWeight: 500,
                          marginBottom: 8, lineHeight: 1.4, textAlign: 'center',
                        }}>
                          Ask me anything about this page!
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {['Summarize this page', 'Explain this concept', 'Create flashcards', 'Quiz me on this'].map((hint) => (
                            <button
                              key={hint}
                              onClick={() => setChatInput(hint)}
                              style={{
                                textAlign: 'left',
                                background: 'var(--bg-active)', border: '1px solid var(--border)',
                                borderRadius: 4, padding: '4px 8px',
                                fontSize: 10.5, color: 'var(--text-3)',
                                cursor: 'pointer', fontFamily: 'inherit',
                                transition: 'border-color 0.12s, color 0.12s',
                              }}
                              onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border-strong)', color: 'var(--text-2)' })}
                              onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', color: 'var(--text-3)' })}
                            >
                              • {hint}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show "X earlier messages" pill if history is long */}
                  {chatMessages.length > 3 && (
                    <button
                      onClick={() => setChatExpanded(true)}
                      style={{
                        alignSelf: 'center',
                        background: 'var(--bg-active)', border: '1px solid var(--border)',
                        borderRadius: 9999, padding: '3px 10px',
                        fontSize: 10, color: 'var(--text-3)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'border-color 0.12s, color 0.12s',
                      }}
                      onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border-strong)', color: 'var(--text-2)' })}
                      onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', color: 'var(--text-3)' })}
                    >
                      {chatMessages.length - 3} earlier messages ↑
                    </button>
                  )}

                  {chatMessages.slice(-3).map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '92%',
                      }}
                    >
                      <div style={{
                        background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-panel)',
                        border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                        borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                        padding: '6px 10px',
                      }}>
                        <p style={{
                          fontSize: 11.5, lineHeight: 1.55, margin: 0,
                          color: msg.role === 'user' ? '#fff' : 'var(--text-1)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div style={{
                      alignSelf: 'flex-start', display: 'flex',
                      alignItems: 'center', gap: 6, padding: '4px 0',
                    }}>
                      <Loader2 size={11} className="spinner" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Thinking…</span>
                    </div>
                  )}
                </div>

                {/* Input area */}
                <div style={{
                  borderTop: '1px solid var(--border)',
                  padding: '7px 8px',
                  position: 'relative',
                }}>
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    placeholder={hasDocument
                      ? 'Ask about this page… (Enter to send)'
                      : 'Open a PDF to start chatting'}
                    disabled={!hasDocument}
                    rows={2}
                    style={{
                      width: '100%', resize: 'none',
                      background: 'transparent',
                      border: 'none', outline: 'none',
                      fontSize: 11.5, color: 'var(--text-1)',
                      fontFamily: 'inherit', lineHeight: 1.5,
                      paddingRight: 30, boxSizing: 'border-box',
                      opacity: hasDocument ? 1 : 0.5,
                    }}
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || chatLoading || !hasDocument}
                    style={{
                      position: 'absolute', right: 8, bottom: 9,
                      width: 22, height: 22, borderRadius: 4,
                      background: (chatInput.trim() && !chatLoading && hasDocument)
                        ? 'var(--accent)' : 'var(--bg-active)',
                      border: 'none',
                      color: (chatInput.trim() && !chatLoading && hasDocument) ? '#fff' : 'var(--text-3)',
                      cursor: (chatInput.trim() && !chatLoading && hasDocument) ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.12s',
                    }}
                  >
                    <Send size={11} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            {/* ══ TRANSLATE ══ */}
            <div>
              <SectionLabel>{t('dtp_translate')}</SectionLabel>

              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4, padding: '10px 11px',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Languages size={13} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>
                    {t('dtp_translate')}
                  </span>
                </div>

                {/* Language pills: AR EN FR ES */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {LANGS.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setTranslateLang(lang)}
                      style={{
                        flex: 1, height: 24,
                        borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: translateLang === lang ? 'var(--accent-muted)' : 'transparent',
                        border: `1px solid ${translateLang === lang ? 'var(--accent)' : 'var(--border)'}`,
                        color: translateLang === lang ? 'var(--accent-hover)' : 'var(--text-3)',
                        cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em',
                        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                      }}
                    >
                      {LANG_CODE[lang]}
                    </button>
                  ))}
                </div>

                {/* Selected text preview */}
                {selectedText.trim() ? (
                  <div style={{
                    fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.45,
                    background: 'var(--bg-active)', borderRadius: 4,
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
                    borderRadius: 4, fontSize: 11.5, fontWeight: 500,
                    background: canTranslate ? '#ffffff' : 'var(--bg-active)',
                    border: 'none',
                    color: canTranslate ? '#0f172a' : 'var(--text-3)',
                    cursor: canTranslate ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background 0.13s',
                  }}
                  onMouseOver={(e) => { if (canTranslate) e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
                  onMouseOut={(e)  => { if (canTranslate) e.currentTarget.style.background = '#ffffff'; }}
                >
                  {translateState === 'loading' ? (
                    <>
                      <Loader2 size={12} className="spinner" />
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
                        textTransform: 'uppercase', color: 'var(--text-2)',
                      }}>
                        Result
                      </span>
                      <ExpandBtn onClick={openTranslateModal} />
                    </div>
                    <div style={{
                      background: 'var(--bg-active)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4, padding: '8px 9px',
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

            {/* ── Add Image ── */}
            {(onAddImageToPage || onAddImageAsNewPage) && (
              <div>
                <SectionLabel>{t('dtp_image')}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={() => addImageInputRef.current?.click()}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 11px', borderRadius: 4,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      fontSize: 12.5, fontWeight: 500,
                      transition: 'background 0.13s, border-color 0.13s',
                    }}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                      background: 'var(--bg-hover)', borderColor: 'var(--border-strong)',
                    })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                      background: 'transparent', borderColor: 'var(--border)',
                    })}
                  >
                    <ImagePlus size={14} />
                    {t('dtp_insert_image')}
                  </button>
                  {onDeletePageImage && docPageImages && Object.values(docPageImages).some((imgs) => imgs.length > 0) && (
                    <button
                      onClick={() => setRemoveImgOpen(true)}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 11px', borderRadius: 4,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--text-2)',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        fontSize: 12.5, fontWeight: 500,
                        transition: 'background 0.13s, border-color 0.13s',
                      }}
                      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                        background: 'var(--bg-hover)', borderColor: 'var(--border-strong)',
                      })}
                      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                        background: 'transparent', borderColor: 'var(--border)',
                      })}
                    >
                      <Trash2 size={14} />
                      {t('dtp_remove_image')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />

            {/* ── Add Blank Page ── */}
            <div>
              <SectionLabel>{t('dtp_add_blank')}</SectionLabel>
              <BgSwatches themes={translatedBgThemes} disabled={!hasDocument} onSelect={onInsertBlankPage} />
            </div>

            {/* Insert image (blank pages only) */}
            <button
              onClick={isBlankPage && onInsertImage ? () => fileInputRef.current?.click() : undefined}
              disabled={!isBlankPage || !onInsertImage}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 11px', borderRadius: 4,
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
              {t('dtp_insert_image')}
            </button>

            {/* Page Background (blank pages only) */}
            {isBlankPage && onChangeBgTheme && (
              <div>
                <SectionLabel>{t('dtp_page_bg')}</SectionLabel>
                <BgSwatches themes={translatedBgThemes} active={currentBgTheme ?? 'white'} onSelect={onChangeBgTheme} />
              </div>
            )}

            {/* Delete blank page */}
            {isBlankPage && onDeleteBlankPage && (
              <button
                onClick={onDeleteBlankPage}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 11px', borderRadius: 4,
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
                {t('dtp_delete_page')}
              </button>
            )}

            {/* Clear all drawings (PDF pages only) */}
            {onClearAllDrawings && !isBlankPage && (
              <button
                onClick={() => setConfirmClearOpen(true)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 11px', borderRadius: 4,
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
                {t('dtp_clear_drawings')}
              </button>
            )}

            <button
              disabled
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 11px', borderRadius: 4,
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-3)',
                cursor: 'not-allowed', fontFamily: 'inherit', textAlign: 'left',
                fontSize: 12.5, fontWeight: 500,
                opacity: 0.45,
              }}
            >
              <FileOutput size={14} />
              {t('dtp_convert_pptx')}
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
                  padding: '10px 12px', borderRadius: 4,
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
                    {t('dtp_create_room')}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                    {t('dtp_collaborate')}
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
                padding: '10px 12px', borderRadius: 4,
                background: isRecording ? 'rgba(229,72,77,0.1)' : 'var(--bg-elevated)',
                border: `1px solid ${isRecording ? 'rgba(229,72,77,0.3)' : 'var(--border)'}`,
                color: 'var(--text-1)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.13s, border-color 0.13s',
              }}
              onMouseOver={(e) => {
                if (!isRecording) Object.assign(e.currentTarget.style, {
                  borderColor: 'rgba(255,255,255,0.35)', background: 'var(--bg-hover)',
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
                  {isRecording ? t('dtp_recording') : t('dtp_record_voice')}
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

          {/* Hidden file input — blank page images */}
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

          {/* Hidden file input — Add Image feature */}
          <input
            ref={addImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') setAddImageData(reader.result);
              };
              reader.readAsDataURL(file);
              e.target.value = '';
            }}
          />
        </div>
      </aside>

      {/* ── Expanded Chat modal ── */}
      {chatExpanded && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 800,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 40,
          }}
          onClick={() => setChatExpanded(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '80%', maxWidth: 760,
              height: '80vh',
              background: '#1a1c24',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              boxShadow: '0 24px 72px rgba(0,0,0,0.7)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: 'var(--accent-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                  AI Assistant
                </span>
                {chatMessages.length > 0 && (
                  <span style={{
                    fontSize: 10.5, color: 'var(--text-3)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 9999, padding: '1px 8px',
                  }}>
                    {chatMessages.length} message{chatMessages.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                onClick={() => setChatExpanded(false)}
                style={{
                  width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 6, border: '1px solid transparent',
                  background: 'transparent', color: 'var(--text-3)',
                  cursor: 'pointer',
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
                onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)' })}
                onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent' })}
              >
                <X size={15} />
              </button>
            </div>

            {/* Hint banner */}
            <div style={{
              padding: '7px 20px',
              background: 'rgba(89,101,217,0.07)',
              borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <Sparkles size={11} style={{ color: 'var(--accent)', flexShrink: 0, opacity: 0.7 }} />
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
                You can ask me anything — about this page or any other topic
              </p>
            </div>

            {/* Messages */}
            <div
              ref={expandedScrollRef}
              style={{
                flex: 1, overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}
            >
              {chatMessages.length === 0 && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 16, padding: '40px 20px',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'var(--accent-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={22} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>
                      Ask me anything!
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 400 }}>
                      I can summarize pages, explain concepts, create flashcards, quiz you, or answer any question — about this document or anything else.
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 480 }}>
                    {[
                      'Summarize this page',
                      'Create flashcards',
                      'Quiz me on this content',
                      'Explain the main concept',
                      'What are the key takeaways?',
                      'Give me a study plan',
                    ].map((hint) => (
                      <button
                        key={hint}
                        onClick={() => { setChatInput(hint); expandedInputRef.current?.focus(); }}
                        style={{
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: 9999, padding: '5px 12px',
                          fontSize: 11.5, color: 'var(--text-2)',
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'border-color 0.12s, background 0.12s',
                        }}
                        onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', background: 'var(--accent-muted)' })}
                        onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '78%',
                  }}
                >
                  {msg.role === 'ai' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        background: 'var(--accent-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Sparkles size={9} style={{ color: 'var(--accent)' }} />
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)' }}>AI</span>
                    </div>
                  )}
                  <div style={{
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    border: `1px solid ${msg.role === 'user' ? 'transparent' : 'var(--border)'}`,
                    borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                    padding: '9px 14px',
                  }}>
                    <p style={{
                      fontSize: 13, lineHeight: 1.65, margin: 0,
                      color: msg.role === 'user' ? '#fff' : 'var(--text-1)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: 'var(--accent-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={9} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={13} className="spinner" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Thinking…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '12px 16px',
              flexShrink: 0,
              position: 'relative',
              background: '#14161d',
            }}>
              <textarea
                ref={expandedInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder="Ask anything about this page, or any other topic… (Enter to send, Shift+Enter for new line)"
                rows={3}
                style={{
                  width: '100%', resize: 'none',
                  background: '#1e2030',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, outline: 'none',
                  fontSize: 13, color: 'var(--text-1)',
                  fontFamily: 'inherit', lineHeight: 1.55,
                  padding: '10px 48px 10px 14px',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.12s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(89,101,217,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatLoading}
                style={{
                  position: 'absolute', right: 26, bottom: 22,
                  width: 32, height: 32, borderRadius: 8,
                  background: (chatInput.trim() && !chatLoading) ? 'var(--accent)' : 'var(--bg-active)',
                  border: 'none',
                  color: (chatInput.trim() && !chatLoading) ? '#fff' : 'var(--text-3)',
                  cursor: (chatInput.trim() && !chatLoading) ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.12s',
                  flexShrink: 0,
                }}
                onMouseOver={(e) => { if (chatInput.trim() && !chatLoading) e.currentTarget.style.background = 'var(--accent-hover)'; }}
                onMouseOut={(e) => { if (chatInput.trim() && !chatLoading) e.currentTarget.style.background = 'var(--accent)'; }}
              >
                <Send size={14} />
              </button>
              <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: '6px 0 0', textAlign: 'right' }}>
                Enter to send · Shift+Enter for new line · Esc to close
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Result modal ── */}
      {modal && (
        <ResultModal
          title={modal.title}
          content={modal.content}
          copyText={modal.copyText}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Add Image modal ── */}
      {addImageData && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setAddImageData(null)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4, overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImagePlus size={15} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Add Image</span>
              </div>
              <button
                onClick={() => setAddImageData(null)}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: '1px solid transparent',
                  background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{
              padding: '16px 20px 12px',
              display: 'flex', justifyContent: 'center',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={addImageData}
                alt="Selected"
                style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 4, objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 4px', lineHeight: 1.5 }}>
                Where would you like to add this image?
              </p>

              {onAddImageToPage && (
                <button
                  onClick={() => { onAddImageToPage(addImageData); setAddImageData(null); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.13s, background 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'rgba(37,99,235,0.45)', background: 'var(--bg-hover)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ImagePlus size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Add to current page</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>Overlay on the current PDF page as an annotation</p>
                  </div>
                </button>
              )}

              {onAddImageAsNewPage && (
                <button
                  onClick={() => { onAddImageAsNewPage(addImageData); setAddImageData(null); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.13s, background 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'rgba(37,99,235,0.45)', background: 'var(--bg-hover)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FilePlus size={15} style={{ color: 'var(--text-2)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Add as new page</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>Create a new blank page with this image on it</p>
                  </div>
                </button>
              )}
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
              borderRadius: 4, overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eraser size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Clear All Drawings</span>
              </div>
              <button
                onClick={() => setConfirmClearOpen(false)}
                style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.6, margin: '0 0 8px' }}>
                Are you sure? This will permanently remove all drawings from this document.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                Voice notes and text notes will not be affected.
              </p>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmClearOpen(false)}
                style={{ height: 32, padding: '0 16px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onClearAllDrawings?.(); setConfirmClearOpen(false); }}
                style={{ height: 32, padding: '0 16px', borderRadius: 4, background: 'var(--red)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Eraser size={13} />
                Clear All Drawings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Image modal ── */}
      {removeImgOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setRemoveImgOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImagePlus size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Page Images</span>
              </div>
              <button onClick={() => setRemoveImgOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docPageImages && Object.entries(docPageImages)
                .flatMap(([pageStr, imgs]) => imgs.map((img) => ({ ...img, pageNumber: Number(pageStr) })))
                .filter((img) => img.src)
                .length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: 16 }}>
                  No images on this document.
                </p>
              ) : (
                docPageImages && Object.entries(docPageImages)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .flatMap(([pageStr, imgs]) => imgs.map((img) => ({ img, pageNumber: Number(pageStr) })))
                  .map(({ img, pageNumber }) => {
                    const isCurrentPage = pageNumber === currentPdfPageForImages;
                    return (
                      <div
                        key={`${pageNumber}:${img.id}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 12px', borderRadius: 4,
                          background: isCurrentPage ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                          border: `1px solid ${isCurrentPage ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                            Page {pageNumber}
                            {isCurrentPage && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-2)', fontWeight: 500 }}>Current</span>}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                            {Math.round(img.width * 100)}% × {Math.round(img.height * 100)}%
                          </p>
                        </div>
                        <button
                          onClick={() => { onDeletePageImage?.(pageNumber, img.id); }}
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: '#ef4444', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                          title="Delete image"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
