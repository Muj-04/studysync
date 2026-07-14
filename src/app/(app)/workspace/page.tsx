'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  BookOpen, X, PanelLeft, PanelRight,
  ChevronUp, FilePlus, Search, CheckCircle, Share2,
  Timer, Download, Users,
} from 'lucide-react';
import { clampZoom } from '@/components/PDFViewer';
import { usePDF } from '@/hooks/usePDF';
import { useVoiceNotes } from '@/hooks/useVoiceNotes';
import { useBlankPages } from '@/hooks/useBlankPages';
import { useBlankPageDrawing } from '@/hooks/useBlankPageDrawing';
import { useUndoClear } from '@/hooks/useUndoClear';
import { useScrollMode } from '@/hooks/useScrollMode';
import { useSinglePageMode } from '@/hooks/useSinglePageMode';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import { usePDFPageImages } from '@/hooks/usePDFPageImages';
import { useStudySession } from '@/hooks/useStudySession';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useToolStrokeSize } from '@/hooks/useToolStrokeSize';
import PDFUploader from '@/components/PDFUploader';
import PDFWithDrawing from '@/components/PDFWithDrawing';
import PDFScrollViewer from '@/components/PDFScrollViewer';
import PPTXViewer from '@/components/PPTXViewer';
import BlankPageCanvas from '@/components/BlankPageCanvas';
import SidebarThumbnails from '@/components/SidebarThumbnails';
import DocTabsBar from '@/components/DocTabsBar';
import RightPanelTabs from '@/components/RightPanelTabs';
import NotesTabContent from '@/components/NotesTabContent';
import AIAssistantTabContent from '@/components/AIAssistantTabContent';
import ChatTabContent from '@/components/ChatTabContent';
import BottomPillBar from '@/components/BottomPillBar';
import PdfTopToolbar from '@/components/PdfTopToolbar';
import PageNavigation from '@/components/PageNavigation';
import SettingsDropdown from '@/components/SettingsDropdown';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import PomodoroWidget from '@/components/PomodoroWidget';
import GlobalSearch from '@/components/GlobalSearch';
import OnboardingTour, { shouldShowTour } from '@/components/OnboardingTour';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { applyPreferences } from '@/lib/preferences';
import { PLAN_LIMITS, PLAN_LABELS, VOICE_STORAGE_LABELS, nextUpgradePlan, effectivePlanLimits } from '@/lib/planLimits';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import {
  upsertDocument,
  fetchDrawings,
  fetchBlankPages,
  fetchTextNotes,
  fetchBookmarks,
  fetchVoiceNotes,
  fetchAllPageImages,
  saveBookmarks as dbSaveBookmarks,
  saveTextNotes as dbSaveTextNotes,
  saveSessionState as dbSaveSessionState,
  uploadRoomPdf,
  createRoom,
  loadUserPreferences,
  saveDocumentOrder,
  loadDocumentOrder,
  getProfile,
  createCommunityPost,
  deleteAllDataForDocument,
} from '@/lib/supabase/db';
import { getPendingReopenFile, clearPendingReopenFile } from '@/lib/pendingReopenFile';
import type { BlankPage, PDFDocument, TextNote, Bookmark } from '@/types';
import { MAX_UNDO_HISTORY, type Tool, type PenType } from '@/lib/drawing';

// ── Doc order helper ──────────────────────────────────────────────────────────

function applyDocOrder(docs: PDFDocument[], order: string[]): PDFDocument[] {
  const map = new Map(docs.map((d) => [d.id, d]));
  const inOrder = order.filter((id) => map.has(id)).map((id) => map.get(id)!);
  const extra = docs.filter((d) => !order.includes(d.id));
  return [...inOrder, ...extra];
}

// ── Virtual page sequence ─────────────────────────────────────────────────────

type VirtualPage =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

function buildVirtualSequence(pdfPageCount: number, blankPages: BlankPage[]): VirtualPage[] {
  const pages: VirtualPage[] = [];
  blankPages
    .filter((b) => b.insertAfterPage === 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((b) => pages.push({ type: 'blank', blankPage: b }));
  for (let p = 1; p <= pdfPageCount; p++) {
    pages.push({ type: 'pdf', pdfPage: p });
    blankPages
      .filter((b) => b.insertAfterPage === p)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((b) => pages.push({ type: 'blank', blankPage: b }));
  }
  return pages;
}

// ── Split view icon ───────────────────────────────────────────────────────────

function SplitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="18" rx="1.5" />
      <rect x="13" y="3" width="8" height="18" rx="1.5" />
    </svg>
  );
}

// ── Reusable header icon button ───────────────────────────────────────────────

