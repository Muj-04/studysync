'use client';

import { useMemo } from 'react';
import { Mic, FileText, Trash2 } from 'lucide-react';
import type { TextNote, VoiceNote, PDFDocument, BlankPage } from '@/types';

/**
 * Sticky-note card view for the right-panel Notes tab. Reads from the
 * existing text_notes + voice_notes state on the workspace page (no new
 * data layer). Cards cycle through three same-hue pastel colors from the
 * --note-{purple,blue,yellow}-{bg,text} tokens for visual variety.
 *
 * Click a card → navigate to that note's page.
 * Trash chip on hover → delete via the same handlers SidebarThumbnails
 * used previously (these have been moved here from there).
 */

type VirtualPage =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

type NoteEntry =
  | { kind: 'text';  id: string; pageKey: string; pageLabel: string; virtualIdx: number; preview: string; }
  | { kind: 'voice'; id: string;                  pageLabel: string; virtualIdx: number; preview: string; timestamp: Date; };

interface Props {
  activeDocumentId:    string | null;
  activeDocument:      PDFDocument | null;
  virtualPages:        VirtualPage[];
  allTextNotes:        Record<string, TextNote[]>;
  voiceNotes:          VoiceNote[];
  onNavigate:          (virtualIdx: number) => void;
  onDeleteTextNote?:   (pageKey: string, noteId: string) => void;
  onDeleteVoiceNote?:  (id: string) => void;
}

// Three-color rotation for sticky-note cards. Tokens are defined in
// globals.css and exist in BOTH light and dark theme blocks.
const PALETTE = [
  { bg: 'var(--note-purple-bg)', text: 'var(--note-purple-text)', icon: 'var(--note-purple-text)' },
  { bg: 'var(--note-blue-bg)',   text: 'var(--note-blue-text)',   icon: 'var(--note-blue-text)'   },
  { bg: 'var(--note-yellow-bg)', text: 'var(--note-yellow-text)', icon: 'var(--note-yellow-text)' },
] as const;

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function NotesTabContent({
  activeDocumentId, activeDocument, virtualPages,
  allTextNotes, voiceNotes,
  onNavigate, onDeleteTextNote, onDeleteVoiceNote,
}: Props) {
  // Merge text + voice notes for the active document into a single
  // chronologically/positionally sorted list. Logic preserved verbatim
  // from the prior SidebarThumbnails combinedNotes builder, then
  // re-tagged with sticky-note rendering.
  const entries = useMemo<NoteEntry[]>(() => {
    if (!activeDocumentId) return [];
    const out: NoteEntry[] = [];
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
        out.push({
          kind: 'text', id: note.id, pageKey: key, pageLabel, virtualIdx,
          preview: note.content.trim(),
        });
      });
    });

    voiceNotes.filter((n) => n.documentId === activeDocumentId).forEach((note) => {
      const pn = note.pageNumber;
      const isBlank = typeof pn === 'string';
      const virtualIdx = isBlank
        ? virtualPages.findIndex((vp) => vp.type === 'blank' && vp.blankPage.id === (pn as string))
        : virtualPages.findIndex((vp) => vp.type === 'pdf' && vp.pdfPage === (pn as number));
      if (virtualIdx < 0) return;
      const pageLabel = isBlank ? 'Blank' : `Page ${pn}`;
      out.push({
        kind: 'voice', id: note.id, pageLabel, virtualIdx,
        preview: note.title ?? `Voice note · ${formatDuration(note.duration)}`,
        timestamp: note.timestamp,
      });
    });

    return out.sort((a, b) =>
      a.virtualIdx !== b.virtualIdx
        ? a.virtualIdx - b.virtualIdx
        : a.kind === 'text' ? -1 : 1,
    );
  }, [activeDocumentId, allTextNotes, voiceNotes, virtualPages]);

  // ── Empty states ────────────────────────────────────────────────────────────
  if (!activeDocument) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <FileText size={20} style={{ color: 'var(--text-3)', opacity: 0.4, marginBottom: 8 }} />
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
          Open a document to view its notes.
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <FileText size={20} style={{ color: 'var(--text-3)', opacity: 0.4, marginBottom: 8 }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', margin: '0 0 4px' }}>
          No notes yet
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
          Add text or voice notes while studying.
        </p>
      </div>
    );
  }

  // Split into text vs voice for the two-section layout from the reference
  // (Your Notes / Voice Notes). Both sections cycle the same palette.
  const textEntries  = entries.filter((e): e is Extract<NoteEntry, { kind: 'text' }>  => e.kind === 'text');
  const voiceEntries = entries.filter((e): e is Extract<NoteEntry, { kind: 'voice' }> => e.kind === 'voice');

  return (
    <div style={{ padding: '14px 14px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {textEntries.length > 0 && (
        <Section title="Your Notes">
          {textEntries.map((e, i) => (
            <StickyNoteCard
              key={`text-${e.id}`}
              palette={PALETTE[i % PALETTE.length]}
              icon={<FileText size={12} />}
              pageLabel={e.pageLabel}
              preview={e.preview}
              onClick={() => onNavigate(e.virtualIdx)}
              onDelete={onDeleteTextNote ? () => onDeleteTextNote(e.pageKey, e.id) : undefined}
            />
          ))}
        </Section>
      )}

      {voiceEntries.length > 0 && (
        <Section title="Voice Notes">
          {voiceEntries.map((e, i) => (
            <StickyNoteCard
              key={`voice-${e.id}`}
              palette={PALETTE[(textEntries.length + i) % PALETTE.length]}
              icon={<Mic size={12} />}
              pageLabel={e.pageLabel}
              preview={e.preview}
              timestamp={e.timestamp}
              onClick={() => onNavigate(e.virtualIdx)}
              onDelete={onDeleteVoiceNote ? () => onDeleteVoiceNote(e.id) : undefined}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-3)',
        margin: '0 0 8px', paddingLeft: 2,
      }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function StickyNoteCard({
  palette, icon, pageLabel, preview, timestamp, onClick, onDelete,
}: {
  palette: { bg: string; text: string; icon: string };
  icon: React.ReactNode;
  pageLabel: string;
  preview: string;
  timestamp?: Date;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="group"
      onClick={onClick}
      style={{
        background: palette.bg,
        borderRadius: 10,
        padding: '10px 12px 11px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
        color: palette.icon, marginBottom: 6, opacity: 0.85,
      }}>
        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ textTransform: 'uppercase' }}>{pageLabel}</span>
        {timestamp && (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ fontWeight: 500, letterSpacing: 'normal', textTransform: 'none', opacity: 0.85 }}>
              {timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </>
        )}
      </div>
      <p style={{
        fontSize: 12.5, lineHeight: 1.5,
        color: palette.text,
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}>
        {preview}
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
            color: palette.icon, opacity: 0,
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
