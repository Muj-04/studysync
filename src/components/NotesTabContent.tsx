'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  StickyNote, Pencil, Bookmark as BookmarkIcon, Layers,
  Plus, Mic, FileText, Trash2, Play, Pause,
} from 'lucide-react';
import type { TextNote, VoiceNote, PDFDocument, BlankPage, NoteCategory } from '@/types';

/**
 * Right-panel Notes tab — Figma-matched layout:
 *
 *   1. 2×2 quick-action grid  (Add Note / Add Drawing / Add Bookmark /
 *      Add Flashcard)
 *   2. "Your Notes" heading + "+" button (same handler as Add Note card)
 *   3. Categorised note cards (IMPORTANT / TO REVIEW / IDEA / uncategorized)
 *   4. "Voice Notes" heading + count pill + full-width record button +
 *      playback list
 *
 * All handlers are passed from the workspace page — this component does
 * no data fetching of its own.
 */

type VirtualPage =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

interface Props {
  activeDocumentId:    string | null;
  activeDocument:      PDFDocument | null;
  virtualPages:        VirtualPage[];
  allTextNotes:        Record<string, TextNote[]>;
  voiceNotes:          VoiceNote[];
  onNavigate:          (virtualIdx: number) => void;
  onDeleteTextNote?:   (pageKey: string, noteId: string) => void;
  onDeleteVoiceNote?:  (id: string) => void;

  // Quick-action wiring (all four cards)
  onAddNote?:          () => void;
  onAddDrawing?:       () => void;
  onAddBookmark?:      () => void;
  isBookmarked?:       boolean;
  onAddFlashcard?:     () => void;

  // Voice-record
  onRecordVoiceNote?:  () => void;
  isRecording?:        boolean;
}

// ── Category presentation ─────────────────────────────────────────────────────

interface CategoryStyle {
  label: string;
  bg:    string;
  text:  string;
}