function HdrBtn({
  onClick, title, active = false, tone = 'default', children,
}: {
  onClick?: () => void;
  title?: string;
  active?: boolean;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  const isDanger = tone === 'danger';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 42, height: 42,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, flexShrink: 0,
        background: isDanger ? 'var(--red-muted)' : active ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isDanger ? 'var(--red-muted)' : active ? 'var(--border-strong)' : 'transparent'}`,
        color: isDanger ? 'var(--red)' : active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (isDanger) {
          Object.assign(e.currentTarget.style, {
            background: 'var(--red)', color: '#fff', borderColor: 'var(--red)',
          });
          return;
        }
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
        if (isDanger) {
          Object.assign(e.currentTarget.style, {
            background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'var(--red-muted)',
          });
          return;
        }
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
        });
      }}
    >
      {children}
    </button>
  );
}

// ── Mini nav / zoom button ────────────────────────────────────────────────────

function MiniBtn({
  onClick, disabled, children, title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 22, height: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, flexShrink: 0,
        background: 'transparent',
        border: '1px solid transparent',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, fontFamily: 'inherit', fontWeight: 500,
        opacity: disabled ? 0.45 : 1,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
        });
      }}
    >
      {children}
    </button>
  );
}

// ── Right pane header ─────────────────────────────────────────────────────────

function RightPaneHeader({
  rightSideMode, setRightSideMode,
  documents, rightDocId, setRightDocId,
  rightDoc, rightDocPage, setRightDocPage,
  rightZoom, onRightZoomChange,
}: {
  rightSideMode: 'blank' | 'document';
  setRightSideMode: (m: 'blank' | 'document') => void;
  documents: PDFDocument[];
  rightDocId: string | null;
  setRightDocId: (id: string | null) => void;
  rightDoc: PDFDocument | null;
  rightDocPage: number;
  setRightDocPage: (p: number) => void;
  rightZoom: number;
  onRightZoomChange: (z: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div style={{
      height: 34, flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 8px', gap: 5,
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Mode toggle pills */}
      <div style={{
        display: 'flex', gap: 1,
        background: 'var(--bg-elevated)',
        borderRadius: 4, padding: 2, flexShrink: 0,
      }}>
        {(['blank', 'document'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setRightSideMode(m)}
            style={{
              height: 20, padding: '0 7px',
              borderRadius: 3, fontSize: 10.5, fontWeight: 500,
              background: rightSideMode === m ? 'var(--bg-active)' : 'transparent',
              border: `1px solid ${rightSideMode === m ? 'var(--border-strong)' : 'transparent'}`,
              color: rightSideMode === m ? 'var(--text-1)' : 'var(--text-3)',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {m === 'blank' ? t('ws_blank_tab') : t('ws_doc_tab')}
          </button>
        ))}
      </div>

      {/* Document picker (doc mode only) */}
      {rightSideMode === 'document' && (
        <select
          value={rightDocId ?? ''}
          onChange={(e) => setRightDocId(e.target.value || null)}
          className="app-input"
          style={{ flex: 1, height: 22, fontSize: 10.5, padding: '0 4px', minWidth: 0 }}
        >
          <option value="">Pick document…</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}

      {rightSideMode === 'blank' && <div style={{ flex: 1 }} />}

      {/* Page nav — doc mode with a doc selected */}
      {rightSideMode === 'document' && rightDoc && (
        <>
          <MiniBtn
            onClick={() => setRightDocPage(Math.max(1, rightDocPage - 1))}
            disabled={rightDocPage <= 1}
            title="Previous page"
          >
            ‹
          </MiniBtn>
          <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {rightDocPage}/{rightDoc.pageCount}
          </span>
          <MiniBtn
            onClick={() => setRightDocPage(Math.min(rightDoc!.pageCount, rightDocPage + 1))}
            disabled={rightDocPage >= rightDoc.pageCount}
            title="Next page"
          >
            ›
          </MiniBtn>
          <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0, margin: '0 1px' }} />
        </>
      )}

      {/* Zoom controls (always shown) */}
      <MiniBtn
        onClick={() => onRightZoomChange(rightZoom - 0.1)}
        disabled={rightZoom <= 0.5}
        title="Zoom out"
      >
        −
      </MiniBtn>
      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={Math.round(rightZoom * 100)}
        onChange={(e) => onRightZoomChange(Number(e.target.value) / 100)}
        className="zoom-slider"
        aria-label="Zoom level"
        style={{ width: 64 }}
      />
      <span style={{
        fontSize: 10, color: 'var(--text-3)',
        minWidth: 30, textAlign: 'center', flexShrink: 0,
        fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
      }}>
        {Math.round(rightZoom * 100)}%
      </span>
      <MiniBtn
        onClick={() => onRightZoomChange(rightZoom + 0.1)}
        disabled={rightZoom >= 2.0}
        title="Zoom in"
      >
        +
      </MiniBtn>
    </div>
  );
}

// ── Pane empty states ─────────────────────────────────────────────────────────

function BlankPaneEmpty({ onAdd }: { onAdd: () => void }) {
  const { t } = useLanguage();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, background: 'var(--bg-app)', padding: 32,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FilePlus size={20} style={{ color: 'var(--text-3)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
          {t('ws_no_blank_page')}
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {t('ws_add_blank_hint')}
        </p>
      </div>
      <button
        onClick={onAdd}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 16px',
          borderRadius: 4,
          background: '#ffffff',
          border: '1px solid transparent',
          color: '#0f172a',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 500,
          transition: 'background 0.13s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = '#ffffff'; }}
      >
        <FilePlus size={13} />
        {t('ws_add_blank')}
      </button>
    </div>
  );
}

function DocPickEmpty() {
  const { t } = useLanguage();
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 8, background: 'var(--bg-app)', padding: 32,
    }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{t('ws_no_doc_selected')}</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
        {t('ws_choose_doc_hint')}
      </p>
    </div>
  );
}

// ── Help modal (Shortcuts / Tips / Getting Started / What's New) ─────────────

function ShareToCommunityModal({ docId, docName, pageTextNotes, onClose }: {
  docId: string | null;
  docName: string | null;
  pageTextNotes: Record<string, import('@/types').TextNote[]>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);

  const addTag = (tagStr: string) => {
    const trimmed = tagStr.trim().replace(/,/g, '');
    if (!trimmed || tags.includes(trimmed) || tags.length >= 5) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
  };

  const handlePost = async () => {
    if (!title.trim() || posting) return;
    setPosting(true);
    const pages: import('@/lib/supabase/db').CommunityPage[] = [];
    if (docId) {
      const prefix = `${docId}:`;
      for (const [key, notes] of Object.entries(pageTextNotes)) {
        if (!key.startsWith(prefix)) continue;
        if (!notes.length) continue;
        pages.push({
          pageKey: key.slice(prefix.length),
          textNotes: notes.map((n) => ({ content: n.content, x: n.x, y: n.y })),
          canvasData: null,
        });
      }
    }
    await createCommunityPost({ documentId: docId, title: title.trim(), description: description.trim(), pages, tags });
    setPosting(false);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-float)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--bg-float-border)',
          boxShadow: 'var(--shadow-float)',
          borderRadius: 4, padding: '28px', width: 420,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Posted to Community!</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{t('ws_share_title')}</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            {docName && (
              <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-3)' }}>
                {t('ws_share_from')} <strong style={{ color: 'var(--text-2)' }}>{docName}</strong>
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{t('ws_share_title_label')}</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('ws_share_title_placeholder')}
                  style={{
                    width: '100%', height: 36, padding: '0 10px', boxSizing: 'border-box',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 4, fontSize: 13, color: 'var(--text-1)',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{t('ws_share_desc_label')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('ws_share_desc_placeholder')}
                  rows={3}
                  style={{
                    width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 4, fontSize: 13, color: 'var(--text-1)',
                    outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{t('ws_share_tags_label')}</label>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
                    {tags.map((t) => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 500 }}>
                        {t}
                        <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, fontSize: 12 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                    placeholder={t('ws_share_tags_placeholder')} disabled={tags.length >= 5}
                    style={{ flex: 1, height: 32, padding: '0 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={() => addTag(tagInput)} disabled={!tagInput.trim() || tags.length >= 5} style={{ height: 32, padding: '0 10px', borderRadius: 4, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('common_add')}</button>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                {t('ws_share_notes_hint')}
              </p>

              <button
                onClick={handlePost}
                disabled={!title.trim() || posting}
                style={{
                  height: 40, borderRadius: 4,
                  background: title.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: title.trim() ? '#fff' : 'var(--text-3)',
                  border: 'none', fontSize: 13.5, fontWeight: 600,
                  cursor: title.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'background 0.12s, color 0.12s',
                }}
              >
                {posting ? t('ws_share_posting') : t('ws_share_btn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const HELP_GS_KEY = 'help_getting_started_v1';
type GsState = { upload: boolean; voice: boolean; draw: boolean; bookmark: boolean; ai: boolean; room: boolean };
const GS_DEFAULT: GsState = { upload: false, voice: false, draw: false, bookmark: false, ai: false, room: false };

function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(0);
  const [checklist, setChecklist] = useState<GsState>(() => {
    try {
      const s = localStorage.getItem(HELP_GS_KEY);
      return s ? { ...GS_DEFAULT, ...JSON.parse(s) } : GS_DEFAULT;
    } catch { return GS_DEFAULT; }
  });

  const toggleCheck = (key: keyof GsState) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    try { localStorage.setItem(HELP_GS_KEY, JSON.stringify(next)); } catch {}
  };
  const allDone = Object.values(checklist).every(Boolean);

  const tabs = [t('help_tab_shortcuts'), t('help_tab_tips'), t('help_tab_start'), t('help_tab_new')];

  const scGroups = [
    {
      label: 'Navigation',
      items: [{ key: '← / →', desc: t('ws_sc_nav') }],
    },
    {
      label: 'Tools',
      items: [
        { key: 'P', desc: t('ws_sc_pen') },
        { key: 'M', desc: t('ws_sc_marker') },
        { key: 'H', desc: t('ws_sc_highlighter') },
        { key: 'E', desc: t('ws_sc_eraser') },
        { key: 'C', desc: t('ws_sc_cursor') },
      ],
    },
    {
      label: 'Drawing',
      items: [
        { key: 'Shift + drag', desc: t('ws_sc_straight') },
        { key: 'Ctrl + Z', desc: t('ws_sc_undo') },
      ],
    },
    {
      label: 'Document',
      items: [
        { key: 'N', desc: t('ws_sc_blank') },
        { key: 'Ctrl + B', desc: t('ws_sc_bookmark') },
        { key: 'Ctrl + F', desc: t('ws_sc_search') },
        { key: 'Ctrl + S', desc: t('ws_sc_sync') },
        { key: 'Space', desc: t('ws_sc_play') },
      ],
    },
    {
      label: 'Zoom',
      items: [
        { key: 'Ctrl + +', desc: t('ws_sc_zoom_in') },
        { key: 'Ctrl + −', desc: t('ws_sc_zoom_out') },
      ],
    },
    {
      label: 'Other',
      items: [
        { key: 'Escape', desc: t('ws_sc_escape') },
        { key: '?', desc: t('ws_sc_help') },
      ],
    },
  ];

  const tips = [
    { title: t('help_tip1_title'), body: t('help_tip1') },
    { title: t('help_tip2_title'), body: t('help_tip2') },
    { title: t('help_tip3_title'), body: t('help_tip3') },
    { title: t('help_tip4_title'), body: t('help_tip4') },
    { title: t('help_tip5_title'), body: t('help_tip5') },
  ];

  const gsItems: { key: keyof GsState; label: string }[] = [
    { key: 'upload',   label: t('help_gs_upload') },
    { key: 'voice',    label: t('help_gs_voice') },
    { key: 'draw',     label: t('help_gs_draw') },
    { key: 'bookmark', label: t('help_gs_bookmark') },
    { key: 'ai',       label: t('help_gs_ai') },
    { key: 'room',     label: t('help_gs_room') },
  ];

  const wnItems = [
    { title: t('help_wn1_title'), body: t('help_wn1_body') },
    { title: t('help_wn2_title'), body: t('help_wn2_body') },
    { title: t('help_wn3_title'), body: t('help_wn3_body') },
    { title: t('help_wn4_title'), body: t('help_wn4_body') },
    { title: t('help_wn5_title'), body: t('help_wn5_body') },
  ];

  const KBD = ({ children }: { children: React.ReactNode }) => (
    <kbd style={{
      fontSize: 10.5, fontFamily: 'inherit', fontWeight: 600,
      color: 'var(--text-2)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-strong)',
      borderRadius: 4, padding: '1px 6px',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{children}</kbd>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.52)',
      }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{
          width: 460,
          maxHeight: '82vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-float)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--bg-float-border)',
          boxShadow: 'var(--shadow-float)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 0',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>
            {t('help_title')}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: 4, border: '1px solid transparent',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent' })}
          ><X size={13} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '10px 18px 0', flexShrink: 0 }}>
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              style={{
                padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: activeTab === i ? 'var(--bg-active)' : 'transparent',
                border: `1px solid ${activeTab === i ? 'var(--border-strong)' : 'transparent'}`,
                color: activeTab === i ? 'var(--text-1)' : 'var(--text-3)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseOver={(e) => { if (activeTab !== i) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-2)' }); }}
              onMouseOut={(e) => { if (activeTab !== i) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' }); }}
            >{tab}</button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '10px 0 0' }} />

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 18px' }}>

          {/* ── Shortcuts tab ── */}
          {activeTab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {scGroups.map(({ label, items }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {items.map(({ key, desc }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{desc}</span>
                        <KBD>{key}</KBD>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Tips tab ── */}
          {activeTab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tips.map(({ title, body }, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{body}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Getting Started tab ── */}
          {activeTab === 2 && (
            <div>
              {!allDone && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
                  {t('help_gs_subtitle')}
                </p>
              )}
              {allDone ? (
                <div style={{
                  padding: '16px 14px', borderRadius: 4,
                  background: 'rgba(89,101,217,0.1)',
                  border: '1px solid rgba(89,101,217,0.25)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t('help_gs_done')}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gsItems.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleCheck(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', borderRadius: 4, width: '100%',
                        background: checklist[key] ? 'rgba(89,101,217,0.07)' : 'var(--bg-elevated)',
                        border: `1px solid ${checklist[key] ? 'rgba(89,101,217,0.22)' : 'var(--border)'}`,
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        transition: 'background 0.14s, border-color 0.14s',
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        background: checklist[key] ? 'var(--accent)' : 'var(--bg-panel)',
                        border: `1.5px solid ${checklist[key] ? 'var(--accent)' : 'var(--border-strong)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.14s, border-color 0.14s',
                      }}>
                        {checklist[key] && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: 12.5, fontWeight: 500,
                        color: checklist[key] ? 'var(--text-3)' : 'var(--text-1)',
                        textDecoration: checklist[key] ? 'line-through' : 'none',
                        transition: 'color 0.14s',
                      }}>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── What's New tab ── */}
          {activeTab === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {wnItems.map(({ title, body }, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                    background: 'var(--accent)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, marginTop: 1,
                  }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  useAuthGuard();
  useSessionGuard({ onKicked: () => { window.location.href = '/login?kicked=1'; } });
  const { t } = useLanguage();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'premium' | 'pro'>('free');
  const [isVip,    setIsVip]    = useState(false);
  const [limitModal, setLimitModal] = useState<'documents' | 'room' | 'voice' | null>(null);

  // ── Current user (for Supabase sync) ─────────────────────────────────────
  // userId as state so effects that depend on it re-run once the async
  // getUser() resolves. userIdRef mirrors it for use inside callbacks.
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      const uid = user?.id ?? null;
      userIdRef.current = uid;
      setUserId(uid);
      setUserEmail(user?.email ?? '');
      const profile = await getProfile();
      setUserDisplayName(profile?.username ?? user?.email?.split('@')[0] ?? '');
      setUserAvatarUrl(profile?.avatarUrl ?? null);
      if (profile?.plan) setUserPlan(profile.plan as 'free' | 'premium' | 'pro');
      if (profile?.isVip) setIsVip(true);
      console.log('[StudySync] userId resolved:', uid ?? 'NOT LOGGED IN');
    });
  }, []);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const stored = storageGet<string>(KEYS.THEME) ?? localStorage.getItem('theme');
    if (stored === 'light') {
      setIsDark(false);
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    html.setAttribute('data-transitioning', '');
    const next = !isDark;
    setIsDark(next);
    if (next) {
      html.removeAttribute('data-theme');
      storageSet(KEYS.THEME, 'dark');
    } else {
      html.setAttribute('data-theme', 'light');
      storageSet(KEYS.THEME, 'light');
    }
    setTimeout(() => html.removeAttribute('data-transitioning'), 350);
  }, [isDark]);

  // ── Global appearance — load from Supabase (cross-device) ────────────────
  useEffect(() => {
    loadUserPreferences().then((prefs) => {
      if (!prefs) return;
      // Sync localStorage cache
      if (prefs.accent_color) storageSet(KEYS.ACCENT_COLOR, prefs.accent_color);
      if (prefs.font_size)    storageSet(KEYS.FONT_SIZE, prefs.font_size);
      if (prefs.font_family)  storageSet(KEYS.FONT_FAMILY, prefs.font_family);
      if (prefs.bg_color !== undefined) storageSet(KEYS.BG_COLOR, prefs.bg_color);
      if (prefs.sidebar_color !== undefined) storageSet(KEYS.SIDEBAR_COLOR, prefs.sidebar_color);
      if (prefs.theme)        storageSet(KEYS.THEME, prefs.theme);
      applyPreferences({
        theme:        (prefs.theme as 'dark' | 'light') ?? undefined,
        fontSize:     (prefs.font_size as 'small' | 'medium' | 'large') ?? undefined,
        accentColor:  prefs.accent_color ?? undefined,
        bgColor:      prefs.bg_color,
        sidebarColor: prefs.sidebar_color,
        fontFamily:   (prefs.font_family as 'default' | 'serif' | 'mono') ?? undefined,
      });
    });
  }, []);

  // ── Default blank page background ────────────────────────────────────────
  const [defaultBgTheme, setDefaultBgTheme] = useState<'white' | 'dark'>('white');

  useEffect(() => {
    const stored = storageGet<'white' | 'dark'>(KEYS.DEFAULT_BG);
    if (stored === 'white' || stored === 'dark') setDefaultBgTheme(stored);
  }, []);

  const handleDefaultBgThemeChange = useCallback((theme: 'white' | 'dark') => {
    setDefaultBgTheme(theme);
    storageSet(KEYS.DEFAULT_BG, theme);
  }, []);

  // ── Shortcuts modal ───────────────────────────────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // ── Share to Community ────────────────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);

  // ── Pomodoro ──────────────────────────────────────────────────────────────
  const [pomodoroOpen, setPomodoroOpen] = useState(false);

  // ── Global Search ─────────────────────────────────────────────────────────
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // ── Export dropdown ───────────────────────────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const {
    documents, activeDocument, activeDocumentId,
    isLoading, addDocument, removeDocument, updateDocumentId, reorderDocuments, setActiveDocument, goToPage,
  } = usePDF();
  const {
    notes: voiceNotes,
    isRecording, recordingDuration, recordingContext,
    startRecording, stopRecording, deleteNote, deleteNotesForDocument,
    updateNoteTitle, getNotesForPage,
    seedVoiceNotes,
  } = useVoiceNotes({ onStorageLimitReached: () => setLimitModal('voice') });
  const {
    insertBlankPage, removeBlankPage,
    updateCanvasData, updateImages, updateBgTheme, getBlankPagesForDocument,
    seedBlankPages, removePagesForDocument,
  } = useBlankPages();
  const { getDrawing, saveDrawing, seedDrawings, clearAllDrawings } = usePDFDrawings();
  const { getPageImages, setPageImages, seedPageImages, loadLocalPageImages, deletePageImage, removePageImagesForDocument, allPageImages } = usePDFPageImages();
  useStudySession(activeDocumentId, userId);

  // ── Pending reopen file (from Library page "Open" button) ─────────────────
  useEffect(() => {
    getPendingReopenFile().then(async (file) => {
      if (!file) return;
      await clearPendingReopenFile();
      sessionStorage.removeItem('reopen_doc_id');
      sessionStorage.removeItem('reopen_doc_name');
      addDocument(file).catch(console.error);
    }).catch(console.error);
  }, [addDocument]);

  // ── Document order ────────────────────────────────────────────────────────
  const savedOrderRef = useRef<string[]>([]);
  const lastAppliedOrderRef = useRef<string>('');

  useEffect(() => {
    loadDocumentOrder().then((order) => {
      if (order) savedOrderRef.current = order;
    });
  }, []);

  useEffect(() => {
    if (savedOrderRef.current.length === 0 || documents.length === 0) return;
    const currentKey = documents.map((d) => d.id).join(',');
    const ordered = applyDocOrder(documents, savedOrderRef.current);
    const orderedKey = ordered.map((d) => d.id).join(',');
    if (orderedKey === currentKey || orderedKey === lastAppliedOrderRef.current) return;
    lastAppliedOrderRef.current = orderedKey;
    reorderDocuments(ordered);
  }, [documents, reorderDocuments]);

  const handleReorderDocuments = useCallback((ids: string[]) => {
    savedOrderRef.current = ids;
    reorderDocuments(applyDocOrder(documents, ids));
    saveDocumentOrder(ids);
  }, [documents, reorderDocuments]);

  // ── Virtual pages ─────────────────────────────────────────────────────────
  const [virtualIndex, setVirtualIndex] = useState(0);
  const docBlankPages = activeDocument
    ? getBlankPagesForDocument(activeDocument.id)
    : [];
  const virtualSequence = activeDocument
    ? buildVirtualSequence(activeDocument.pageCount, docBlankPages)
    : [];
  const currentVP: VirtualPage | null = virtualSequence[virtualIndex] ?? null;
  const currentPdfPage = currentVP?.type === 'pdf' ? currentVP.pdfPage : null;

  // Restore last page when a document is activated; fall back to 0 for new docs
  useEffect(() => {
    if (!activeDocumentId) return;
    const session = storageGet<{ docId: string; virtualIndex: number }>(KEYS.SESSION);
    setVirtualIndex(
      session?.docId === activeDocumentId ? session.virtualIndex : 0
    );
  }, [activeDocumentId]);

  // Save session (active doc + page) whenever either changes
  useEffect(() => {
    if (!activeDocumentId) return;
    storageSet(KEYS.SESSION, { docId: activeDocumentId, virtualIndex });
    if (userIdRef.current) dbSaveSessionState(activeDocumentId, virtualIndex);
  }, [activeDocumentId, virtualIndex]);

  // Load per-document data from Supabase when the active document changes.
  // upsertDocument returns the canonical ID (cross-device stable). If it differs
  // from the locally-generated UUID, we remap state/localStorage and let the
  // effect re-run with the canonical ID before fetching any data.
  useEffect(() => {
    if (!activeDocumentId || !activeDocument || !userId) return;

    const syncDoc = async () => {
      const canonicalId = await upsertDocument({
        id: activeDocument.id,
        name: activeDocument.name,
        type: activeDocument.type ?? 'pdf',
        pageCount: activeDocument.pageCount,
      });

      if (canonicalId !== activeDocumentId) {
        // Another device registered this doc first — adopt its ID everywhere.
        // updateDocumentId updates React state + localStorage docMap; the effect
        // will re-run once with the canonical activeDocumentId.
        console.log('[StudySync] adopting canonical ID:', canonicalId, '(local was:', activeDocumentId + ')');
        updateDocumentId(activeDocumentId, canonicalId);
        return;
      }

      const [remoteDrawings, remoteBlankPages, remoteTextNotes, remoteVoiceNotes, remotePageImages] = await Promise.all([
        fetchDrawings(canonicalId),
        fetchBlankPages(canonicalId),
        fetchTextNotes(canonicalId),
        fetchVoiceNotes(canonicalId),
        fetchAllPageImages(canonicalId),
      ]);

      console.log('[StudySync] fetchDrawings:', Object.keys(remoteDrawings).length, 'rows');
      console.log('[StudySync] fetchBlankPages:', remoteBlankPages.length, 'rows');
      console.log('[StudySync] fetchTextNotes:', Object.keys(remoteTextNotes).length, 'pages');
      console.log('[StudySync] fetchVoiceNotes:', remoteVoiceNotes.length, 'rows');

      // Drawings are stored locally as "docId:pageNum" — prefix to match
      const prefixedDrawings: Record<string, string> = {};
      for (const [pageKey, data] of Object.entries(remoteDrawings)) {
        prefixedDrawings[`${canonicalId}:${pageKey}`] = data;
      }
      seedDrawings(prefixedDrawings);
      seedBlankPages(remoteBlankPages);

      // Text notes: remote wins for pages not present locally
      const prefixedNotes: Record<string, TextNote[]> = {};
      for (const [subKey, notes] of Object.entries(remoteTextNotes)) {
        prefixedNotes[`${canonicalId}:${subKey}`] = notes;
      }
      if (Object.keys(prefixedNotes).length > 0) {
        setPageTextNotes((prev) => ({ ...prefixedNotes, ...prev }));
      }

      // Upload local-only text note pages that Supabase doesn't have yet
      const localPrefix = `${canonicalId}:`;
      const remotePageKeys = new Set(Object.keys(remoteTextNotes));
      for (const [fullKey, notes] of Object.entries(pageTextNotes)) {
        if (!fullKey.startsWith(localPrefix)) continue;
        const pageKey = fullKey.slice(localPrefix.length);
        if (remotePageKeys.has(pageKey)) continue;
        if (notes.length === 0) continue;
        console.log('[StudySync] uploading local-only text notes for page:', pageKey, 'count:', notes.length);
        dbSaveTextNotes(canonicalId, pageKey, notes);
      }

      // Seed voice notes fetched with the canonical docId — happens after ID resolution
      // so documentId always matches and pageNumber is already normalized to number
      seedVoiceNotes(remoteVoiceNotes);

      // Page image annotations
      if (Object.keys(remotePageImages).length > 0) {
        seedPageImages(canonicalId, remotePageImages);
      } else {
        loadLocalPageImages(canonicalId);
      }
    };

    syncDoc().catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocumentId, userId]);

  useEffect(() => {
    if (currentPdfPage !== null) goToPage(currentPdfPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPdfPage]);

  const goVirtualPrev = useCallback(
    () => setVirtualIndex((i) => Math.max(0, i - 1)),
    [],
  );
  const goVirtualNext = useCallback(
    () => setVirtualIndex((i) => Math.min(i + 1, virtualSequence.length - 1)),
    [virtualSequence.length],
  );
  const goVirtualToPage = useCallback(
    (page: number) =>
      setVirtualIndex(Math.max(0, Math.min(page - 1, virtualSequence.length - 1))),
    [virtualSequence.length],
  );

  const handleInsertBlankPage = useCallback((theme?: 'white' | 'dark') => {
    if (!activeDocument) return;
    const afterPage = currentVP?.type === 'pdf'
      ? currentVP.pdfPage
      : currentVP?.type === 'blank'
        ? currentVP.blankPage.insertAfterPage
        : activeDocument.currentPage;
    insertBlankPage(activeDocument.id, afterPage, theme ?? defaultBgTheme);
    setVirtualIndex((i) => i + 1);
  }, [activeDocument, currentVP, insertBlankPage, defaultBgTheme]);

  const handleDeleteBlankPage = useCallback((id: string) => {
    removeBlankPage(id);
    setVirtualIndex((i) => Math.max(0, i - 1));
  }, [removeBlankPage]);

  // ── Left-side drawing state ───────────────────────────────────────────────
  const [leftTool, setLeftTool]             = useState<Tool>('cursor');
  const [leftPenType, setLeftPenType]       = useState<PenType>('normal');
  const [leftColor, setLeftColor]           = useState('#ededf0');
  const { strokeSize: leftStrokeSize, setStrokeSize: setLeftStrokeSize } = useToolStrokeSize(leftTool, leftPenType);
  const [leftZoom, setLeftZoom]             = useState(1.0);

  // ── Right-side drawing state ──────────────────────────────────────────────
  const [rightTool, setRightTool]             = useState<Tool>('cursor');
  const [rightPenType, setRightPenType]       = useState<PenType>('normal');
  const [rightColor, setRightColor]           = useState('#ededf0');
  const { strokeSize: rightStrokeSize, setStrokeSize: setRightStrokeSize } = useToolStrokeSize(rightTool, rightPenType);
  const [rightZoom, setRightZoom]             = useState(1.0);

  // ── Active side ───────────────────────────────────────────────────────────
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');

  // The three drawing-canvas refs live in useSinglePageMode (extracted in
  // step 3) — they're destructured below alongside the right-pane text-note
  // wiring once leftNotesKey / splitRightBlankPage / rightDocId are ready.
  const mainRef            = useRef<HTMLElement>(null);

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    if (!activeDocumentId) { setBookmarks([]); return; }
    // Optimistic: localStorage first
    const stored = storageGet<Record<string, Bookmark[]>>(KEYS.BOOKMARKS);
    const local = stored?.[activeDocumentId] ?? [];
    setBookmarks(local);
    // Authoritative: Supabase — merge remote+local; upload any local-only bookmarks
    if (userId) {
      fetchBookmarks(activeDocumentId).then((remote) => {
        const remoteIds = new Set(remote.map((b) => b.id));
        const localOnly = local.filter((b) => !remoteIds.has(b.id));
        const merged = [...remote, ...localOnly];
        setBookmarks(merged);
        if (localOnly.length > 0) {
          console.log('[StudySync] uploading', localOnly.length, 'local-only bookmarks');
          dbSaveBookmarks(activeDocumentId, merged);
        }
      });
    }
  }, [activeDocumentId, userId]);

  const persistBookmarks = useCallback((docId: string, marks: Bookmark[]) => {
    const stored = storageGet<Record<string, Bookmark[]>>(KEYS.BOOKMARKS) ?? {};
    stored[docId] = marks;
    storageSet(KEYS.BOOKMARKS, stored);
    if (userIdRef.current) dbSaveBookmarks(docId, marks);
  }, []);

  const isCurrentPageBookmarked = bookmarks.some((b) => b.virtualIndex === virtualIndex);

  const handleToggleBookmark = useCallback(() => {
    if (!activeDocument) return;
    const existing = bookmarks.find((b) => b.virtualIndex === virtualIndex);
    if (existing) {
      const next = bookmarks.filter((b) => b.id !== existing.id);
      setBookmarks(next);
      persistBookmarks(activeDocument.id, next);
    } else {
      const label = currentVP?.type === 'pdf'
        ? `Page ${currentVP.pdfPage}`
        : 'Blank Page';
      const newBm: Bookmark = { id: `bm_${Date.now()}`, documentId: activeDocument.id, virtualIndex, label, createdAt: Date.now() };
      const next = [...bookmarks, newBm];
      setBookmarks(next);
      persistBookmarks(activeDocument.id, next);
    }
  }, [activeDocument, bookmarks, virtualIndex, currentVP, persistBookmarks]);

  const handleRemoveBookmark = useCallback((id: string) => {
    if (!activeDocument) return;
    const next = bookmarks.filter((b) => b.id !== id);
    setBookmarks(next);
    persistBookmarks(activeDocument.id, next);
  }, [activeDocument, bookmarks, persistBookmarks]);

  const handleNavigateToPdfPage = useCallback((pdfPage: number) => {
    const idx = virtualSequence.findIndex((vp) => vp.type === 'pdf' && vp.pdfPage === pdfPage);
    if (idx >= 0) setVirtualIndex(idx);
  }, [virtualSequence]);

  const handleGlobalSearchNavigate = useCallback((docId: string, pageNum?: number) => {
    setActiveDocument(docId);
    if (pageNum) {
      // Wait for the doc to become active, then navigate
      setTimeout(() => handleNavigateToPdfPage(pageNum), 80);
    }
  }, [setActiveDocument, handleNavigateToPdfPage]);

  // ── Text notes (persisted per doc+page) ──────────────────────────────────
  const [pageTextNotes, setPageTextNotes] = useState<Record<string, TextNote[]>>({});
  const prevTextNotesRef = useRef<Record<string, TextNote[]>>({});

  // ── Refs for keyboard handler (avoids stale closures) ────────────────────
  const showSplitRef    = useRef(false);
  const activeSideRef   = useRef<'left' | 'right'>('left');
  const rightSideModeRef = useRef<'blank' | 'document'>('blank');
  const currentVPRef    = useRef<VirtualPage | null>(null);
  const leftZoomRef     = useRef(1.0);
  const rightZoomRef    = useRef(1.0);
  const hasDocumentRef  = useRef(false);
  const isPPTXRef       = useRef(false);
  const voiceNoteListRef = useRef<import('@/components/VoiceNoteList').VoiceNoteListHandle>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tell the shared (app)/layout's LeftRail to collapse when entering
  // workspace fullscreen — see CSS rule `body[data-fullscreen] .left-rail`.
  useEffect(() => {
    if (isFullscreen) document.body.dataset.fullscreen = 'true';
    else delete document.body.dataset.fullscreen;
    return () => { delete document.body.dataset.fullscreen; };
  }, [isFullscreen]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((f) => {
      if (f) { return false; }
      setVoiceSheetOpen(false);
      return true;
    });
  }, []);

  // ── Persistence: text notes ───────────────────────────────────────────────
  useEffect(() => {
    storageSet(KEYS.TEXT_NOTES, pageTextNotes);
    if (userIdRef.current) {
      // Only sync pages whose notes array reference changed (i.e. were mutated)
      for (const [fullKey, notes] of Object.entries(pageTextNotes)) {
        if (prevTextNotesRef.current[fullKey] === notes) continue;
        const colonIdx = fullKey.indexOf(':');
        if (colonIdx === -1) continue;
        dbSaveTextNotes(fullKey.slice(0, colonIdx), fullKey.slice(colonIdx + 1), notes);
      }
    }
    prevTextNotesRef.current = pageTextNotes;
  }, [pageTextNotes]);

  // ── Restore text notes from storage on mount ──────────────────────────────
  useEffect(() => {
    const stored = storageGet<Record<string, TextNote[]>>(KEYS.TEXT_NOTES);
    if (stored && Object.keys(stored).length > 0) setPageTextNotes(stored);
  }, []);

  // ── Persistence: zoom per document ────────────────────────────────────────
  const activeDocumentIdRef = useRef<string | null>(null);
  activeDocumentIdRef.current = activeDocumentId;

  // Restore zoom when the active document changes
  useEffect(() => {
    if (!activeDocumentId) return;
    const stored = storageGet<Record<string, number>>(KEYS.ZOOM);
    if (stored?.[activeDocumentId]) setLeftZoom(stored[activeDocumentId]);
  }, [activeDocumentId]);

  const handleLeftZoomChange = useCallback((z: number) => {
    const clamped = clampZoom(z);
    setLeftZoom(clamped);
    const docId = activeDocumentIdRef.current;
    if (docId) {
      const stored = storageGet<Record<string, number>>(KEYS.ZOOM) ?? {};
      stored[docId] = clamped;
      storageSet(KEYS.ZOOM, stored);
    }
  }, []);
  const handleRightZoomChange = useCallback((z: number) => setRightZoom(clampZoom(z)), []);

  const currentDrawing = activeDocument && currentVP?.type === 'pdf'
    ? getDrawing(activeDocument.id, currentVP.pdfPage)
    : undefined;

  const handleSaveDrawing = useCallback((data: string) => {
    if (activeDocument && currentVP?.type === 'pdf') {
      saveDrawing(activeDocument.id, currentVP.pdfPage, data);
    }
  }, [activeDocument, currentVP, saveDrawing]);

  // ── Split view ────────────────────────────────────────────────────────────
  const [splitMode, setSplitMode] = useState(false);
  const [isMobile, setIsMobile]   = useState(false);
  const showSplit = splitMode && !isMobile;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Right pane mode ───────────────────────────────────────────────────────
  const [rightSideMode, setRightSideMode] = useState<'blank' | 'document'>('blank');
  const [rightDocId, setRightDocId]       = useState<string | null>(null);
  const [rightDocPage, setRightDocPage]   = useState(1);

  const rightDoc = useMemo(
    () => documents.find((d) => d.id === rightDocId) ?? null,
    [documents, rightDocId],
  );

  // Shallow-clone with overridden page so right pane navigates independently
  const rightDocForViewer = useMemo(
    () => rightDoc ? { ...rightDoc, currentPage: rightDocPage } : null,
    [rightDoc, rightDocPage],
  );

  // Reset page when the selected right doc changes
  useEffect(() => { setRightDocPage(1); }, [rightDocId]);

  const rightDocDrawing = useMemo(
    () => (rightDoc ? getDrawing(rightDoc.id, rightDocPage) : undefined),
    [rightDoc, rightDocPage, getDrawing],
  );

  const handleSaveRightDocDrawing = useCallback((data: string) => {
    if (rightDoc) saveDrawing(rightDoc.id, rightDocPage, data);
  }, [rightDoc, rightDocPage, saveDrawing]);

  // Blank page associated with the current PDF page in split mode
  const splitRightBlankPage = useMemo((): BlankPage | null => {
    if (!showSplit || !activeDocument || activeDocument.type === 'pptx') return null;
    if (currentVP?.type === 'blank') return currentVP.blankPage;
    return docBlankPages.find(
      (p) => p.insertAfterPage === activeDocument.currentPage,
    ) ?? null;
  }, [showSplit, currentVP, activeDocument, docBlankPages]);

  const handleInsertSplitBlankPage = useCallback((theme: 'white' | 'dark' = 'white') => {
    if (!activeDocument) return;
    const afterPage = activeDocument.currentPage;
    const newPage = insertBlankPage(activeDocument.id, afterPage, theme);
    const newIndex = virtualSequence.findIndex(
      (vp) => vp.type === 'blank' && vp.blankPage.id === newPage.id,
    );
    if (newIndex >= 0) setVirtualIndex(newIndex);
  }, [activeDocument, insertBlankPage, virtualSequence]);

  // ── UI panels ─────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab]   = useState<'notes' | 'ai' | 'chat'>('ai');
  const [navBarVisible, setNavBarVisible]   = useState(true);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen]         = useState(false);
  const [viewMode, setViewMode]             = useState<'page' | 'scroll'>(() => {
    if (typeof window === 'undefined') return 'page';
    return storageGet<'page' | 'scroll'>(KEYS.VIEW_MODE) ?? 'page';
  });
  const [selectedText, setSelectedText]     = useState('');

  // ── Resizable panels ──────────────────────────────────────────────────────
  const SIDEBAR_MIN = 150;
  const SIDEBAR_MAX = 350;
  const SIDEBAR_DEFAULT = 256;
  const RPANEL_MIN = 150;
  const RPANEL_MAX = 300;
  const RPANEL_DEFAULT = 220;

  const [sidebarWidth, setSidebarWidth]       = useState(SIDEBAR_DEFAULT);
  const [rightPanelWidth, setRightPanelWidth] = useState(RPANEL_DEFAULT);
  const [isDraggingLeft, setIsDraggingLeft]   = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const dragStartXRef      = useRef(0);
  const dragStartWidthRef  = useRef(0);
  const dragSideRef        = useRef<'left' | 'right' | null>(null);

  const startLeftDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartXRef.current     = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    dragSideRef.current       = 'left';
    setIsDraggingLeft(true);
  }, [sidebarWidth]);

  const startRightDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartXRef.current     = e.clientX;
    dragStartWidthRef.current = rightPanelWidth;
    dragSideRef.current       = 'right';
    setIsDraggingRight(true);
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartXRef.current;
      if (dragSideRef.current === 'left') {
        const next = dragStartWidthRef.current + dx;
        if (next < SIDEBAR_MIN) {
          setSidebarOpen(false);
          setSidebarWidth(SIDEBAR_DEFAULT);
        } else {
          setSidebarOpen(true);
          setSidebarWidth(Math.min(next, SIDEBAR_MAX));
        }
      } else {
        const next = dragStartWidthRef.current - dx;
        if (next < RPANEL_MIN) {
          setRightPanelOpen(false);
          setRightPanelWidth(RPANEL_DEFAULT);
        } else {
          setRightPanelOpen(true);
          setRightPanelWidth(Math.min(next, RPANEL_MAX));
        }
      }
    };
    const onUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      dragSideRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  useEffect(() => { if (isRecording) setVoiceSheetOpen(true); }, [isRecording]);

  // Track text selected anywhere on the page for the Translate feature
  useEffect(() => {
    const onSel = () => {
      const text = window.getSelection()?.toString().trim() ?? '';
      if (text) setSelectedText(text);
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  // ── Voice notes ───────────────────────────────────────────────────────────
  // Read page directly from the virtual page — always matches what's displayed.
  // activeDocument.currentPage lags one render behind (set by the goToPage effect),
  // which caused all voice notes to save as page 1.
  const pageIdentifier: number | string =
    currentVP?.type === 'blank' ? currentVP.blankPage.id
    : currentVP?.type === 'pdf' ? currentVP.pdfPage
    : 1;
  const pageNotes = activeDocument
    ? getNotesForPage(activeDocument.id, pageIdentifier)
    : [];
  const pageKey = activeDocument ? `${activeDocument.id}:${pageIdentifier}` : '';

  // leftNotesKey is the canonical text-note key for the centred/active page.
  // It's a 1:1 alias of pageKey, lifted here so useSinglePageMode (and its
  // handleLeftNotesChange) can be wired right after pageKey is computed.
  const leftNotesKey = pageKey;

  // ── Single-page-mode rendering wiring (pure extraction — see useSinglePageMode) ──
  const {
    pdfDrawingRef,
    blankDrawingRef,
    rightDocDrawingRef,
    rightBlankNotesKey,
    rightDocNotesKey,
    handleLeftNotesChange,
    handleRightBlankNotesChange,
    handleRightDocNotesChange,
  } = useSinglePageMode({
    leftNotesKey,
    splitRightBlankPage,
    activeDocument,
    rightDocId,
    rightDocPage,
    setPageTextNotes,
  });

  // ── Scroll-mode blank-page drawing wiring ────────────────────────────────
  // Drawing state + helpers live in useBlankPageDrawing (step 1). Text-note
  // glue + tool-toggle callbacks for PDFScrollViewer live in useScrollMode
  // (step 3). markBlankInteracted bridges the two so a note save still
  // stamps the lastInteractedBlankIdRef that resolveScrollBlankPageId reads.
  const {
    blankUndoStacksRef,
    blankRedoStacksRef,
    getBlankDrawingScroll,
    saveBlankDrawingScroll,
    resolveScrollBlankPageId,
    markBlankInteracted,
  } = useBlankPageDrawing({ docBlankPages, updateCanvasData, currentVP });

  const {
    getBlankNotesScroll,
    saveBlankNotesScroll,
    activateTextToolScroll,
    exitTextToolScroll,
  } = useScrollMode({
    activeDocument,
    pageTextNotes,
    setPageTextNotes,
    setLeftTool,
    markBlankInteracted,
  });

  // ── Scroll-mode PDF-page undo/clear + text-note wiring ───────────────────
  // Mirrors the blank-page pattern. PDFScrollViewer doesn't mount
  // PDFWithDrawing, so pdfDrawingRef is null in scroll mode → there's no
  // built-in undo. The wrapper below pushes the previous canvasData URL
  // onto a per-(docId:pdfPage) stack before each save; useUndoClear's
  // scroll-mode branch pops it on Undo. lastInteractedPdfPageRef is the
  // PDF analogue of the blank lastInteracted ref (used as a fallback if
  // the user scrolled away between their stroke and the Undo click).
  const pdfUndoStacksRef = useRef<Record<string, Array<string | undefined>>>({});
  const pdfRedoStacksRef = useRef<Record<string, Array<string | undefined>>>({});
  const lastInteractedPdfPageRef = useRef<{ docId: string; pdfPage: number } | null>(null);

  const savePdfDrawingScroll = useCallback((docId: string, page: number, data: string) => {
    const key = `${docId}:${page}`;
    const prev = getDrawing(docId, page);
    if (prev !== data) {
      const stack = pdfUndoStacksRef.current[key] ?? [];
      stack.push(prev);
      if (stack.length > MAX_UNDO_HISTORY) stack.shift();
      pdfUndoStacksRef.current[key] = stack;
      pdfRedoStacksRef.current[key] = [];
      lastInteractedPdfPageRef.current = { docId, pdfPage: page };
    }
    saveDrawing(docId, page, data);
  }, [getDrawing, saveDrawing]);

  const getPdfNotesScroll = useCallback((pdfPage: number): TextNote[] => {
    if (!activeDocument) return [];
    return pageTextNotes[`${activeDocument.id}:${pdfPage}`] ?? [];
  }, [activeDocument, pageTextNotes]);

  const savePdfNotesScroll = useCallback((pdfPage: number, notes: TextNote[]) => {
    if (!activeDocument) return;
    const key = `${activeDocument.id}:${pdfPage}`;
    setPageTextNotes((prev) => ({ ...prev, [key]: notes }));
    lastInteractedPdfPageRef.current = { docId: activeDocument.id, pdfPage };
  }, [activeDocument]);

  // ── Undo + Clear handlers (pure extraction — see useUndoClear) ───────────
  const { handleUndo, handleRedo, handleClear } = useUndoClear({
    showSplit, activeSide, rightSideMode, viewMode, currentVP,
    pdfDrawingRef, blankDrawingRef, rightDocDrawingRef,
    blankUndoStacksRef, blankRedoStacksRef, resolveScrollBlankPageId,
    updateCanvasData, docBlankPages,
    pdfUndoStacksRef, pdfRedoStacksRef, lastInteractedPdfPageRef, activeDocument,
    getPdfDrawing: getDrawing, savePdfDrawing: saveDrawing,
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Escape always works
      if (e.key === 'Escape') {
        if (isFullscreen) { exitFullscreen(); return; }
        setShortcutsOpen(false);
        setSearchOpen(false);
        // Drop back to cursor (replaces the dedicated cursor pill)
        if (!inInput) {
          const atSetTool = showSplitRef.current && activeSideRef.current === 'right' ? setRightTool : setLeftTool;
          atSetTool('cursor');
        }
        return;
      }

      if (inInput) return;

      if (e.key === 'ArrowRight') { goVirtualNext(); return; }
      if (e.key === 'ArrowLeft')  { goVirtualPrev(); return; }
      if (e.key === '?') { setShortcutsOpen(o => !o); return; }

      // Tool shortcuts (no modifier keys)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const atSetTool    = showSplitRef.current && activeSideRef.current === 'right' ? setRightTool    : setLeftTool;
        const atSetPenType = showSplitRef.current && activeSideRef.current === 'right' ? setRightPenType : setLeftPenType;
        if (e.key === 'p' || e.key === 'P') { atSetTool('pen');    atSetPenType('normal');      return; }
        if (e.key === 'm' || e.key === 'M') { atSetTool('pen');    atSetPenType('marker');      return; }
        if (e.key === 'h' || e.key === 'H') { atSetTool('pen');    atSetPenType('highlighter'); return; }
        if (e.key === 'e' || e.key === 'E') { atSetTool('eraser');                              return; }
        if (e.key === 'c' || e.key === 'C') { atSetTool('cursor');                              return; }
        if ((e.key === 'n' || e.key === 'N') && hasDocumentRef.current) {
          handleInsertBlankPage(); return;
        }
        if (e.key === ' ') {
          e.preventDefault();
          voiceNoteListRef.current?.playPause();
          return;
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          if (!isPPTXRef.current && hasDocumentRef.current) setSearchOpen((o) => !o);
          return;
        }
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setGlobalSearchOpen(true);
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
            return;
          }
          handleUndo();
          return;
        }
        if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          if (hasDocumentRef.current) handleToggleBookmark();
          return;
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          showToast('Synced ✓');
          return;
        }
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          if (showSplitRef.current && activeSideRef.current === 'right')
            handleRightZoomChange(rightZoomRef.current + 0.25);
          else
            handleLeftZoomChange(leftZoomRef.current + 0.25);
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          if (showSplitRef.current && activeSideRef.current === 'right')
            handleRightZoomChange(rightZoomRef.current - 0.25);
          else
            handleLeftZoomChange(leftZoomRef.current - 0.25);
          return;
        }
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [goVirtualNext, goVirtualPrev, handleLeftZoomChange, handleRightZoomChange, handleUndo, handleRedo,
      handleToggleBookmark, handleInsertBlankPage, showToast,
      setLeftTool, setRightTool, setLeftPenType, setRightPenType,
      isFullscreen, exitFullscreen]);

  const handleFilesAdded = useCallback(async (files: File[]) => {
    const docLimit = effectivePlanLimits(userPlan, isVip).documents;
    if (docLimit !== Infinity) {
      const remaining = docLimit - documents.length;
      if (remaining <= 0) {
        setLimitModal('documents');
        return;
      }
      files = files.slice(0, remaining);
    }
    let anyRestored = false;
    for (const f of files) {
      const { isRestored } = await addDocument(f);
      if (isRestored) anyRestored = true;
      if (userIdRef.current) {
        const docMap = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
        const docId = docMap[f.name];
        if (docId) {
          upsertDocument({
            id: docId,
            name: f.name.replace(/\.(pdf|pptx)$/i, ''),
            type: f.name.toLowerCase().endsWith('.pptx') ? 'pptx' : 'pdf',
          });
        }
      }
    }
    if (anyRestored) showToast('Welcome back! Your notes have been restored.');
  }, [addDocument, showToast, documents, isVip, userPlan]);

  // ── Remove document (with confirmation) ──────────────────────────────────
  const [confirmRemoveDocId, setConfirmRemoveDocId] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(() =>
    typeof window !== 'undefined' ? shouldShowTour() : false
  );

  const handleRemoveDocument = useCallback((docId: string) => {
    setConfirmRemoveDocId(docId);
  }, []);

  const executeRemoveDocument = useCallback(async (docId: string) => {
    setConfirmRemoveDocId(null);

    // ── localStorage cleanup ────────────────────────────────────────────────
    const drawings = storageGet<Record<string, string>>(KEYS.DRAWINGS) ?? {};
    storageSet(KEYS.DRAWINGS, Object.fromEntries(Object.entries(drawings).filter(([k]) => !k.startsWith(`${docId}:`))));

    const textNotes = storageGet<Record<string, TextNote[]>>(KEYS.TEXT_NOTES) ?? {};
    storageSet(KEYS.TEXT_NOTES, Object.fromEntries(Object.entries(textNotes).filter(([k]) => !k.startsWith(`${docId}:`))));

    const storedBMs = storageGet<Record<string, Bookmark[]>>(KEYS.BOOKMARKS) ?? {};
    delete storedBMs[docId];
    storageSet(KEYS.BOOKMARKS, storedBMs);

    const docMap = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
    const filename = Object.keys(docMap).find((k) => docMap[k] === docId);
    if (filename) { delete docMap[filename]; storageSet(KEYS.DOC_MAP, docMap); }

    const blankPagesStored = storageGet<Array<{ documentId: string }>>(KEYS.BLANK_PAGES) ?? [];
    storageSet(KEYS.BLANK_PAGES, blankPagesStored.filter((p) => p.documentId !== docId));

    const voiceNotesStored = storageGet<Array<{ documentId: string }>>(KEYS.VOICE_NOTES) ?? [];
    storageSet(KEYS.VOICE_NOTES, voiceNotesStored.filter((n) => n.documentId !== docId));

    const pageImagesStored = storageGet<Record<string, unknown>>(KEYS.PAGE_IMAGES) ?? {};
    delete pageImagesStored[docId];
    storageSet(KEYS.PAGE_IMAGES, pageImagesStored);

    const keyTermsStored = storageGet<Record<string, unknown>>(KEYS.KEY_TERMS) ?? {};
    delete keyTermsStored[docId];
    storageSet(KEYS.KEY_TERMS, keyTermsStored);

    // ── In-memory state cleanup ─────────────────────────────────────────────
    setPageTextNotes((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${docId}:`))));
    setBookmarks((prev) => prev.filter((b) => b.documentId !== docId));
    deleteNotesForDocument(docId);
    removePagesForDocument(docId);
    clearAllDrawings(docId);
    removePageImagesForDocument(docId);

    // Remove from document list — usePDF auto-switches active doc to the next one (or null)
    removeDocument(docId);
    showToast('Document deleted successfully.');

    // ── Supabase cleanup (background; errors are non-fatal since local state is clean) ──
    if (userIdRef.current) {
      try {
        await deleteAllDataForDocument(docId);
      } catch (err) {
        console.error('[Delete] Supabase cleanup failed:', err);
      }
    }
  }, [deleteNotesForDocument, removePagesForDocument, clearAllDrawings, removePageImagesForDocument, removeDocument, showToast]);

  // ── Derived booleans ──────────────────────────────────────────────────────
  const isBlankPage  = currentVP?.type === 'blank';
  const isPPTX       = activeDocument?.type === 'pptx';
  const hasDocument  = !!activeDocument;
  hasDocumentRef.current = hasDocument;
  isPPTXRef.current      = !!isPPTX;

  // ── Study room modal ──────────────────────────────────────────────────────
  const [roomModal, setRoomModal] = useState<'idle' | 'creating' | 'done'>('idle');
  const [roomUrl, setRoomUrl]     = useState('');

  const handleCreateRoom = useCallback(async () => {
    if (!activeDocument || activeDocument.type !== 'pdf') return;
    const limits = effectivePlanLimits(userPlan, isVip);
    if (!limits.canCreateRooms) { setLimitModal('room'); return; }
    setRoomModal('creating');
    try {
      const resp = await fetch(activeDocument.url);
      const blob = await resp.blob();
      const roomId = crypto.randomUUID();
      const pdfPath = await uploadRoomPdf(roomId, blob, activeDocument.name);
      if (!pdfPath) throw new Error('upload failed');
      const created = await createRoom(roomId, activeDocument.name, pdfPath, limits.maxRoomMembers);
      if (!created) throw new Error('createRoom failed');
      setRoomUrl(`${window.location.origin}/room/${roomId}`);
      setRoomModal('done');
    } catch (e) {
      console.error('[Room] create error:', e);
      setRoomModal('idle');
    }
  }, [activeDocument, isVip, userPlan]);

  // ── Page image annotation handlers ───────────────────────────────────────
  const handleSavePageImages = useCallback((images: import('@/types').PDFPageImage[]) => {
    if (!activeDocument || currentVP?.type !== 'pdf') return;
    setPageImages(activeDocument.id, currentVP.pdfPage, images);
  }, [activeDocument, currentVP, setPageImages]);

  const handleDeletePageImage = useCallback((pageNumber: number, imageId: string) => {
    if (!activeDocument) return;
    deletePageImage(activeDocument.id, pageNumber, imageId);
  }, [activeDocument, deletePageImage]);

  // ── Add image to current PDF page ────────────────────────────────────────
  const handleAddImageToPage = useCallback((dataUrl: string) => {
    pdfDrawingRef.current?.insertImage?.(dataUrl);
  }, []);

  // ── Add image as a new blank page ─────────────────────────────────────────
  const handleAddImageAsNewPage = useCallback((dataUrl: string) => {
    if (!activeDocument) return;
    const afterPage = currentVP?.type === 'pdf'
      ? currentVP.pdfPage
      : currentVP?.type === 'blank'
        ? currentVP.blankPage.insertAfterPage
        : activeDocument.currentPage;

    const W = 816, H = 1056;
    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d')!;
    ctx.fillStyle = defaultBgTheme === 'dark' ? '#1e1e2e' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const img = new Image();
    img.onload = () => {
      const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight, 1);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      const newPage = insertBlankPage(activeDocument.id, afterPage, defaultBgTheme);
      updateCanvasData(newPage.id, offscreen.toDataURL('image/png'));
      setVirtualIndex((i) => i + 1);
    };
    img.src = dataUrl;
  }, [activeDocument, currentVP, insertBlankPage, updateCanvasData, defaultBgTheme]);

  // ── Clear all drawings for current document ───────────────────────────────
  const handleClearAllDrawings = useCallback(() => {
    if (!activeDocument) return;
    clearAllDrawings(activeDocument.id);
    pdfDrawingRef.current?.clear();
    showToast('All drawings cleared.');
  }, [activeDocument, clearAllDrawings, showToast]);

  // ── Insert image (blank page canvas) ─────────────────────────────────────
  const handleInsertImage = useCallback((dataUrl: string) => {
    blankDrawingRef.current?.insertImage?.(dataUrl);
  }, []);

  // ── Active-side tool props (routed to the correct side state) ─────────────
  const atTool          = showSplit && activeSide === 'right' ? rightTool          : leftTool;
  const atPenType       = showSplit && activeSide === 'right' ? rightPenType       : leftPenType;
  const atColor         = showSplit && activeSide === 'right' ? rightColor         : leftColor;
  const atStrokeSize    = showSplit && activeSide === 'right' ? rightStrokeSize    : leftStrokeSize;
  const atSetTool       = showSplit && activeSide === 'right' ? setRightTool       : setLeftTool;
  const atSetPenType    = showSplit && activeSide === 'right' ? setRightPenType    : setLeftPenType;
  const atSetColor      = showSplit && activeSide === 'right' ? setRightColor      : setLeftColor;
  const atSetStrokeSize = showSplit && activeSide === 'right' ? setRightStrokeSize : setLeftStrokeSize;

  // Keep keyboard-handler refs in sync
  showSplitRef.current     = showSplit;
  activeSideRef.current    = activeSide;
  rightSideModeRef.current = rightSideMode;
  currentVPRef.current     = currentVP;
  leftZoomRef.current      = leftZoom;
  rightZoomRef.current     = rightZoom;

  // ── Text notes helpers ────────────────────────────────────────────────────
  // leftNotesKey, rightBlankNotesKey, rightDocNotesKey, handleLeftNotesChange,
  // handleRightBlankNotesChange, handleRightDocNotesChange are now sourced
  // from useSinglePageMode (step 3, declared above near useUndoClear).
  // handleDeleteTextNote stays here — it's used by NotesTabContent.

  const handleDeleteTextNote = useCallback((pageKey: string, noteId: string) => {
    setPageTextNotes((prev) => ({
      ...prev,
      [pageKey]: (prev[pageKey] ?? []).filter((n) => n.id !== noteId),
    }));
  }, []);

  // handleRightBlankNotesChange / handleRightDocNotesChange now come from
  // useSinglePageMode (step 3, declared above near useUndoClear).

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-app)', color: 'var(--text-1)' }}
    >

      {/* ══ Header ══ */}
      {/* overflow:visible (non-fullscreen) lets dropdowns escape downward —
          previously overflow:hidden was clipping NotificationBell /
          SettingsDropdown / AvatarDropdown the moment they extended past
          the 56px header. z-index 700 lifts the header above sibling fixed
          floats (BottomPillBar z 30, PageNavigation z 100,
          PomodoroWidget z 600) while staying below modals (z 800/1000). */}
      <header style={{
        height: isFullscreen ? 0 : 56, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isFullscreen ? '0' : '0 12px 0 8px',
        background: 'var(--bg-app)',
        borderBottom: isFullscreen ? 'none' : '1px solid var(--border-subtle)',
        position: 'relative', zIndex: 700,
        gap: 8,
        overflow: isFullscreen ? 'hidden' : 'visible',
        transition: 'height 0.3s ease, padding 0.3s ease',
      }}>

        {/* Left: sidebar toggle + breadcrumb. Brand + nav links moved to
            the shared LeftRail in (app)/layout.tsx. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <HdrBtn
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            active={sidebarOpen}
          >
            <PanelLeft size={18} />
          </HdrBtn>

          <nav
            aria-label="Breadcrumb"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: 'var(--text-2)',
              marginLeft: 6, minWidth: 0,
            }}
          >
            <span>Workspace</span>
            {activeDocument && (
              <>
                <span style={{ color: 'var(--text-3)' }}>›</span>
                <span
                  key={activeDocument.id}
                  className="animate-fade-in"
                  style={{
                    color: 'var(--text-1)', fontWeight: 500,
                    maxWidth: 220, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {activeDocument.name}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Centered global search — Figma centerpiece. Clickable button
            styled as an input; click opens the existing GlobalSearch modal
            (also Ctrl/Cmd+K). The per-document Find-in-PDF search lives
            in the DocTabsBar tools row, not the header. */}
        <button
          onClick={() => setGlobalSearchOpen(true)}
          aria-label="Search everything (Ctrl+K)"
          title="Search everything (Ctrl+K)"
          style={{
            flex: 1, maxWidth: 560, minWidth: 240,
            display: 'flex', alignItems: 'center', gap: 10,
            height: 36, padding: '0 14px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 9999,
            color: 'var(--text-3)',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.13s, border-color 0.13s, color 0.13s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-hover)', borderColor: 'var(--border-strong)', color: 'var(--text-2)',
          })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-3)',
          })}
        >
          <Search size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left', fontSize: 13 }}>
            Search anything…
          </span>
          <kbd
            className="hidden md:inline-flex"
            style={{
              alignItems: 'center', gap: 2,
              padding: '2px 6px',
              fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em',
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--text-3)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Right: notifications · collaborators · avatar (+ Upgrade for free) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {userPlan === 'free' && !isVip && (
            <a
              href="/pricing"
              style={{
                fontSize: 12, fontWeight: 600, color: '#fff',
                background: 'var(--accent)', border: 'none', borderRadius: 999,
                padding: '6px 14px', textDecoration: 'none', cursor: 'pointer',
                transition: 'background 0.15s', flexShrink: 0,
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = 'var(--accent)'; }}
            >
              Upgrade
            </a>
          )}

          <NotificationBell />

          {/* Collaborators / members — links to /friends per the Figma
              right-cluster intent. Future: open a per-room members panel. */}
          <a
            href="/friends"
            title="Collaborators"
            aria-label="Collaborators"
            style={{
              width: 34, height: 34, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)', textDecoration: 'none',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'transparent',     color: 'var(--text-2)' })}
          >
            <Users size={16} />
          </a>

          <AvatarDropdown email={userEmail} displayName={userDisplayName} avatarUrl={userAvatarUrl} isVip={isVip} />
        </div>
      </header>

      {/* Shortcuts modal */}
      {shortcutsOpen && <HelpModal onClose={() => setShortcutsOpen(false)} />}

      {/* Share to Community modal */}
      {shareOpen && (
        <ShareToCommunityModal
          docId={activeDocumentId}
          docName={activeDocument?.name ?? null}
          pageTextNotes={pageTextNotes}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Pomodoro widget */}
      {pomodoroOpen && <PomodoroWidget onClose={() => setPomodoroOpen(false)} />}

      {/* Global search */}
      {globalSearchOpen && (
        <GlobalSearch
          onClose={() => setGlobalSearchOpen(false)}
          onNavigate={handleGlobalSearchNavigate}
        />
      )}

      {documents.length === 0 ? (

        /* ══ Empty state ══ */
        <div
          className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in"
          style={{ background: 'var(--bg-app)' }}
        >
          <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 4, margin: '0 auto 20px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={24} style={{ color: 'var(--text-2)' }} />
            </div>
            <h1 style={{
              fontSize: 18, fontWeight: 600, color: 'var(--text-1)',
              letterSpacing: '-0.02em', marginBottom: 8,
            }}>
              No documents yet
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 28 }}>
              Upload a PDF or PowerPoint file to get started.<br />
              Annotate, record voice notes, and add blank pages.
            </p>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div className="spinner" style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid var(--border-strong)',
                  borderTopColor: 'var(--text-2)',
                }} />
              </div>
            ) : (
              <PDFUploader onFilesAdded={handleFilesAdded} />
            )}
          </div>
        </div>

      ) : (

        /* ══ Main workspace ══ */
        <div className="flex flex-1 overflow-hidden animate-fade-in">

          {/* ── Left sidebar (thumbnails) ── */}
          <div
            style={{
              width: isFullscreen ? 0 : sidebarOpen ? sidebarWidth : 0,
              overflow: 'hidden',
              transition: isDraggingLeft ? 'none' : 'width 0.3s ease',
              flexShrink: 0,
            }}
          >
            <SidebarThumbnails
              isOpen={sidebarOpen}
              documents={documents}
              activeDocumentId={activeDocumentId}
              activeDocument={activeDocument}
              virtualPages={virtualSequence}
              currentVirtualIndex={virtualIndex}
              onSelectDocument={setActiveDocument}
              onRemoveDocument={handleRemoveDocument}
              onNavigate={setVirtualIndex}
              bookmarks={bookmarks}
              onRemoveBookmark={handleRemoveBookmark}
              onNavigateToPdfPage={handleNavigateToPdfPage}
              isPPTX={isPPTX}
              onReorderDocuments={handleReorderDocuments}
              onDeleteBlankPage={handleDeleteBlankPage}
            />
          </div>

          {/* ── Left resize handle ── */}
          {sidebarOpen && !isFullscreen && (
            <div
              onMouseDown={startLeftDrag}
              style={{
                width: 4,
                flexShrink: 0,
                cursor: 'col-resize',
                background: isDraggingLeft ? 'var(--accent)' : 'transparent',
                transition: 'background 0.15s',
                zIndex: 20,
              }}
              onMouseOver={(e) => { if (!isDraggingLeft) e.currentTarget.style.background = 'var(--border-strong)'; }}
              onMouseOut={(e)  => { if (!isDraggingLeft) e.currentTarget.style.background = 'transparent'; }}
            />
          )}

          {/* ── Main column ── */}
          <main
            ref={mainRef}
            className="flex-1 flex flex-col overflow-hidden"
            style={{ position: 'relative', minWidth: 0 }}
          >
            {!isFullscreen && (
            <DocTabsBar
              documents={documents}
              activeDocumentId={activeDocumentId}
              onSelect={setActiveDocument}
              onRemove={handleRemoveDocument}
              onReorder={handleReorderDocuments}
              rightSlot={
                /* Per-document tool strip — relocated from the top header.
                   Renders inside the DocTabsBar row so the only top chrome
                   is the slim 56px header (breadcrumb + search + identity
                   cluster). All handlers + popovers preserved verbatim. */
                <>
                  <PDFUploader onFilesAdded={handleFilesAdded} compact />

                  {!isPPTX && (
                    <HdrBtn
                      onClick={() => setSearchOpen((o) => !o)}
                      title={searchOpen ? t('ws_close_search') : t('ws_open_search')}
                      active={searchOpen}
                    >
                      <Search size={17} />
                    </HdrBtn>
                  )}

                  <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

                  <HdrBtn onClick={() => setPomodoroOpen((o) => !o)} title={t('ws_pomodoro_title')} active={pomodoroOpen}>
                    <Timer size={17} />
                  </HdrBtn>

                  {hasDocument && (
                    <div ref={exportMenuRef} style={{ position: 'relative' }}>
                      <HdrBtn onClick={() => setExportMenuOpen((o) => !o)} title={t('ws_export_notes_title')} active={exportMenuOpen}>
                        <Download size={17} />
                      </HdrBtn>
                      {exportMenuOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, marginTop: 4,
                          background: 'var(--bg-float)', border: '1px solid var(--bg-float-border)',
                          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                          borderRadius: 6, padding: '4px 0', minWidth: 160,
                          boxShadow: 'var(--shadow-float)', zIndex: 200,
                        }}>
                          {[
                            { label: 'Export as PDF', ext: 'pdf' },
                            { label: 'Export as Word (.docx)', ext: 'docx' },
                          ].map(({ label, ext }) => (
                            <button
                              key={ext}
                              onClick={async () => {
                                setExportMenuOpen(false);
                                if (!activeDocument) return;
                                const { exportAsPDF, exportAsDocx } = await import('@/lib/exportNotes');
                                const data = { docName: activeDocument.name, pageTextNotes, bookmarks, docId: activeDocument.id };
                                if (ext === 'pdf') exportAsPDF(data);
                                else exportAsDocx(data);
                              }}
                              style={{
                                display: 'flex', width: '100%', padding: '8px 14px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 12.5, color: 'var(--text-1)', fontFamily: 'inherit', textAlign: 'left',
                                transition: 'background 0.1s',
                              }}
                              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                              onMouseOut={(e)  => { e.currentTarget.style.background = 'none'; }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <SettingsDropdown
                    isDark={isDark}
                    onThemeChange={toggleTheme}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    defaultBgTheme={defaultBgTheme}
                    onDefaultBgThemeChange={handleDefaultBgThemeChange}
                    onZoomReset={() => handleLeftZoomChange(1.0)}
                    hasDocument={hasDocument}
                    isPPTX={isPPTX}
                  />

                  {hasDocument && (
                    <HdrBtn onClick={() => setShareOpen(true)} title={t('ws_share')}>
                      <Share2 size={15} />
                    </HdrBtn>
                  )}

                  <HdrBtn onClick={() => setShortcutsOpen(o => !o)} title={t('ws_shortcuts')}>
                    <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>?</span>
                  </HdrBtn>

                  <HdrBtn
                    onClick={() => setRightPanelOpen((open) => !open)}
                    title={rightPanelOpen ? t('ws_collapse_tools') : t('ws_expand_tools')}
                    tone="danger"
                  >
                    <PanelRight size={18} />
                  </HdrBtn>
                </>
              }
            />
            )}
            {activeDocument && (
              <>
                {/* PDF top toolbar — Figma centerpiece for the doc area.
                    Owns cursor/select, zoom group, fullscreen and split.
                    In fullscreen, `compact` collapses the bar to just
                    the zoom pill (transparent surface, no border, no
                    cursor/fullscreen/split pills) so zoom stays
                    reachable without intruding on the immersive view. */}
                <PdfTopToolbar
                  toolIsCursor={atTool === 'cursor'}
                  onSelectCursor={() => atSetTool('cursor')}
                  zoom={leftZoom}
                  onZoomIn={() => handleLeftZoomChange(leftZoom + 0.1)}
                  onZoomOut={() => handleLeftZoomChange(leftZoom - 0.1)}
                  onZoomReset={() => handleLeftZoomChange(1.0)}
                  canZoomIn={leftZoom < 2}
                  canZoomOut={leftZoom > 0.5}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                  splitMode={splitMode}
                  onToggleSplit={!isPPTX ? () => setSplitMode((m) => !m) : undefined}
                  compact={isFullscreen}
                />

                {/* ── Content area ── */}
                <div style={{
                  flex: 1, overflow: 'hidden',
                  display: 'flex',
                }}>

                  {/* Left pane */}
                  <div
                    style={{
                      flex: 1, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      borderRight: showSplit ? '1px solid var(--border)' : 'none',
                      minWidth: 0, position: 'relative',
                    }}
                    onPointerDown={() => setActiveSide('left')}
                  >
                    {/* Page-change flash: keyed on virtualIndex so it re-mounts on
                        every navigation and replays the CSS animation. The overlay
                        sits on top of the PDF but is pointer-events:none and fades
                        to fully transparent within 0.2 s. */}
                    <div
                      key={`flash-${activeDocumentId}-${virtualIndex}`}
                      style={{
                        position: 'absolute', inset: 0, zIndex: 6,
                        pointerEvents: 'none',
                        background: 'var(--bg-app)',
                        opacity: 0,
                        animation: 'page-flash 0.22s ease-out both',
                      }}
                    />
                    {/* Scroll mode — all pages at once (PDF only) */}
                    {!showSplit && viewMode === 'scroll' && !isPPTX ? (
                      <PDFScrollViewer
                        document={activeDocument}
                        virtualPages={virtualSequence}
                        currentVirtualIndex={virtualIndex}
                        onPageChange={setVirtualIndex}
                        zoom={leftZoom}
                        onZoomChange={handleLeftZoomChange}
                        getNotesForPage={getNotesForPage}
                        isRecording={isRecording}
                        recordingContext={recordingContext}
                        onRecordStart={startRecording}
                        onRecordStop={stopRecording}
                        tool={leftTool}
                        penType={leftPenType}
                        color={leftColor}
                        strokeSize={leftStrokeSize}
                        annotationActive={leftTool !== 'cursor'}
                        getDrawing={getDrawing}
                        saveDrawing={savePdfDrawingScroll}
                        getBlankDrawing={getBlankDrawingScroll}
                        saveBlankDrawing={saveBlankDrawingScroll}
                        getBlankNotes={getBlankNotesScroll}
                        saveBlankNotes={saveBlankNotesScroll}
                        onActivateTextTool={activateTextToolScroll}
                        onExitTextTool={exitTextToolScroll}
                        getPdfNotes={getPdfNotesScroll}
                        savePdfNotes={savePdfNotesScroll}
                      />
                    ) : !showSplit && isBlankPage ? (
                      <BlankPageCanvas
                        ref={blankDrawingRef}
                        blankPage={currentVP!.blankPage}
                        onSaveData={updateCanvasData}
                        onSaveImages={updateImages}
                        tool={leftTool}
                        penType={leftPenType}
                        color={leftColor}
                        strokeSize={leftStrokeSize}
                        zoom={leftZoom}
                        onZoomChange={handleLeftZoomChange}
                        notes={pageTextNotes[leftNotesKey] ?? []}
                        onNotesChange={handleLeftNotesChange}
                        onActivateTextTool={() => setLeftTool('text')}
                        onExitTextTool={() => setLeftTool('pen')}
                        currentBgTheme={(currentVP!.blankPage.bgTheme ?? 'white')}
                        onChangeBgTheme={(theme) => updateBgTheme(currentVP!.blankPage.id, theme)}
                      />
                    ) : isPPTX ? (
                      <PPTXViewer document={activeDocument} />
                    ) : (
                      <PDFWithDrawing
                        ref={pdfDrawingRef}
                        document={activeDocument}
                        tool={leftTool}
                        penType={leftPenType}
                        color={leftColor}
                        strokeSize={leftStrokeSize}
                        savedData={currentDrawing}
                        onSave={handleSaveDrawing}
                        zoom={leftZoom}
                        onZoomChange={handleLeftZoomChange}
                        interactive={!showSplit || activeSide === 'left'}
                        notes={pageTextNotes[leftNotesKey] ?? []}
                        onNotesChange={handleLeftNotesChange}
                        onActivateTextTool={() => setLeftTool('text')}
                        onExitTextTool={() => setLeftTool('pen')}
                        searchOpen={searchOpen}
                        onSearchClose={() => setSearchOpen(false)}
                        pageImages={currentVP?.type === 'pdf' ? getPageImages(activeDocument.id, currentVP.pdfPage) : []}
                        onSavePageImages={handleSavePageImages}
                      />
                    )}
                  </div>

                  {/* Right pane (split mode) */}
                  {showSplit && (
                    <div
                      style={{
                        flex: 1, overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                        minWidth: 0,
                      }}
                      onPointerDown={() => setActiveSide('right')}
                    >
                      <RightPaneHeader
                        rightSideMode={rightSideMode}
                        setRightSideMode={setRightSideMode}
                        documents={documents}
                        rightDocId={rightDocId}
                        setRightDocId={setRightDocId}
                        rightDoc={rightDoc}
                        rightDocPage={rightDocPage}
                        setRightDocPage={setRightDocPage}
                        rightZoom={rightZoom}
                        onRightZoomChange={handleRightZoomChange}
                      />

                      {/* Right pane content */}
                      {rightSideMode === 'blank' ? (
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {/* Close split-view button */}
                          <button
                            onClick={() => {
                              // If the virtual index is currently on a blank page,
                              // navigate to its associated PDF page before exiting
                              // split mode — otherwise the left pane would render
                              // BlankPageCanvas instead of the document.
                              if (currentVP?.type === 'blank') {
                                const afterPage = currentVP.blankPage.insertAfterPage;
                                const pdfIdx = afterPage > 0
                                  ? virtualSequence.findIndex((vp) => vp.type === 'pdf' && vp.pdfPage === afterPage)
                                  : virtualSequence.findIndex((vp) => vp.type === 'pdf');
                                if (pdfIdx >= 0) setVirtualIndex(pdfIdx);
                              }
                              setSplitMode(false);
                            }}
                            title="Close split view"
                            aria-label="Close split view"
                            style={{
                              position: 'absolute', top: 10, right: 10, zIndex: 10,
                              width: 28, height: 28,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 4,
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-2)',
                              cursor: 'pointer',
                                                            transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                            }}
                            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                              background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'rgba(229,72,77,.25)',
                            })}
                            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                              background: 'var(--bg-elevated)', color: 'var(--text-2)', borderColor: 'var(--border)',
                            })}
                          >
                            <X size={14} />
                          </button>
                          {splitRightBlankPage ? (
                            <BlankPageCanvas
                              ref={blankDrawingRef}
                              blankPage={splitRightBlankPage}
                              onSaveData={updateCanvasData}
                              onSaveImages={updateImages}
                              tool={rightTool}
                              penType={rightPenType}
                              color={rightColor}
                              strokeSize={rightStrokeSize}
                              zoom={rightZoom}
                              onZoomChange={handleRightZoomChange}
                              notes={pageTextNotes[rightBlankNotesKey] ?? []}
                              onNotesChange={handleRightBlankNotesChange}
                              onActivateTextTool={() => setRightTool('text')}
                              onExitTextTool={() => setRightTool('pen')}
                              currentBgTheme={(splitRightBlankPage.bgTheme ?? 'white')}
                              onChangeBgTheme={(theme) => updateBgTheme(splitRightBlankPage.id, theme)}
                            />
                          ) : (
                            <BlankPaneEmpty onAdd={() => handleInsertSplitBlankPage()} />
                          )}
                        </div>
                      ) : rightDocForViewer ? (
                        <PDFWithDrawing
                          ref={rightDocDrawingRef}
                          document={rightDocForViewer}
                          tool={rightTool}
                          penType={rightPenType}
                          color={rightColor}
                          strokeSize={rightStrokeSize}
                          savedData={rightDocDrawing}
                          onSave={handleSaveRightDocDrawing}
                          zoom={rightZoom}
                          onZoomChange={handleRightZoomChange}
                          interactive={rightTool !== 'cursor' && activeSide === 'right'}
                          notes={pageTextNotes[rightDocNotesKey] ?? []}
                          onNotesChange={handleRightDocNotesChange}
                          onActivateTextTool={() => setRightTool('text')}
                          onExitTextTool={() => setRightTool('pen')}
                        />
                      ) : (
                        <DocPickEmpty />
                      )}
                    </div>
                  )}
                </div>

                {/* ── Bottom panels (collapsible) ── */}
                <div style={{
                  flexShrink: 0, overflow: 'hidden',
                  maxHeight: isFullscreen ? 0 : navBarVisible ? 800 : 0,
                  transition: (isFullscreen || !navBarVisible)
                    ? 'max-height 0.22s cubic-bezier(0.4,0,1,1)'
                    : 'max-height 0.3s cubic-bezier(0,0,0.2,1)',
                }}>

                  <PageNavigation
                    currentPage={virtualIndex + 1}
                    pageCount={virtualSequence.length}
                    isBlankPage={isBlankPage}
                    onPrev={goVirtualPrev}
                    onNext={goVirtualNext}
                    onGoToPage={goVirtualToPage}
                  />
                </div>

                {/* Bottom pill bar — stays visible in fullscreen so the
                    user can still annotate. Only the hide-bar chevron
                    (navBarVisible) gates its visibility now. */}
                <BottomPillBar
                  hasDocument={hasDocument}
                  visible={navBarVisible}
                  isBlankPage={isBlankPage}
                  isPPTX={isPPTX}
                  tool={atTool}
                  setTool={atSetTool}
                  penType={atPenType}
                  setPenType={atSetPenType}
                  color={atColor}
                  setColor={atSetColor}
                  strokeSize={atStrokeSize}
                  setStrokeSize={atSetStrokeSize}
                  onActivateNotes={() => { setRightPanelOpen(true); setRightPanelTab('notes'); }}
                  onInsertImageBlank={isBlankPage ? handleInsertImage : undefined}
                  onAddImageToPage={hasDocument && !isPPTX && !isBlankPage ? handleAddImageToPage : undefined}
                  onAddImageAsNewPage={hasDocument && !isPPTX ? handleAddImageAsNewPage : undefined}
                  onInsertBlankPage={hasDocument ? handleInsertBlankPage : undefined}
                  docPageImages={activeDocument ? allPageImages[activeDocument.id] : undefined}
                  currentPdfPageForImages={currentPdfPage}
                  onDeletePageImage={hasDocument && !isPPTX ? handleDeletePageImage : undefined}
                  onToggleBookmark={hasDocument ? handleToggleBookmark : undefined}
                  isBookmarked={isCurrentPageBookmarked}
                  onVoiceNote={activeDocument ? () => {
                    // Toggle — both the pill and the Notes-tab Record button
                    // share this handler shape. Without toggling, starting from
                    // the pill would leave the user with no stop control (the
                    // old VoiceNotesSheet recorder is now hidden in workspace).
                    if (isRecording) { stopRecording(); return; }
                    startRecording(activeDocument.id, pageIdentifier);
                    setVoiceSheetOpen(true);
                  } : undefined}
                  isRecording={isRecording}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onClearAllDrawings={hasDocument && !isPPTX ? handleClearAllDrawings : undefined}
                  onCreateRoom={hasDocument && activeDocument?.type === 'pdf' ? handleCreateRoom : undefined}
                  splitMode={showSplit}
                  activeSide={showSplit ? activeSide : undefined}
                  onSwitchSide={showSplit ? setActiveSide : undefined}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                />

                {/* Persistent exit-fullscreen button — top-right, labelled
                    + Esc-hinted so users can clearly find their way out.
                    Moved from bottom-right to avoid clashing with the
                    BottomPillBar (now visible in fullscreen too). */}
                {/* Restore bottom bar button */}
                {!navBarVisible && (
                  <button
                    onClick={() => setNavBarVisible(true)}
                    title={t('ws_show_toolbar')}
                    aria-label={t('ws_show_toolbar')}
                    className="animate-scale-in"
                    style={{
                      position: 'absolute', bottom: 14, right: 14, zIndex: 30,
                      width: 34, height: 34, borderRadius: 4,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                      background: 'var(--bg-active)', color: 'var(--text-1)',
                    })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                      background: 'var(--bg-elevated)', color: 'var(--text-2)',
                    })}
                  >
                    <ChevronUp size={15} />
                    {isRecording && (
                      <span className="rec-dot" style={{
                        position: 'absolute', top: 5, right: 5,
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--red)',
                      }} />
                    )}
                  </button>
                )}
              </>
            )}
          </main>

          {/* ── Right resize handle ── */}
          {rightPanelOpen && !isFullscreen && (
            <div
              onMouseDown={startRightDrag}
              style={{
                width: 4,
                flexShrink: 0,
                cursor: 'col-resize',
                background: isDraggingRight ? 'var(--accent)' : 'transparent',
                transition: 'background 0.15s',
                zIndex: 20,
              }}
              onMouseOver={(e) => { if (!isDraggingRight) e.currentTarget.style.background = 'var(--border-strong)'; }}
              onMouseOut={(e)  => { if (!isDraggingRight) e.currentTarget.style.background = 'transparent'; }}
            />
          )}

          {/* ── Right panel (document tools) ── */}
          <div
            style={{
              width: isFullscreen ? 0 : rightPanelOpen ? rightPanelWidth : 0,
              overflow: 'hidden',
              transition: isDraggingRight ? 'none' : 'width 0.3s ease',
              flexShrink: 0,
            }}
          >
            <RightPanelTabs
              isOpen={rightPanelOpen}
              activeTab={rightPanelTab}
              onTabChange={setRightPanelTab}
              notes={
                <NotesTabContent
                  activeDocumentId={activeDocumentId}
                  activeDocument={activeDocument}
                  virtualPages={virtualSequence}
                  allTextNotes={pageTextNotes}
                  voiceNotes={voiceNotes}
                  onNavigate={setVirtualIndex}
                  onDeleteTextNote={handleDeleteTextNote}
                  onDeleteVoiceNote={deleteNote}
                  onAddNote={hasDocument ? () => atSetTool('text') : undefined}
                  onAddDrawing={hasDocument ? () => { atSetTool('pen'); atSetPenType('normal'); } : undefined}
                  onAddBookmark={hasDocument ? handleToggleBookmark : undefined}
                  isBookmarked={isCurrentPageBookmarked}
                  onAddFlashcard={() => { setRightPanelOpen(true); setRightPanelTab('ai'); }}
                  onRecordVoiceNote={activeDocument ? () => {
                    // Same toggle as the Mic pill — the Notes-tab button's
                    // label already swaps to "Stop Recording" when isRecording,
                    // so clicking it must actually stop.
                    if (isRecording) { stopRecording(); return; }
                    startRecording(activeDocument.id, pageIdentifier);
                    setVoiceSheetOpen(true);
                  } : undefined}
                  isRecording={isRecording}
                />
              }
              aiAssistant={
                <AIAssistantTabContent
                  hasDocument={hasDocument}
                  isBlankPage={isBlankPage}
                  documentUrl={activeDocument?.url}
                  currentPdfPage={currentPdfPage}
                  selectedText={selectedText}
                />
              }
              chat={<ChatTabContent myUserId={userId} />}
            />
          </div>

        </div>
      )}

      {/* ══ Feature limit modals ══ */}
      {limitModal && (() => {
        const next       = nextUpgradePlan(userPlan);
        const nextLabel  = next ? PLAN_LABELS[next] : null;
        // Titles
        const titles: Record<typeof limitModal, string> = {
          documents: `${PLAN_LABELS[userPlan]} plan: document limit reached`,
          room:      'Study Rooms require Premium or Pro',
          voice:     `${PLAN_LABELS[userPlan]} plan: voice storage full (${VOICE_STORAGE_LABELS[userPlan]})`,
        };
        // Body copy
        const bodies: Record<typeof limitModal, string> = {
          documents: `You've reached the ${PLAN_LIMITS[userPlan].documents} document limit on the ${PLAN_LABELS[userPlan]} plan.${next ? ` Upgrade to ${nextLabel} for unlimited documents.` : ''}`,
          room:      `Study Rooms are available on Premium and Pro plans. Free users cannot create or join rooms.`,
          voice:     `You've used all ${VOICE_STORAGE_LABELS[userPlan]} of voice note storage on the ${PLAN_LABELS[userPlan]} plan.${next ? ` Upgrade to ${nextLabel} for ${VOICE_STORAGE_LABELS[next!]} of voice storage.` : ''}`,
        };
        return (
          <div
            onClick={() => setLimitModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1300,
              background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 400,
                background: 'var(--bg-float)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid var(--bg-float-border)',
                boxShadow: 'var(--shadow-float)',
                borderRadius: 8, padding: '28px 28px 24px',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                {PLAN_LABELS[userPlan]} Plan Limit
              </p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                {titles[limitModal]}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                {bodies[limitModal]}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={() => setLimitModal(null)}
                  style={{
                    padding: '7px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500,
                    background: 'var(--bg-elevated)', color: 'var(--text-2)',
                    border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                {nextLabel && (
                  <a
                    href="/pricing"
                    style={{
                      padding: '7px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600,
                      background: '#ffffff', color: '#0f172a',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    Upgrade to {nextLabel}
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Remove document confirmation ══ */}
      {confirmRemoveDocId && (() => {
        const docToRemove = documents.find((d) => d.id === confirmRemoveDocId);
        return (
          <div
            onClick={() => setConfirmRemoveDocId(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1350,
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 380,
                background: 'var(--bg-float)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid var(--bg-float-border)',
                boxShadow: 'var(--shadow-float)',
                borderRadius: 8, padding: '24px 24px 20px',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                Remove &ldquo;{docToRemove?.name ?? 'this document'}&rdquo;?
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                This will permanently delete all notes, drawings, bookmarks, and voice notes for this document. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={() => setConfirmRemoveDocId(null)}
                  style={{
                    padding: '7px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500,
                    background: 'transparent', color: 'var(--text-2)',
                    border: '1px solid var(--border-strong)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => executeRemoveDocument(confirmRemoveDocId)}
                  style={{
                    padding: '7px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600,
                    background: 'var(--red, #ef4444)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Study Room modal ══ */}
      {roomModal !== 'idle' && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => { if (roomModal === 'done') { setRoomModal('idle'); setRoomUrl(''); } }}
        >
          <div
            style={{
              width: '100%', maxWidth: 420,
              background: 'var(--bg-float)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--bg-float-border)',
              boxShadow: 'var(--shadow-float)',
              borderRadius: 4,
              padding: '24px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {roomModal === 'creating' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="spinner" style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                    flexShrink: 0,
                  }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                      Creating study room…
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                      Uploading PDF and setting up room
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                    Study room ready!
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                    Share the link below to collaborate in real-time.
                  </p>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 4, padding: '8px 12px',
                }}>
                  <span style={{
                    flex: 1, fontSize: 12, color: 'var(--text-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {roomUrl}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(roomUrl); }}
                    style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                      background: 'var(--bg-active)', color: 'var(--text-2)',
                      border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => window.open(roomUrl, '_blank')}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 4, fontSize: 13, fontWeight: 500,
                      background: '#ffffff', color: '#0f172a', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Open room
                  </button>
                  <button
                    onClick={() => { setRoomModal('idle'); setRoomUrl(''); }}
                    style={{
                      padding: '9px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500,
                      background: 'transparent', color: 'var(--text-2)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ Onboarding tour ══ */}
      {showTour && <OnboardingTour onComplete={() => setShowTour(false)} />}

      {/* ══ Toast ══ */}
      {toast && (
        <div
          className="animate-slide-up"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px',
            borderRadius: 4,
            background: 'var(--bg-float)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--bg-float-border)',
            boxShadow: 'var(--shadow-float)',
            color: 'var(--text-1)',
            fontSize: 13, fontWeight: 500,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <CheckCircle size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
          {toast}
        </div>
      )}
    </div>
  );
}
