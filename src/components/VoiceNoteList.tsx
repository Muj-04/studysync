'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Trash2, Pencil } from 'lucide-react';
import type { VoiceNote } from '@/types';

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

function NoteItem({ note, isActive, isPlaying, audio, onTogglePlay, onDelete, onUpdateTitle }: NoteItemProps) {
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

  const openEdit = () => { setTitleInput(note.title ?? ''); setIsEditing(true); };
  const commitEdit = () => { onUpdateTitle(note.id, titleInput.trim()); setIsEditing(false); };
  const cancelEdit = () => { setTitleInput(note.title ?? ''); setIsEditing(false); };

  return (
    <div
      className="rounded-xl transition-all"
      style={{
        background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
        border: isActive ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
        marginBottom: 3,
        transition: 'background 0.18s ease, border-color 0.18s ease',
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-2 py-2 group">
        {/* Play/pause — 32x32 for touch target */}
        <button
          onClick={() => onTogglePlay(note)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex-shrink-0 flex items-center justify-center rounded-full cursor-pointer"
          style={{
            width: 28, height: 28,
            background: '#fff',
            color: '#0f172a',
            border: 'none',
            boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, {
            transform: 'scale(1.08)',
            boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
          })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, {
            transform: 'scale(1)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
          })}
        >
          {isPlaying
            ? <Pause size={10} fill="#0f172a" />
            : <Play size={10} fill="#0f172a" className="ml-0.5" />
          }
        </button>

        {/* Title / edit */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              placeholder="Add a title…"
              className="w-full text-xs bg-transparent outline-none py-0.5"
              style={{
                color: '#fff',
                borderBottom: '1.5px solid rgba(255,255,255,0.45)',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <button
              onClick={openEdit}
              className="text-xs text-left w-full truncate block cursor-pointer"
              style={{ background: 'none', border: 'none', fontFamily: 'inherit', padding: 0 }}
            >
              {note.title
                ? <span style={{ color: '#fff', fontWeight: 500 }}>{note.title}</span>
                : <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 11 }}>{formatTimestamp(note.timestamp)}</span>
              }
            </button>
          )}
        </div>

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0"
          style={{ transition: 'opacity 0.15s ease' }}>
          <button
            onClick={openEdit}
            title="Edit title"
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.38)', transition: 'color 0.15s ease, background 0.15s ease' }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: '#fff', background: 'rgba(255,255,255,0.1)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'rgba(255,255,255,0.38)', background: 'transparent' })}
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={() => onDelete(note.id)}
            title="Delete"
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.38)', transition: 'color 0.15s ease, background 0.15s ease' }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: '#fca5a5', background: 'rgba(239,68,68,0.12)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'rgba(255,255,255,0.38)', background: 'transparent' })}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Seek row */}
      {isActive && (
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <span
            ref={currentTimeRef}
            className="text-[10px] font-mono tabular-nums flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.65)', minWidth: 28 }}
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
            className="flex-1 h-1 rounded-full cursor-pointer"
            style={{ accentColor: '#fff' }}
          />
          <span
            className="text-[10px] font-mono tabular-nums flex-shrink-0 text-right"
            style={{ color: 'rgba(255,255,255,0.42)', minWidth: 28 }}
          >
            {formatDuration(note.duration)}
          </span>
        </div>
      )}
    </div>
  );
}

interface Props {
  notes: VoiceNote[];
  pageKey: string;
  onDelete: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
}

export default function VoiceNoteList({ notes, pageKey, onDelete, onUpdateTitle }: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playState, setPlayState] = useState<'playing' | 'paused'>('playing');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const destroyAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current.onended = null; audioRef.current.onerror = null; audioRef.current = null; }
    setPlayingId(null); setPlayState('playing');
  }, []);

  useEffect(() => { destroyAudio(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pageKey]);
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

  if (notes.length === 0) return null;

  return (
    <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 200, paddingTop: 2 }}>
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
}
