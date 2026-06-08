'use client';
import { useRef } from 'react';
import { Mic, ChevronUp } from 'lucide-react';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import VoiceNoteList from './VoiceNoteList';
import type { VoiceNoteListHandle } from './VoiceNoteList';
import type { VoiceNote } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  notes: VoiceNote[];
  pageKey: string;
  documentId: string;
  pageNumber: number | string;
  isRecording: boolean;
  recordingDuration: number;
  recordingContext: { documentId: string; pageNumber: number | string } | null;
  onStart: () => void;
  onStop: () => void;
  onDelete: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  listRef?: React.Ref<VoiceNoteListHandle>;
}

export default function VoiceNotesSheet({
  isOpen, onToggle,
  notes, pageKey, documentId, pageNumber,
  isRecording, recordingDuration, recordingContext,
  onStart, onStop, onDelete, onUpdateTitle, listRef,
}: Props) {
  const { t } = useLanguage();
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy < -36 && !isOpen) onToggle();
    if (dy > 36 && isOpen) onToggle();
    touchStartY.current = null;
  };

  const isRecordingHere = isRecording
    && recordingContext?.documentId === documentId
    && recordingContext?.pageNumber === pageNumber;

  return (
    <div style={{
      background: 'var(--bg-panel)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      userSelect: 'none',
      flexShrink: 0,
    }}>

      {/* ── Header — always visible ── */}
      <div
        onClick={onToggle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ cursor: 'pointer' }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '7px 0 3px' }}>
          <div style={{
            width: 28, height: 3,
            background: 'var(--border-strong)',
            borderRadius: 9999,
          }} />
        </div>

        {/* Title row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '2px 14px 8px',
        }}>
          <Mic
            size={11}
            style={{
              flexShrink: 0, transition: 'color 0.18s',
              color: isRecordingHere ? 'var(--red)' : isOpen ? 'var(--text-2)' : 'var(--text-3)',
            }}
          />
          <span style={{
            fontSize: 10.5, fontWeight: 600,
            letterSpacing: '0.07em', textTransform: 'uppercase',
            color: 'var(--text-2)', flex: 1,
          }}>
            Voice Notes
          </span>

          {/* Collapsed indicators */}
          {!isOpen && isRecordingHere && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="rec-dot" style={{
                display: 'inline-block',
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--red)',
              }} />
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: 'var(--red)',
                fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
              }}>
                {Math.floor(recordingDuration / 60)}:{String(Math.floor(recordingDuration % 60)).padStart(2, '0')}
              </span>
            </div>
          )}
          {!isOpen && !isRecordingHere && notes.length > 0 && (
            <span style={{
              fontSize: 10.5, fontWeight: 500,
              padding: '1px 7px', borderRadius: 4,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
            }}>
              {notes.length}
            </span>
          )}

          <ChevronUp
            size={13}
            style={{
              color: 'var(--text-3)', flexShrink: 0,
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
            }}
          />
        </div>
      </div>

      {/* ── Collapsible content ── */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? 280 : 0,
        opacity: isOpen ? 1 : 0,
        transition: isOpen
          ? 'max-height 0.3s cubic-bezier(0,0,0.2,1), opacity 0.22s ease'
          : 'max-height 0.18s cubic-bezier(0.4,0,1,1), opacity 0.12s ease',
      }}>
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* Recorder row */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px 8px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 400 }}>
              {notes.length === 0
                ? t('vs_no_notes')
                : `${notes.length} note${notes.length !== 1 ? 's' : ''}`}
            </span>
            <VoiceNoteRecorder
              documentId={documentId}
              pageNumber={pageNumber}
              isRecording={isRecording}
              recordingDuration={recordingDuration}
              recordingContext={recordingContext}
              onStart={onStart}
              onStop={onStop}
            />
          </div>

          {/* Notes list */}
          {notes.length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                padding: '4px 8px 6px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <VoiceNoteList
                ref={listRef}
                notes={notes}
                pageKey={pageKey}
                onDelete={onDelete}
                onUpdateTitle={onUpdateTitle}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
