'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, HelpCircle, Layers, Brain,
  Send, Sparkles, Loader2, ChevronRight, Languages,
} from 'lucide-react';
import { callAI, callAIChat } from '@/lib/gemini';

/**
 * Right-panel AI Assistant tab. Lifted out of DocumentToolsPanel so the
 * right panel can be tabbed. Behaviour preserved verbatim:
 *   - AI Chat (callAIChat) with page-text extraction
 *   - Quick actions: Summarize / Explain / Create flashcards / Quiz me
 *     (callAI on the page text). Results surface inline as AI messages
 *     in the same chat conversation, matching the previous behaviour.
 *   - Translate footer: AR/EN/FR/ES toggles + "Translate to <lang>"
 *     button, operates on the currently selected text.
 *
 * Restyled to match the reference: intro line, four prominent quick-action
 * buttons stacked above the input, sticky Translate panel pinned to the
 * bottom of the tab.
 */

// PDF text extraction — same helper DocumentToolsPanel used.
async function extractPageText(url: string, pageNum: number): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  const doc = await pdfjs.getDocument(url).promise;
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return content.items.map((item: any) => item.str ?? '').join(' ').trim();
}

const LANGS = ['Arabic', 'English', 'French', 'Spanish'] as const;
type Lang = typeof LANGS[number];

const LANG_CODE: Record<Lang, string> = {
  Arabic: 'AR', English: 'EN', French: 'FR', Spanish: 'ES',
};

interface ChatMessage { role: 'user' | 'ai'; content: string; }

const QUICK_ACTIONS: Array<{
  id: 'summary' | 'explain' | 'flashcards' | 'quiz';
  label: string;
  icon: React.ElementType;
  prompt: string;
}> = [
  { id: 'summary',    label: 'Summarize this page',  icon: FileText,   prompt: 'Summarize this page' },
  { id: 'explain',    label: 'Explain this concept', icon: HelpCircle, prompt: 'Explain this concept' },
  { id: 'flashcards', label: 'Create flashcards',    icon: Layers,     prompt: 'Create flashcards' },
  { id: 'quiz',       label: 'Quiz me on this',      icon: Brain,      prompt: 'Quiz me on this' },
];

interface Props {
  hasDocument:     boolean;
  isBlankPage:     boolean;
  documentUrl?:    string;
  currentPdfPage?: number | null;
  selectedText?:   string;
}

