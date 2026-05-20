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

export default function VoiceNoteRecorder({
  documentId, pageNumber,
  isRecording, recordingDuration, recordingContext,
  onStart, onStop,
}: Props) {
  const isRecordingHere = isRecording
    && recordingContext?.documentId === documentId
    && recordingContext?.pageNumber === pageNumber;
  const isRecordingElsewhere = isRecording && !isRecordingHere;

  if (isRecordingHere) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="rec-dot" style={{
            display: 'inline-block',
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--red)',
          }} />
          <span style={{
            fontSize: 11.5, fontWeight: 600,
            color: 'var(--red)',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'inherit',
          }}>
            {formatDuration(recordingDuration)}
          </span>
        </div>

        {/* Stop button */}
        <button
          onClick={onStop}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 28, padding: '0 12px',
            borderRadius: 6,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-1)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.13s, border-color 0.13s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-active)', borderColor: 'var(--border-strong)',
          })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)',
          })}
        >
          <Square size={10} fill="currentColor" />
          Stop
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onStart}
      disabled={isRecordingElsewhere}
      title={isRecordingElsewhere ? 'Recording in progress on another page' : 'Record a voice note'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 28, padding: '0 12px',
        borderRadius: 6,
        background: isRecordingElsewhere ? 'var(--bg-elevated)' : 'var(--red)',
        border: `1px solid ${isRecordingElsewhere ? 'var(--border)' : 'transparent'}`,
        color: isRecordingElsewhere ? 'var(--text-3)' : '#fff',
        fontSize: 12, fontWeight: 500,
        cursor: isRecordingElsewhere ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        opacity: isRecordingElsewhere ? 0.5 : 1,
        transition: 'background 0.13s, opacity 0.13s',
      }}
      onMouseOver={(e) => {
        if (!isRecordingElsewhere) e.currentTarget.style.background = '#d03f44';
      }}
      onMouseOut={(e) => {
        if (!isRecordingElsewhere) e.currentTarget.style.background = 'var(--red)';
      }}
    >
      <Mic size={12} />
      Record
    </button>
  );
}
