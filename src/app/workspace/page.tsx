'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  BookOpen, X, LogOut, PanelLeft, PanelRight,
  ChevronUp, FilePlus, Search, CheckCircle,
} from 'lucide-react';
import { clampZoom } from '@/components/PDFViewer';
import { usePDF } from '@/hooks/usePDF';
import { useVoiceNotes } from '@/hooks/useVoiceNotes';
import { useBlankPages } from '@/hooks/useBlankPages';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import PDFUploader from '@/components/PDFUploader';
import PDFWithDrawing from '@/components/PDFWithDrawing';
import PDFScrollViewer from '@/components/PDFScrollViewer';
import PPTXViewer from '@/components/PPTXViewer';
import BlankPageCanvas from '@/components/BlankPageCanvas';
import SidebarThumbnails from '@/components/SidebarThumbnails';
import DocumentToolsPanel from '@/components/DocumentToolsPanel';
import FloatingAnnotationToolbar from '@/components/FloatingAnnotationToolbar';
import VoiceNotesSheet from '@/components/VoiceNotesSheet';
import PageNavigation from '@/components/PageNavigation';
import SettingsDropdown from '@/components/SettingsDropdown';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import {
  upsertDocument,
  fetchDrawings,
  fetchBlankPages,
  fetchTextNotes,
  fetchBookmarks,
  fetchVoiceNotes,
  saveBookmarks as dbSaveBookmarks,
  saveTextNotes as dbSaveTextNotes,
  saveSessionState as dbSaveSessionState,
  uploadRoomPdf,
  createRoom,
} from '@/lib/supabase/db';
import type { BlankPage, PDFDocument, TextNote, Bookmark } from '@/types';
import type { DrawingCanvasHandle } from '@/components/BlankPageCanvas';
import type { Tool, PenType } from '@/lib/drawing';

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
  onClick, title, active = false, children,
}: {
  onClick?: () => void;
  title?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 42, height: 42,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, flexShrink: 0,
        background: active ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
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
        borderRadius: 5, padding: 2, flexShrink: 0,
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
            {m === 'blank' ? 'Blank' : 'Doc'}
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
        fontVariantNumeric: 'tabular-nums',
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
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, background: 'var(--bg-app)', padding: 32,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FilePlus size={20} style={{ color: 'var(--text-3)' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
          No blank page here
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Add a blank page to take notes<br />alongside this PDF page.
        </p>
      </div>
      <button
        onClick={onAdd}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 16px',
          borderRadius: 7,
          background: 'var(--accent)',
          border: '1px solid transparent',
          color: '#fff',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 500,
          transition: 'background 0.13s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
      >
        <FilePlus size={13} />
        Add Blank Page
      </button>
    </div>
  );
}

function DocPickEmpty() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 8, background: 'var(--bg-app)', padding: 32,
    }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>No document selected</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
        Choose a document from the picker above.
      </p>
    </div>
  );
}

// ── Keyboard shortcuts modal ──────────────────────────────────────────────────

