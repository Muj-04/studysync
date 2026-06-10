'use client';
import { useRef, useCallback, useEffect } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  sensitivity?: number;
  onChange: (v: number) => void;
  label?: string;
  width?: number | string;
}

export default function DragScrubber({
  value, min = 1, max = 40, sensitivity = 4, onChange, label, width = '100%',
}: Props) {
  const valueRef  = useRef(value);
  const rafRef    = useRef<number>(0);
  const dragState = useRef<{ startX: number; startVal: number } | null>(null);

  useEffect(() => { valueRef.current = value; }, [value]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startVal: valueRef.current };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const clamped = Math.min(max, Math.max(min, Math.round(dragState.current.startVal + dx / sensitivity)));
    if (clamped === valueRef.current) return;
    valueRef.current = clamped;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => onChange(clamped));
  }, [min, max, sensitivity, onChange]);

  const handlePointerUp = useCallback(() => { dragState.current = null; }, []);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative', width, height: 28, borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'var(--bg-input, #1a1a1a)',
        cursor: 'ew-resize', overflow: 'hidden',
        userSelect: 'none', touchAction: 'none', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${pct}%`,
        background: 'var(--accent-muted)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)',
        gap: 4, pointerEvents: 'none', fontFamily: 'inherit',
      }}>
        {label && <span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 11 }}>{label}</span>}
        <span>{value}</span>
      </div>
    </div>
  );
}