const CATEGORY_STYLES: Record<NoteCategory, CategoryStyle> = {
  important: { label: 'IMPORTANT', bg: 'var(--note-red-bg)',    text: 'var(--note-red-text)'    },
  review:    { label: 'TO REVIEW', bg: 'var(--note-yellow-bg)', text: 'var(--note-yellow-text)' },
  idea:      { label: 'IDEA',      bg: 'var(--note-blue-bg)',   text: 'var(--note-blue-text)'   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** First-line-as-title heuristic. Returns { title, body } where title is
 *  the first non-empty line (≤ 60 chars) and body is the remainder. */
function splitTitleBody(raw: string): { title: string; body: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { title: '', body: '' };
  const newlineIdx = trimmed.indexOf('\n');
  if (newlineIdx === -1) {
    // Single line — use whole content as title, no body.
    return { title: trimmed.slice(0, 60), body: trimmed.length > 60 ? trimmed.slice(60) : '' };
  }
  const firstLine = trimmed.slice(0, newlineIdx).trim();
  const rest      = trimmed.slice(newlineIdx + 1).trim();
  return { title: firstLine.slice(0, 60), body: rest };
}

// ── Note-entry types ──────────────────────────────────────────────────────────

interface TextEntry {
  kind: 'text';
  id: string;
  pageKey: string;
  pageLabel: string;
  virtualIdx: number;
  title: string;
  body: string;
  category?: NoteCategory;
}

interface VoiceEntry {
  kind: 'voice';
  id: string;
  pageLabel: string;
  virtualIdx: number;
  preview: string;
  timestamp: Date;
  duration: number;
  audioUrl: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotesTabContent({
  activeDocumentId, activeDocument, virtualPages,
  allTextNotes, voiceNotes,
  onNavigate, onDeleteTextNote, onDeleteVoiceNote,
  onAddNote, onAddDrawing, onAddBookmark, isBookmarked = false,
  onAddFlashcard,
  onRecordVoiceNote, isRecording = false,
}: Props) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voicePlayState, setVoicePlayState] = useState<'playing' | 'paused'>('playing');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const destroyAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    setPlayingVoiceId(null);
    setVoicePlayState('playing');
  }, []);

  useEffect(() => () => destroyAudio(), [destroyAudio]);
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
  }, [activeDocumentId]);

  // Merge text + voice notes for the active document.
  const { textEntries, voiceEntries } = useMemo(() => {
    const text:  TextEntry[]  = [];
    const voice: VoiceEntry[] = [];
    if (!activeDocumentId) return { textEntries: text, voiceEntries: voice };

    const prefix = `${activeDocumentId}:`;

    Object.entries(allTextNotes).forEach(([key, notes]) => {
      if (!key.startsWith(prefix)) return;
      const pageId = key.slice(prefix.length);
      const pdfPage = parseInt(pageId, 10);
      const isBlank = isNaN(pdfPage);
      const virtualIdx = isBlank
        ? virtualPages.findIndex((vp) => vp.type === 'blank' && vp.blankPage.id === pageId)
        : virtualPages.findIndex((vp) => vp.type === 'pdf' && vp.pdfPage === pdfPage);
      if (virtualIdx < 0) return;
      const pageLabel = isBlank ? 'Blank' : `Page ${pdfPage}`;
      notes.forEach((note) => {
        if (!note.content.trim()) return;
        const { title, body } = splitTitleBody(note.content);
        text.push({
          kind: 'text',
          id: note.id, pageKey: key,
          pageLabel, virtualIdx,
          title: title || '(untitled)',
          body,
          category: note.category,
        });
      });
    });

    voiceNotes.filter((n) => n.documentId === activeDocumentId).forEach((n) => {
      const pn = n.pageNumber;
      const isBlank = typeof pn === 'string';
      const virtualIdx = isBlank
        ? virtualPages.findIndex((vp) => vp.type === 'blank' && vp.blankPage.id === (pn as string))
        : virtualPages.findIndex((vp) => vp.type === 'pdf' && vp.pdfPage === (pn as number));
      if (virtualIdx < 0) return;
      const pageLabel = isBlank ? 'Blank' : `Page ${pn}`;
      voice.push({
        kind: 'voice',
        id: n.id, pageLabel, virtualIdx,
        preview: n.title ?? `Voice note · ${formatDuration(n.duration)}`,
        timestamp: n.timestamp,
        duration: n.duration,
        audioUrl: n.audioUrl,
      });
    });

    text .sort((a, b) => a.virtualIdx - b.virtualIdx);
    voice.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return { textEntries: text, voiceEntries: voice };
  }, [activeDocumentId, allTextNotes, voiceNotes, virtualPages]);

  const handleToggleVoicePlayback = useCallback((entry: VoiceEntry) => {
    if (!entry.audioUrl) return;
    if (playingVoiceId === entry.id && audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => destroyAudio());
        setVoicePlayState('playing');
      } else {
        audioRef.current.pause();
        setVoicePlayState('paused');
      }
      return;
    }

    destroyAudio();
    const audio = new Audio(entry.audioUrl);
    audioRef.current = audio;
    audio.onended = () => {
      audioRef.current = null;
      setPlayingVoiceId(null);
      setVoicePlayState('playing');
    };
    audio.onerror = () => destroyAudio();
    setPlayingVoiceId(entry.id);
    setVoicePlayState('playing');
    audio.play().catch(() => destroyAudio());
  }, [playingVoiceId, destroyAudio]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      padding: '14px 14px 24px',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* 1. Quick-action grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
      }}>
        <QuickAction
          icon={<StickyNote size={16} strokeWidth={1.8} />}
          label="Add Note"
          onClick={onAddNote}
        />
        <QuickAction
          icon={<Pencil size={16} strokeWidth={1.8} />}
          label="Add Drawing"
          onClick={onAddDrawing}
        />
        <QuickAction
          icon={<BookmarkIcon size={16} strokeWidth={1.8} fill={isBookmarked ? 'currentColor' : 'none'} />}
          label={isBookmarked ? 'Bookmarked' : 'Add Bookmark'}
          onClick={onAddBookmark}
          active={isBookmarked}
        />
        <QuickAction
          icon={<Layers size={16} strokeWidth={1.8} />}
          label="Add Flashcard"
          onClick={onAddFlashcard}
        />
      </div>

      {/* 2. Your Notes heading + add button */}
      <Section
        title="Your Notes"
        right={onAddNote && (
          <button
            onClick={onAddNote}
            aria-label="Add note"
            title="Add note (switches to text-note tool)"
            style={{
              width: 22, height: 22, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-2)',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' })}
          >
            <Plus size={14} />
          </button>
        )}
      >
        {!activeDocument ? (
          <EmptyState
            icon={<FileText size={18} />}
            title="Open a document"
            body="Open a PDF to see and add notes."
          />
        ) : textEntries.length === 0 ? (
          <EmptyState
            icon={<FileText size={18} />}
            title="No notes yet"
            body="Use the Add Note card or click anywhere on the page with the text-note tool."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {textEntries.map((e) => (
              <NoteCard
                key={`text-${e.id}`}
                entry={e}
                onClick={() => onNavigate(e.virtualIdx)}
                onDelete={onDeleteTextNote ? () => onDeleteTextNote(e.pageKey, e.id) : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 4. Voice Notes */}
      <Section
        title="Voice Notes"
        right={
          voiceEntries.length > 0 ? (
            <span style={{
              padding: '2px 7px', borderRadius: 9999,
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-2)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {voiceEntries.length}
            </span>
          ) : null
        }
      >
        {/* Record button — accent-tinted per spec, not red even while
            recording. The red dot indicator does double-duty as the
            recording cue. */}
        <button
          onClick={onRecordVoiceNote}
          disabled={!onRecordVoiceNote}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 38, padding: '0 12px',
            background: isRecording ? 'var(--accent)' : 'var(--accent-muted)',
            border: `1px solid ${isRecording ? 'var(--accent)' : 'var(--accent)'}`,
            borderRadius: 8,
            color: isRecording ? '#fff' : 'var(--accent)',
            cursor: onRecordVoiceNote ? 'pointer' : 'not-allowed',
            opacity: onRecordVoiceNote ? 1 : 0.5,
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
            transition: 'background 0.13s, color 0.13s, border-color 0.13s',
          }}
        >
          <Mic size={13} strokeWidth={2} />
          {isRecording ? 'Stop Recording' : 'Record Voice Note'}
          {isRecording && (
            <span className="rec-dot" style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--red)', marginLeft: 2, flexShrink: 0,
            }} />
          )}
        </button>

        {voiceEntries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {voiceEntries.map((e) => (
              <VoiceCard
                key={`voice-${e.id}`}
                entry={e}
                onClick={() => onNavigate(e.virtualIdx)}
                onTogglePlay={() => handleToggleVoicePlayback(e)}
                isPlaying={playingVoiceId === e.id && voicePlayState === 'playing'}
                isPaused={playingVoiceId === e.id && voicePlayState === 'paused'}
                onDelete={onDeleteVoiceNote ? () => onDeleteVoiceNote(e.id) : undefined}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function QuickAction({
  icon, label, onClick, active = false,
}: {
  icon:   React.ReactNode;
  label:  string;
  onClick?: () => void;
  active?: boolean;
}) {
  const disabled = !onClick;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 6, padding: '14px 10px',
        background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
        borderRadius: 10,
        color: active ? 'var(--accent)' : 'var(--text-1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
        textAlign: 'center',
        transition: 'background 0.13s, border-color 0.13s, color 0.13s',
      }}
      onMouseOver={(e) => {
        if (disabled || active) return;
        Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
        if (disabled || active) return;
        Object.assign(e.currentTarget.style, {
          background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)',
        });
      }}
    >
      <span style={{
        width: 30, height: 30, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--accent)' : 'var(--bg-active)',
        color: active ? '#fff' : 'var(--text-2)',
        flexShrink: 0,
        transition: 'background 0.13s, color 0.13s',
      }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function Section({
  title, right, children,
}: {
  title:    string;
  right?:   React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <h3 style={{
          margin: 0, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-3)',
        }}>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function EmptyState({
  icon, title, body,
}: {
  icon:  React.ReactNode;
  title: string;
  body:  string;
}) {
  return (
    <div style={{
      padding: '24px 16px', textAlign: 'center',
      background: 'var(--bg-elevated)',
      border: '1px dashed var(--border-subtle)',
      borderRadius: 10,
    }}>
      <div style={{ color: 'var(--text-3)', opacity: 0.5, marginBottom: 6 }}>{icon}</div>
      <p style={{ margin: '0 0 3px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
        {title}
      </p>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  );
}

function NoteCard({
  entry, onClick, onDelete,
}: {
  entry:   TextEntry;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const cat = entry.category ? CATEGORY_STYLES[entry.category] : null;

  return (
    <div
      className="group"
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '10px 12px 11px',
        borderRadius: 10,
        background: cat ? cat.bg : 'var(--bg-panel)',
        border: `1px solid ${cat ? 'transparent' : 'var(--border-subtle)'}`,
        cursor: 'pointer',
        transition: 'transform 0.12s ease, border-color 0.12s ease',
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      {cat && (
        <span style={{
          display: 'inline-block',
          padding: '2px 7px', borderRadius: 4,
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
          color: cat.text,
          background: 'transparent',
          border: `1px solid ${cat.text}`,
          marginBottom: 6,
        }}>
          {cat.label}
        </span>
      )}

      <p style={{
        margin: 0, fontSize: 13, fontWeight: 600,
        color: cat ? cat.text : 'var(--text-1)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {entry.title}
      </p>

      {entry.body && (
        <p style={{
          margin: '3px 0 0', fontSize: 12, lineHeight: 1.45,
          color: cat ? cat.text : 'var(--text-2)',
          opacity: cat ? 0.78 : 1,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}>
          {entry.body}
        </p>
      )}

      <p style={{
        margin: '6px 0 0', fontSize: 10.5,
        color: cat ? cat.text : 'var(--text-3)',
        opacity: cat ? 0.7 : 1,
        letterSpacing: '0.02em',
      }}>
        {entry.pageLabel}
      </p>

      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete note"
          className="opacity-0 group-hover:opacity-100"
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: cat ? cat.text : 'var(--text-3)',
            opacity: 0,
            transition: 'opacity 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.06)'; }}
          onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function VoiceCard({
  entry, onClick, onTogglePlay, isPlaying, isPaused, onDelete,
}: {
  entry:   VoiceEntry;
  onClick: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  isPaused: boolean;
  onDelete?: () => void;
}) {
  return (
    <div
      className="group"
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'border-color 0.12s, background 0.12s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        background: 'var(--bg-hover)', borderColor: 'var(--border)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)',
      })}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        title={isPlaying ? 'Pause voice note' : 'Play voice note'}
        disabled={!entry.audioUrl}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: (isPlaying || isPaused) ? 'var(--accent)' : 'var(--accent-muted)',
          color: (isPlaying || isPaused) ? '#fff' : 'var(--accent)',
          border: 'none',
          cursor: entry.audioUrl ? 'pointer' : 'not-allowed',
          opacity: entry.audioUrl ? 1 : 0.5,
          flexShrink: 0,
          transition: 'background 0.12s, color 0.12s, opacity 0.12s',
        }}
      >
        {isPlaying
          ? <Pause size={12} fill="currentColor" />
          : <Play size={12} fill="currentColor" style={{ marginLeft: 1 }} />
        }
      </button>
      <span style={{
        width: 28, height: 28, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-muted)', color: 'var(--accent)',
        flexShrink: 0,
      }}>
        <Mic size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.preview}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--text-3)' }}>
          {entry.pageLabel} · {timeAgo(entry.timestamp)} · {formatDuration(entry.duration)}
        </p>
      </div>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete voice note"
          className="opacity-0 group-hover:opacity-100"
          style={{
            width: 22, height: 22, borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', flexShrink: 0, opacity: 0,
            transition: 'opacity 0.12s, color 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)', background: 'var(--bg-hover)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'transparent' })}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}