const SHORTCUTS = [
  { key: '← / →',     desc: 'Previous / next page' },
  { key: 'Ctrl + Z',  desc: 'Undo last stroke' },
  { key: 'Ctrl + +',  desc: 'Zoom in' },
  { key: 'Ctrl + −',  desc: 'Zoom out' },
  { key: 'Escape',    desc: 'Close toolbar / deselect' },
  { key: '?',         desc: 'Toggle this cheat sheet' },
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
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
          width: 340,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
          padding: '18px 20px 20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Keyboard shortcuts
          </span>
          <button
            onClick={onClose}
            style={{
              width: 24, height: 24, borderRadius: 5, border: '1px solid transparent',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
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
            <X size={13} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12,
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{desc}</span>
              <kbd style={{
                fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
                color: 'var(--text-2)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 4, padding: '2px 7px',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  // ── Current user (for Supabase sync) ─────────────────────────────────────
  // userId as state so effects that depend on it re-run once the async
  // getUser() resolves. userIdRef mirrors it for use inside callbacks.
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      const uid = user?.id ?? null;
      userIdRef.current = uid;
      setUserId(uid);
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

  // ── Default blank page background ────────────────────────────────────────
  const [defaultBgTheme, setDefaultBgTheme] = useState<'white' | 'dark'>('white');

  useEffect(() => {
    const stored = storageGet<'white' | 'dark'>('studysync_default_bg');
    if (stored === 'white' || stored === 'dark') setDefaultBgTheme(stored);
  }, []);

  const handleDefaultBgThemeChange = useCallback((theme: 'white' | 'dark') => {
    setDefaultBgTheme(theme);
    storageSet('studysync_default_bg', theme);
  }, []);

  // ── Shortcuts modal ───────────────────────────────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
    isLoading, addDocument, removeDocument, updateDocumentId, setActiveDocument, goToPage,
  } = usePDF();
  const {
    notes: voiceNotes,
    isRecording, recordingDuration, recordingContext,
    startRecording, stopRecording, deleteNote, updateNoteTitle, getNotesForPage,
    seedVoiceNotes,
  } = useVoiceNotes();
  const {
    insertBlankPage, removeBlankPage,
    updateCanvasData, updateImages, updateBgTheme, getBlankPagesForDocument,
    seedBlankPages,
  } = useBlankPages();
  const { getDrawing, saveDrawing, seedDrawings } = usePDFDrawings();

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

      const [remoteDrawings, remoteBlankPages, remoteTextNotes, remoteVoiceNotes] = await Promise.all([
        fetchDrawings(canonicalId),
        fetchBlankPages(canonicalId),
        fetchTextNotes(canonicalId),
        fetchVoiceNotes(canonicalId),
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
  const [leftStrokeSize, setLeftStrokeSize] = useState(5);
  const [leftZoom, setLeftZoom]             = useState(1.0);

  // ── Right-side drawing state ──────────────────────────────────────────────
  const [rightTool, setRightTool]             = useState<Tool>('cursor');
  const [rightPenType, setRightPenType]       = useState<PenType>('normal');
  const [rightColor, setRightColor]           = useState('#ededf0');
  const [rightStrokeSize, setRightStrokeSize] = useState(5);
  const [rightZoom, setRightZoom]             = useState(1.0);

  // ── Active side ───────────────────────────────────────────────────────────
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');

  const pdfDrawingRef      = useRef<DrawingCanvasHandle | null>(null);
  const blankDrawingRef    = useRef<DrawingCanvasHandle | null>(null);
  const rightDocDrawingRef = useRef<DrawingCanvasHandle | null>(null);
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

  const [annotationBarOpen, setAnnotationBarOpen] = useState(false);

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
  const [navBarVisible, setNavBarVisible]   = useState(true);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen]         = useState(false);
  const [viewMode, setViewMode]             = useState<'page' | 'scroll'>('page');
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

  // ── Undo handler — targets the correct canvas per context ────────────────
  const handleUndo = useCallback(() => {
    if (showSplit) {
      if (activeSide === 'left') {
        pdfDrawingRef.current?.undo?.();
      } else if (rightSideMode === 'blank') {
        blankDrawingRef.current?.undo?.();
      } else {
        rightDocDrawingRef.current?.undo?.();
      }
    } else if (currentVP?.type === 'blank') {
      blankDrawingRef.current?.undo?.();
    } else {
      pdfDrawingRef.current?.undo?.();
    }
  }, [showSplit, activeSide, rightSideMode, currentVP]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Escape always works
      if (e.key === 'Escape') {
        setAnnotationBarOpen(false);
        setShortcutsOpen(false);
        setSearchOpen(false);
        return;
      }

      if (inInput) return;

      if (e.key === 'ArrowRight') { goVirtualNext(); return; }
      if (e.key === 'ArrowLeft')  { goVirtualPrev(); return; }
      if (e.key === '?') { setShortcutsOpen(o => !o); return; }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          if (!isPPTX && hasDocument) setSearchOpen((o) => !o);
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          handleUndo();
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
  }, [goVirtualNext, goVirtualPrev, handleLeftZoomChange, handleRightZoomChange, handleUndo]);

  // ── Clear handler — targets the correct canvas per context ────────────────
  const handleClear = useCallback(() => {
    if (showSplit) {
      if (activeSide === 'left') {
        pdfDrawingRef.current?.clear();
      } else if (rightSideMode === 'blank') {
        blankDrawingRef.current?.clear();
      } else {
        rightDocDrawingRef.current?.clear();
      }
    } else if (currentVP?.type === 'blank') {
      blankDrawingRef.current?.clear();
    } else {
      pdfDrawingRef.current?.clear();
    }
  }, [showSplit, activeSide, rightSideMode, currentVP]);

  const handleFilesAdded = useCallback(async (files: File[]) => {
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
  }, [addDocument, showToast]);

  // ── Derived booleans ──────────────────────────────────────────────────────
  const isBlankPage  = currentVP?.type === 'blank';
  const isPPTX       = activeDocument?.type === 'pptx';
  const hasDocument  = !!activeDocument;

  // ── Study room modal ──────────────────────────────────────────────────────
  const [roomModal, setRoomModal] = useState<'idle' | 'creating' | 'done'>('idle');
  const [roomUrl, setRoomUrl]     = useState('');

  const handleCreateRoom = useCallback(async () => {
    if (!activeDocument || activeDocument.type !== 'pdf') return;
    setRoomModal('creating');
    try {
      const resp = await fetch(activeDocument.url);
      const blob = await resp.blob();
      const roomId = crypto.randomUUID();
      const pdfPath = await uploadRoomPdf(roomId, blob, activeDocument.name);
      if (!pdfPath) throw new Error('upload failed');
      const created = await createRoom(roomId, activeDocument.name, pdfPath);
      if (!created) throw new Error('createRoom failed');
      setRoomUrl(`${window.location.origin}/room/${roomId}`);
      setRoomModal('done');
    } catch (e) {
      console.error('[Room] create error:', e);
      setRoomModal('idle');
    }
  }, [activeDocument]);

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
  const leftNotesKey = pageKey;
  const rightBlankNotesKey = activeDocument && splitRightBlankPage
    ? `${activeDocument.id}:${splitRightBlankPage.id}` : '';
  const rightDocNotesKey = rightDocId && rightDocPage
    ? `${rightDocId}:${rightDocPage}` : '';

  const handleLeftNotesChange = useCallback((notes: TextNote[]) => {
    if (!leftNotesKey) return;
    setPageTextNotes(prev => ({ ...prev, [leftNotesKey]: notes }));
  }, [leftNotesKey]);

  const handleInsertTextNote = useCallback((note: Omit<TextNote, 'id'>) => {
    if (!leftNotesKey) return;
    const newNote: TextNote = { ...note, id: `note_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    setPageTextNotes(prev => ({ ...prev, [leftNotesKey]: [...(prev[leftNotesKey] ?? []), newNote] }));
  }, [leftNotesKey]);

  const handleDeleteTextNote = useCallback((pageKey: string, noteId: string) => {
    setPageTextNotes((prev) => ({
      ...prev,
      [pageKey]: (prev[pageKey] ?? []).filter((n) => n.id !== noteId),
    }));
  }, []);

  const handleInsertBlankPageWithGrid = useCallback((rows: number, cols: number) => {
    if (!activeDocument) return;
    const afterPage = currentVP?.type === 'pdf'
      ? currentVP.pdfPage
      : currentVP?.type === 'blank'
        ? currentVP.blankPage.insertAfterPage
        : activeDocument.currentPage;
    const newPage = insertBlankPage(activeDocument.id, afterPage, defaultBgTheme);

    // Draw grid on offscreen canvas and pre-load it as canvasData
    const W = 816, H = 1056;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const isDark = defaultBgTheme === 'dark';
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.5;
      const pad = 60, tableW = W - pad * 2, tableH = H - pad * 2;
      const cellW = tableW / cols, cellH = tableH / rows;
      for (let r = 0; r <= rows; r++) {
        const y = pad + r * cellH;
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + tableW, y); ctx.stroke();
      }
      for (let c = 0; c <= cols; c++) {
        const x = pad + c * cellW;
        ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + tableH); ctx.stroke();
      }
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(pad, pad, tableW, cellH);
    }
    updateCanvasData(newPage.id, canvas.toDataURL('image/png'));
    setVirtualIndex((i) => i + 1);
  }, [activeDocument, currentVP, insertBlankPage, updateCanvasData, defaultBgTheme]);

  const handleRightBlankNotesChange = useCallback((notes: TextNote[]) => {
    if (!rightBlankNotesKey) return;
    setPageTextNotes(prev => ({ ...prev, [rightBlankNotesKey]: notes }));
  }, [rightBlankNotesKey]);

  const handleRightDocNotesChange = useCallback((notes: TextNote[]) => {
    if (!rightDocNotesKey) return;
    setPageTextNotes(prev => ({ ...prev, [rightDocNotesKey]: notes }));
  }, [rightDocNotesKey]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-app)', color: 'var(--text-1)' }}
    >

      {/* ══ Header ══ */}
      <header style={{
        height: 56, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px 0 8px',
        background: 'var(--bg-app)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative', zIndex: 20,
        gap: 8,
      }}>

        {/* Left: sidebar toggle + brand + nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <HdrBtn
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            active={sidebarOpen}
          >
            <PanelLeft size={18} />
          </HdrBtn>

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

          {/* Brand */}
          <span style={{
            fontSize: 14, fontWeight: 700,
            color: 'var(--text-1)', letterSpacing: '-0.02em', flexShrink: 0,
          }}>
            StudySync
          </span>

          {/* Nav links — hidden on small screens */}
          <nav style={{
            display: 'flex', gap: 2, marginLeft: 16,
          }} className="hidden md:flex">
            {[
              { label: 'Dashboard', active: false, href: '/dashboard' },
              { label: 'Documents', active: true,  href: '#' },
              { label: 'Library',   active: false, href: '#' },
              { label: 'Community', active: false, href: '#' },
            ].map(({ label, active, href }) => (
              <a
                key={label}
                href={href}
                onClick={(e) => { if (href === '#') e.preventDefault(); }}
                style={{
                  fontSize: 13, fontWeight: 400,
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  textDecoration: 'none',
                  padding: '4px 10px',
                  borderRadius: 6,
                  borderBottom: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  transition: 'color 0.15s',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseOut={(e)  => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Active document name */}
          {activeDocument && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />
              <span
                key={activeDocument.id}
                className="animate-fade-in"
                style={{
                  fontSize: 11.5, color: 'var(--text-3)',
                  maxWidth: 180, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {activeDocument.name}
              </span>
            </>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {documents.length > 0 && (
            <PDFUploader onFilesAdded={handleFilesAdded} compact />
          )}

          {documents.length > 0 && !isPPTX && (
            <HdrBtn
              onClick={() => setSearchOpen((o) => !o)}
              title={searchOpen ? 'Close search' : 'Search in PDF (Ctrl+F)'}
              active={searchOpen}
            >
              <Search size={17} />
            </HdrBtn>
          )}

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

          {documents.length > 0 && !isPPTX && (
            <HdrBtn
              onClick={() => setSplitMode((m) => !m)}
              title={splitMode ? 'Exit split view' : 'Split view: PDF + notes'}
              active={splitMode}
            >
              <SplitIcon />
            </HdrBtn>
          )}

          {documents.length > 0 && (
            <HdrBtn
              onClick={() => setRightPanelOpen((o) => !o)}
              title={rightPanelOpen ? 'Collapse tools' : 'Expand tools'}
              active={rightPanelOpen}
            >
              <PanelRight size={18} />
            </HdrBtn>
          )}

          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

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

          <HdrBtn onClick={() => setShortcutsOpen(o => !o)} title="Keyboard shortcuts (?)">
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>?</span>
          </HdrBtn>

          <button
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            style={{
              height: 42, padding: '0 14px',
              display: 'flex', alignItems: 'center', gap: 7,
              borderRadius: 8, flexShrink: 0,
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
              transition: 'background 0.13s, color 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'rgba(229,72,77,.22)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
            })}
          >
            <LogOut size={17} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* Shortcuts modal */}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {documents.length === 0 ? (

        /* ══ Empty state ══ */
        <div
          className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in"
          style={{ background: 'var(--bg-app)' }}
        >
          <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
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
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid var(--border-strong)',
                  borderTopColor: 'var(--text-2)',
                  animation: 'spin 0.8s linear infinite',
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
              width: sidebarOpen ? sidebarWidth : 0,
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
              onRemoveDocument={removeDocument}
              onNavigate={setVirtualIndex}
              bookmarks={bookmarks}
              onRemoveBookmark={handleRemoveBookmark}
              onNavigateToPdfPage={handleNavigateToPdfPage}
              isPPTX={isPPTX}
              allTextNotes={pageTextNotes}
              voiceNotes={voiceNotes}
              onDeleteTextNote={handleDeleteTextNote}
              onDeleteVoiceNote={deleteNote}
            />
          </div>

          {/* ── Left resize handle ── */}
          {sidebarOpen && (
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
            {activeDocument && (
              <>
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
                        saveDrawing={saveDrawing}
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
                        interactive={atTool !== 'cursor' && (!showSplit || activeSide === 'left')}
                        notes={pageTextNotes[leftNotesKey] ?? []}
                        onNotesChange={handleLeftNotesChange}
                        onActivateTextTool={() => setLeftTool('text')}
                        onExitTextTool={() => setLeftTool('pen')}
                        searchOpen={searchOpen}
                        onSearchClose={() => setSearchOpen(false)}
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
                              borderRadius: 7,
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-2)',
                              cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
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
                  maxHeight: navBarVisible ? 800 : 0,
                  transition: navBarVisible
                    ? 'max-height 0.3s cubic-bezier(0,0,0.2,1)'
                    : 'max-height 0.22s cubic-bezier(0.4,0,1,1)',
                }}>

                  {/* Voice notes panel: hidden in scroll mode (shown per-page there) */}
                  {viewMode !== 'scroll' && (
                    <VoiceNotesSheet
                      isOpen={voiceSheetOpen}
                      onToggle={() => setVoiceSheetOpen((o) => !o)}
                      notes={pageNotes}
                      pageKey={pageKey}
                      documentId={activeDocument.id}
                      pageNumber={pageIdentifier}
                      isRecording={isRecording}
                      recordingDuration={recordingDuration}
                      recordingContext={recordingContext}
                      onStart={() => startRecording(activeDocument.id, pageIdentifier)}
                      onStop={stopRecording}
                      onDelete={deleteNote}
                      onUpdateTitle={updateNoteTitle}
                    />
                  )}

                  <PageNavigation
                    currentPage={virtualIndex + 1}
                    pageCount={virtualSequence.length}
                    isBlankPage={isBlankPage}
                    onPrev={goVirtualPrev}
                    onNext={goVirtualNext}
                    onGoToPage={goVirtualToPage}
                    onInsertBlankPage={handleInsertBlankPage}
                    onToggleDraw={undefined}
                    isDrawing={false}
                    zoom={leftZoom}
                    onZoomChange={handleLeftZoomChange}
                    onZoomIn={() => handleLeftZoomChange(leftZoom + 0.1)}
                    onZoomOut={() => handleLeftZoomChange(leftZoom - 0.1)}
                    onHideBar={() => setNavBarVisible(false)}
                    viewMode={isPPTX ? undefined : viewMode}
                    onViewModeChange={isPPTX || showSplit ? undefined : setViewMode}
                    onToggleBookmark={hasDocument ? handleToggleBookmark : undefined}
                    isBookmarked={isCurrentPageBookmarked}
                  />
                </div>

                {/* Floating annotation toolbar */}
                <FloatingAnnotationToolbar
                  isOpen={annotationBarOpen}
                  onOpen={() => setAnnotationBarOpen(true)}
                  onClose={() => setAnnotationBarOpen(false)}
                  tool={atTool}
                  setTool={atSetTool}
                  penType={atPenType}
                  setPenType={atSetPenType}
                  color={atColor}
                  setColor={atSetColor}
                  strokeSize={atStrokeSize}
                  setStrokeSize={atSetStrokeSize}
                  onClear={handleClear}
                  onUndo={handleUndo}
                  splitMode={showSplit}
                  activeSide={showSplit ? activeSide : undefined}
                  onSwitchSide={showSplit ? setActiveSide : undefined}
                  containerRef={mainRef}
                />

                {/* Restore bottom bar button */}
                {!navBarVisible && (
                  <button
                    onClick={() => setNavBarVisible(true)}
                    title="Show toolbar"
                    aria-label="Show toolbar"
                    className="animate-scale-in"
                    style={{
                      position: 'absolute', bottom: 14, right: 14, zIndex: 30,
                      width: 34, height: 34, borderRadius: 8,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
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
          {rightPanelOpen && (
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
              width: rightPanelOpen ? rightPanelWidth : 0,
              overflow: 'hidden',
              transition: isDraggingRight ? 'none' : 'width 0.3s ease',
              flexShrink: 0,
            }}
          >
            <DocumentToolsPanel
              isOpen={rightPanelOpen}
              hasDocument={hasDocument}
              isBlankPage={isBlankPage}
              onInsertBlankPage={handleInsertBlankPage}
              onInsertImage={isBlankPage ? handleInsertImage : undefined}
              onDeleteBlankPage={
                currentVP?.type === 'blank'
                  ? () => handleDeleteBlankPage(currentVP.blankPage.id)
                  : undefined
              }
              currentBgTheme={currentVP?.type === 'blank' ? (currentVP.blankPage.bgTheme ?? 'white') : undefined}
              onChangeBgTheme={
                currentVP?.type === 'blank'
                  ? (theme) => updateBgTheme(currentVP.blankPage.id, theme)
                  : undefined
              }
              onVoiceNote={activeDocument ? () => { startRecording(activeDocument.id, pageIdentifier); setVoiceSheetOpen(true); } : undefined}
              isRecording={isRecording}
              documentUrl={activeDocument?.url}
              currentPdfPage={currentPdfPage}
              selectedText={selectedText}
              activeDocumentId={activeDocumentId ?? undefined}
              onInsertTextNote={hasDocument ? handleInsertTextNote : undefined}
              onInsertBlankPageWithGrid={hasDocument ? handleInsertBlankPageWithGrid : undefined}
              onCreateRoom={hasDocument && activeDocument?.type === 'pdf' ? handleCreateRoom : undefined}
            />
          </div>

        </div>
      )}

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
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
              padding: '24px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {roomModal === 'creating' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
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
                  borderRadius: 8, padding: '8px 12px',
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
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
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
                      flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                      background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Open room
                  </button>
                  <button
                    onClick={() => { setRoomModal('idle'); setRoomUrl(''); }}
                    style={{
                      padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
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

      {/* ══ Toast ══ */}
      {toast && (
        <div
          className="animate-slide-up"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px',
            borderRadius: 10,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
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
