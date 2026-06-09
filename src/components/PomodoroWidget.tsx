'use client';
import React, { useRef, useState } from 'react';
import { X, Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { usePomodoro } from '@/hooks/usePomodoro';

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface Props { onClose: () => void }

export default function PomodoroWidget({ onClose }: Props) {
  const { phase, timeLeft, running, sessions, total, start, pause, reset, skipPhase } = usePomodoro();

  // Draggable position
  const [pos, setPos]       = useState({ x: 80, y: 80 });
  const dragRef             = useRef<{ ox: number; oy: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
  function onMouseMove(e: MouseEvent) {
    if (!dragRef.current) return;
    setPos({ x: e.clientX - dragRef.current.ox, y: e.clientY - dragRef.current.oy });
  }
  function onMouseUp() {
    dragRef.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  const radius   = 36;
  const circ     = 2 * Math.PI * radius;
  const progress = (total - timeLeft) / total;
  const dashOffset = circ * (1 - progress);
  const isWork   = phase === 'work';
  const accent   = isWork ? '#5965d9' : '#22c55e';

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: 600,
        width: 200,
        background: 'var(--bg-panel)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        cursor: 'grab',
        userSelect: 'none',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 0',
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Pomodoro
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Phase label */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: accent, background: `${accent}22`, padding: '2px 8px', borderRadius: 99,
        }}>
          {isWork ? 'Focus' : 'Break'}
        </span>
      </div>

      {/* SVG ring + timer */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={48} cy={48} r={radius} fill="none" stroke="var(--border)" strokeWidth={5} />
          <circle
            cx={48} cy={48} r={radius}
            fill="none" stroke={accent} strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.4s' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 96, height: 96,
          marginTop: 0,
        }}>
          <span style={{
            fontSize: 22, fontWeight: 700, color: 'var(--text-1)',
            fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono, monospace)',
            lineHeight: 1,
          }}>
            {fmt(timeLeft)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '10px 0 6px' }}>
        <IconBtn onClick={reset} title="Reset"><RotateCcw size={14} /></IconBtn>
        <button
          onClick={running ? pause : start}
          title={running ? 'Pause' : 'Start'}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 8px ${accent}55`,
            transition: 'background 0.2s, transform 0.1s',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.93)'; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {running ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 2 }} />}
        </button>
        <IconBtn onClick={skipPhase} title="Skip phase"><SkipForward size={14} /></IconBtn>
      </div>

      {/* Session count */}
      <div style={{ textAlign: 'center', paddingBottom: 10 }}>
        <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
          {sessions} session{sessions !== 1 ? 's' : ''} completed
        </span>
      </div>
    </div>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
        background: 'var(--bg-elevated)', color: 'var(--text-2)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
      onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
    >
      {children}
    </button>
  );
}
