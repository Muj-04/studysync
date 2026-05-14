'use client';
import { Mic, Square } from 'lucide-react';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  documentId: string;
  pageNumber: number | string;
  isRecording: boolean;
  recordingDuration: number;
  recordingContext: { documentId: string; pageNumber: number | string } | null;
  onStart: () => void;
  onStop: () => void;
}

export default function VoiceNoteRecorder({ documentId, pageNumber, isRecording, recordingDuration, recordingContext, onStart, onStop }: Props) {
  const isRecordingHere = isRecording && recordingContext?.documentId === documentId && recordingContext?.pageNumber === pageNumber;
  const isRecordingElsewhere = isRecording && !isRecordingHere;

  if (isRecordingHere) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className="rec-dot"
            style={{
              display: 'inline-block',
              width: 7, height: 7, borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 6px rgba(239,68,68,0.6)',
            }}
          />
          <span
            className="text-xs font-mono font-semibold tabular-nums"
            style={{ color: '#fca5a5', letterSpacing: '0.02em' }}
          >
            {formatDuration(recordingDuration)}
          </span>
        </div>
        <button
          onClick={onStop}
          className="flex items-center gap-1.5 text-xs font-semibold rounded-full cursor-pointer"
          style={{
            padding: '7px 14px',
            background: '#fff',
            color: '#7f1d1d',
            border: 'none',
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { opacity: '0.88', transform: 'scale(1.02)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { opacity: '1', transform: 'scale(1)' })}
        >
          <Square size={9} fill="#7f1d1d" />
          Stop
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onStart}
      disabled={isRecordingElsewhere}
      title={isRecordingElsewhere ? 'Recording in progress on another page' : 'Record a voice note for this page'}
      className="flex items-center gap-1.5 text-xs font-semibold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        padding: '7px 14px',
        background: '#ef4444',
        color: '#fff',
        border: 'none',
        fontFamily: 'inherit',
        boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
        transition: 'background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
      }}
      onMouseOver={(e) => {
        if (!e.currentTarget.disabled) {
          Object.assign(e.currentTarget.style, {
            background: '#dc2626',
            boxShadow: '0 4px 14px rgba(239,68,68,0.4)',
            transform: 'scale(1.02)',
          });
        }
      }}
      onMouseOut={(e) => {
        Object.assign(e.currentTarget.style, {
          background: '#ef4444',
          boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
          transform: 'scale(1)',
        });
      }}
    >
      <Mic size={12} />
      Record
    </button>
  );
}
