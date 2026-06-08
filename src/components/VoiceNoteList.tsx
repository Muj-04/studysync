'use client';
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, Trash2, Pencil } from 'lucide-react';
import type { VoiceNote } from '@/types';

export interface VoiceNoteListHandle {
  playPause: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface NoteItemProps {
  note: VoiceNote;
  isActive: boolean;
  isPlaying: boolean;
  audio: HTMLAudioElement | null;
  onTogglePlay: (note: VoiceNote) => void;
  onDelete: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
}

function NoteItem({
  note, isActive, isPlaying, audio,
  onTogglePlay, onDelete, onUpdateTitle,
}: NoteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(note.title ?? '');
  const sliderRef = useRef<HTMLInputElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const isScrubbing = useRef(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!isActive || !audio) {
      if (sliderRef.current) sliderRef.current.value = '0';
      if (currentTimeRef.current) currentTimeRef.current.textContent = '0:00';
      return;
    }
    const tick = () => {
      const t = audio.currentTime;
      if (!isScrubbing.current && sliderRef.current) sliderRef.current.value = String(t);
      if (currentTimeRef.current) currentTimeRef.current.textContent = formatDuration(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, audio]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audio) audio.currentTime = t;
    if (currentTimeRef.current) currentTimeRef.current.textContent = formatDuration(t);
  };

  const openEdit  = () => { setTitleInput(note.title ?? ''); setIsEditing(true); };
  const commitEdit = () => { onUpdateTitle(note.id, titleInput.trim()); setIsEditing(false); };
  const cancelEdit = () => { setTitleInput(note.title ?? ''); setIsEditing(false); };

  return (
    <div
      style={{
        borderRadius: 4,
        background: isActive ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
        marginBottom: 2,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Main row */}
      <div
        className="group"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px' }}
      >
        {/* Play / pause */}
        <button
          onClick={() => onTogglePlay(note)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            flexShrink: 0,
            width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4,
            background: 'var(--bg-active)',
            border: '1px solid var(--border)',
            color: 'var(--text-1)',
            cursor: 'pointer',
            transition: 'background 0.13s, border-color 0.13s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--accent-muted)', borderColor: 'rgba(89,101,217,.3)',
          })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, {
            background: 'var(--bg-active)', borderColor: 'var(--border)',
          })}
        >
          {isPlaying
            ? <Pause  size={10} fill="currentColor" />
            : <Play   size={10} fill="currentColor" style={{ marginLeft: 1 }} />
          }
        </button>

        {/* Title / edit */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              placeholder="Note title…"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--accent)',
                outline: 'none',
                color: 'var(--text-1)',
                fontSize: 12,
                padding: '1px 0',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <button
              onClick={openEdit}
              style={{
                display: 'block', width: '100%',
                background: 'none', border: 'none',
                textAlign: 'left', padding: 0,
                cursor: 'pointer', fontFamily: 'inherit',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {note.title
                ? <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>{note.title}</span>
                : <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{formatTimestamp(note.timestamp)}</span>
              }
            </button>
          )}
        </div>

        {/* Hover actions */}
        <div
          className="opacity-0 group-hover:opacity-100"
          style={{
            display: 'flex', alignItems: 'center', gap: 1,
            flexShrink: 0,
            transition: 'opacity 0.13s',
          }}
        >
          <button
            onClick={openEdit}
            title="Rename"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4,
              background: 'none', border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              transition: 'color 0.12s, background 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-1)', background: 'var(--bg-hover)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'none' })}
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={() => onDelete(note.id)}
            title="Delete"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4,
              background: 'none', border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              transition: 'color 0.12s, background 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)', background: 'var(--red-muted)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'none' })}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Seek bar */}
      {isActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 7px' }}>
          <span
            ref={currentTimeRef}
            style={{
              fontSize: 10, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
              color: 'var(--text-2)', flexShrink: 0, minWidth: 28,
            }}
          >
            0:00
          </span>
          <input
            ref={sliderRef}
            type="range" min={0} max={note.duration} step={0.01} defaultValue={0}
            onMouseDown={() => { isScrubbing.current = true; }}
            onTouchStart={() => { isScrubbing.current = true; }}
            onMouseUp={(e) => { isScrubbing.current = false; if (audio) audio.currentTime = parseFloat((e.target as HTMLInputElement).value); }}
            onTouchEnd={(e) => { isScrubbing.current = false; if (audio) audio.currentTime = parseFloat((e.target as HTMLInputElement).value); }}
            onChange={handleSeek}
            style={{ flex: 1, height: 3, cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          <span style={{
            fontSize: 10, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
            color: 'var(--text-3)', flexShrink: 0, minWidth: 28, textAlign: 'right',
          }}>
            {formatDuration(note.duration)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

interface Props {
  notes: VoiceNote[];
  pageKey: string;
  onDelete: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
}

const VoiceNoteList = forwardRef<VoiceNoteListHandle, Props>(function VoiceNoteList(
  { notes, pageKey, onDelete, onUpdateTitle }, ref,
) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playState, setPlayState] = useState<'playing' | 'paused'>('playing');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const destroyAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    setPlayingId(null);
    setPlayState('playing');
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { destroyAudio(); }, [pageKey]);
  useEffect(() => () => destroyAudio(), [destroyAudio]);

  const handleTogglePlay = useCallback((note: VoiceNote) => {
    if (playingId === note.id && audioRef.current) {
      if (audioRef.current.paused) { audioRef.current.play().catch(() => destroyAudio()); setPlayState('playing'); }
      else { audioRef.current.pause(); setPlayState('paused'); }
      return;
    }
    destroyAudio();
    const audio = new Audio();
    audio.src = note.audioUrl;
    audio.onended = () => { audioRef.current = null; setPlayingId(null); setPlayState('playing'); };
    audio.onerror = () => destroyAudio();
    audioRef.current = audio;
    setPlayingId(note.id);
    setPlayState('playing');
    audio.play().catch(() => destroyAudio());
  }, [playingId, destroyAudio]);

  const handleDelete = useCallback((id: string) => {
    if (playingId === id) destroyAudio();
    onDelete(id);
  }, [playingId, destroyAudio, onDelete]);

  useImperativeHandle(ref, () => ({
    playPause: () => {
      if (notes.length === 0) return;
      const target = playingId ? notes.find((n) => n.id === playingId) ?? notes[0] : notes[0];
      if (playingId === target.id && audioRef.current) {
        if (audioRef.current.paused) { audioRef.current.play().catch(() => destroyAudio()); setPlayState('playing'); }
        else { audioRef.current.pause(); setPlayState('paused'); }
      } else {
        handleTogglePlay(target);
      }
    },
  }), [notes, playingId, handleTogglePlay, destroyAudio]);

  if (notes.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 200, overflowY: 'auto', paddingTop: 2 }}>
      {notes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          isActive={playingId === note.id}
          isPlaying={playingId === note.id && playState === 'playing'}
          audio={playingId === note.id ? audioRef.current : null}
          onTogglePlay={handleTogglePlay}
          onDelete={handleDelete}
          onUpdateTitle={onUpdateTitle}
        />
      ))}
    </div>
  );
});

export default VoiceNoteList;