export default function AIAssistantTabContent({
  hasDocument, isBlankPage, documentUrl, currentPdfPage, selectedText = '',
}: Props) {
  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const [chatLoading,  setChatLoading]  = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Reset conversation when the page or document changes — same UX as before.
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

  const handleChatSend = useCallback(async (overrideText?: string) => {
    const msg = (overrideText ?? chatInput).trim();
    if (!msg || chatLoading) return;
    if (!overrideText) setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      let pageText = '';
      if (documentUrl && currentPdfPage && !isBlankPage) {
        try { pageText = await extractPageText(documentUrl, currentPdfPage); }
        catch { /* no text layer; AI still gets the question without context */ }
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

  // ── Quick action handler (same callAI pipeline as before) ──────────────────
  const handleQuickAction = useCallback(async (action: typeof QUICK_ACTIONS[number]['id'], label: string) => {
    if (!hasDocument || chatLoading) return;
    setChatMessages((prev) => [...prev, { role: 'user', content: label }]);
    setChatLoading(true);
    try {
      let pageText = '';
      if (documentUrl && currentPdfPage && !isBlankPage) {
        try { pageText = await extractPageText(documentUrl, currentPdfPage); }
        catch { /* fall through */ }
      }
      const text = pageText || (selectedText.trim() || '');
      // callAI has narrowly-typed overloads per action; call each by name
      // so TS picks the right overload rather than passing a union.
      let response: string;
      if (action === 'summary')         response = await callAI('summary', text);
      else if (action === 'explain')    response = await callAI('explain', text);
      else if (action === 'flashcards') response = await callAI('flashcards', text);
      else /* action === 'quiz' */      response = await callAIChat(pageText, 'Quiz me on this content with 3 short questions.');
      setChatMessages((prev) => [...prev, { role: 'ai', content: response.trim() }]);
    } catch (e) {
      setChatMessages((prev) => [...prev, {
        role: 'ai',
        content: `Sorry, I ran into an error: ${(e as Error).message.slice(0, 100)}`,
      }]);
    } finally {
      setChatLoading(false);
    }
  }, [hasDocument, chatLoading, documentUrl, currentPdfPage, isBlankPage, selectedText]);

  // ── Translate state ────────────────────────────────────────────────────────
  const [translateLang,   setTranslateLang]   = useState<Lang>('English');
  const [translateState,  setTranslateState]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [translateResult, setTranslateResult] = useState('');
  const [translateError,  setTranslateError]  = useState('');

  const canTranslate = !!selectedText.trim() && translateState !== 'loading';

  async function handleTranslate() {
    if (!canTranslate) return;
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

  // ── Render ─────────────────────────────────────────────────────────────────
  const showWelcome = chatMessages.length === 0 && !chatLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Scrollable upper content */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '14px 14px 8px',
      }}>
        {/* Eyebrow */}
        <p style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--accent)',
          margin: '0 0 10px',
        }}>
          AI Assistant
        </p>

        {showWelcome && (
          <p style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
            lineHeight: 1.45, margin: '0 0 14px',
          }}>
            Ask me anything about this page!
          </p>
        )}

        {/* Quick actions (always visible — match reference) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {QUICK_ACTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleQuickAction(id, label)}
              disabled={!hasDocument || chatLoading}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 13px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                color: 'var(--text-1)',
                fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                cursor: hasDocument && !chatLoading ? 'pointer' : 'not-allowed',
                opacity: hasDocument && !chatLoading ? 1 : 0.5,
                textAlign: 'left',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseOver={(e) => {
                if (hasDocument && !chatLoading) {
                  Object.assign(e.currentTarget.style, {
                    background: 'var(--bg-hover)', borderColor: 'var(--border)',
                  });
                }
              }}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)',
              })}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={14} />
              </span>
              <span style={{ flex: 1 }}>{label}</span>
              <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>

        {/* Chat conversation (visible once user has sent / received messages, or while loading) */}
        {(chatMessages.length > 0 || chatLoading) && (
          <div
            ref={chatScrollRef}
            style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '4px 0',
            }}
          >
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                }}
              >
                <div style={{
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-panel)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                  borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  padding: '7px 11px',
                }}>
                  <p style={{
                    fontSize: 12, lineHeight: 1.55, margin: 0,
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
                <Loader2 size={11} className="spinner" style={{ color: 'var(--text-3)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Thinking…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Page-question input (pinned above translate) */}
      <div style={{
        padding: '8px 14px 10px',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: '4px 4px 4px 12px',
        }}>
          <Sparkles size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleChatSend();
              }
            }}
            placeholder={hasDocument ? 'Ask about this page… (Enter to send)' : 'Open a PDF to start chatting'}
            disabled={!hasDocument}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 12.5, color: 'var(--text-1)',
              fontFamily: 'inherit', padding: '6px 0',
              opacity: hasDocument ? 1 : 0.5,
            }}
          />
          <button
            onClick={() => handleChatSend()}
            disabled={!chatInput.trim() || chatLoading || !hasDocument}
            aria-label="Send"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: (chatInput.trim() && !chatLoading && hasDocument) ? 'var(--accent)' : 'var(--bg-active)',
              color: (chatInput.trim() && !chatLoading && hasDocument) ? '#fff' : 'var(--text-3)',
              border: 'none', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (chatInput.trim() && !chatLoading && hasDocument) ? 'pointer' : 'not-allowed',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <Send size={12} />
          </button>
        </div>
      </div>

      {/* Translate footer */}
      <div style={{
        padding: '12px 14px 14px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-app)',
        flexShrink: 0,
      }}>
        <p style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-3)',
          margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Languages size={12} />
          Translate
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {LANGS.map((lang) => (
            <button
              key={lang}
              onClick={() => setTranslateLang(lang)}
              style={{
                flex: 1, height: 28,
                borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: translateLang === lang ? 'var(--accent-muted)' : 'transparent',
                border: `1px solid ${translateLang === lang ? 'var(--accent)' : 'var(--border)'}`,
                color: translateLang === lang ? 'var(--accent)' : 'var(--text-2)',
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
            >
              {LANG_CODE[lang]}
            </button>
          ))}
        </div>

        <button
          onClick={handleTranslate}
          disabled={!canTranslate}
          style={{
            width: '100%', height: 36,
            borderRadius: 8, fontSize: 12.5, fontWeight: 600,
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
          {translateState === 'loading'
            ? <><Loader2 size={12} className="spinner" /> Translating…</>
            : `Translate to ${translateLang}`}
        </button>

        {translateState === 'done' && translateResult && (
          <div style={{
            marginTop: 8,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6, padding: '8px 9px',
          }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.6, margin: 0 }}>
              {translateResult}
            </p>
          </div>
        )}
        {translateState === 'error' && (
          <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4, marginTop: 6 }}>
            {translateError}
          </p>
        )}
        {!selectedText.trim() && translateState === 'idle' && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, marginTop: 6 }}>
            Select text on the PDF page to translate.
          </p>
        )}
      </div>
    </div>
  );
}
