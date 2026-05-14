'use client';
import { useRef } from 'react';
import { Mic, ChevronUp } from 'lucide-react';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import VoiceNoteList from './VoiceNoteList';
import type { VoiceNote } from '@/types';

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
}

export default function VoiceNotesSheet({
  isOpen, onToggle,
  notes, pageKey, documentId, pageNumber,
  isRecording, recordingDuration, recordingContext,
  onStart, onStop, onDelete, onUpdateTitle,
}: Props) {
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
      flexShrink: 0,
      background: 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1.5px solid rgba(255,255,255,0.1)',
      userSelect: 'none',
    }}>

      {/* Drag handle + header — always visible */}
      <div
        onClick={onToggle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ cursor: 'pointer' }}
      >
        {/* Handle pill */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4 }}>
          <div style={{
            width: 32, height: 3.5, borderRadius: 9999,
            background: 'rgba(255,255,255,0.18)',
            transition: 'background 0.15s ease',
          }} />
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 16px 9px' }}>
          <Mic
            size={12}
            style={{
              flexShrink: 0, transition: 'color 0.2s ease',
              color: isRecordingHere ? '#ef4444' : isOpen ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)',
            }}
          />
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', flex: 1,
          }}>
            Voice Notes
          </span>

          {/* Collapsed state indicators */}
          {!isOpen && isRecordingHere && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="rec-dot" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#ef4444',
                display: 'inline-block',
                boxShadow: '0 0 5px rgba(239,68,68,0.6)',
              }} />
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#fca5a5',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {Math.floor(recordingDuration / 60)}:{String(Math.floor(recordingDuration % 60)).padStart(2, '0')}
              </span>
            </div>
          )}
          {!isOpen && !isRecordingHere && notes.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              padding: '2px 7px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.85)',
            }}>
              {notes.length}
            </span>
          )}

          <ChevronUp size={14} style={{
            color: 'rgba(255,255,255,0.35)', flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      {/* Collapsible content */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? 280 : 0,
        transition: isOpen
          ? 'max-height 0.32s cubic-bezier(0, 0, 0.2, 1)'
          : 'max-height 0.2s cubic-bezier(0.4, 0, 1, 1)',
      }}>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Recorder row */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px 8px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
              {notes.length === 0
                ? 'No notes on this page'
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
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '4px 8px 6px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <VoiceNoteList
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
