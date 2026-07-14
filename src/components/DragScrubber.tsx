'use client';

import { useCallback, useEffect, useRef } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  sensitivity?: number;
  onChange: (v: number) => void;
  label?: string;
  width?: number | string;
}

/**
 * Rounded stroke-size control.
 *
 * The slider updates local state while it is moving and commits the chosen
 * size only on release. That keeps large PDF/canvas trees from rerendering on
 * every pointer pixel. Minus/plus buttons commit immediately.
 */
export default function DragScrubber({
  value, min = 1, max = 40, onChange, label, width = '100%',
}: Props) {
  const draftRef = useRef(value);
  const sliderRef = useRef<HTMLInputElement>(null);
  const valueLabelRef = useRef<HTMLSpanElement>(null);
  const compact = typeof width === 'number' && width <= 120;

  useEffect(() => {
    draftRef.current = value;
    if (sliderRef.current) sliderRef.current.value = String(value);
    if (valueLabelRef.current) valueLabelRef.current.textContent = String(value);
  }, [value]);

  const clamp = useCallback(
    (next: number) => Math.min(max, Math.max(min, Math.round(next))),
    [max, min],
  );

  const setLocal = useCallback((next: number) => {
    const clamped = clamp(next);
    draftRef.current = clamped;
    if (sliderRef.current) sliderRef.current.value = String(clamped);
    if (valueLabelRef.current) valueLabelRef.current.textContent = String(clamped);
  }, [clamp]);

  const commit = useCallback(() => {
    if (draftRef.current !== value) onChange(draftRef.current);
  }, [onChange, value]);

  const step = useCallback((delta: number) => {
    const next = clamp(draftRef.current + delta);
    draftRef.current = next;
    if (sliderRef.current) sliderRef.current.value = String(next);
    if (valueLabelRef.current) valueLabelRef.current.textContent = String(next);
    if (next !== value) onChange(next);
  }, [clamp, onChange, value]);

  return (
    <div
      style={{
        width,
        minWidth: compact ? 100 : 190,
        height: 36,
        display: 'flex', alignItems: 'center', gap: compact ? 2 : 7,
        padding: '3px 4px', boxSizing: 'border-box',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        userSelect: 'none', flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label="Decrease stroke size"
        style={stepButtonStyle(value <= min)}
      >
        −
      </button>

      {!compact && (
        <input
          ref={sliderRef}
          type="range"
          min={min}
          max={max}
          step={1}
          defaultValue={value}
          aria-label={label ?? 'Stroke size'}
          onInput={(event) => setLocal(Number(event.currentTarget.value))}
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={commit}
          onBlur={commit}
          style={{
            flex: 1, minWidth: 68, height: 20,
            accentColor: 'var(--accent)', cursor: 'pointer',
          }}
        />
      )}

      <div style={{
        minWidth: compact ? 34 : 44,
        height: 26, padding: '0 7px', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        borderRadius: 999,
        background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
        color: 'var(--text-1)', fontSize: 11.5, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
      }}>
        {label && compact && <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{label}</span>}
        <span ref={valueLabelRef}>{value}</span>
        {!compact && <span style={{ color: 'var(--text-3)', fontSize: 9.5, fontWeight: 600 }}>px</span>}
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        disabled={value >= max}
        aria-label="Increase stroke size"
        style={stepButtonStyle(value >= max)}
      >
        +
      </button>
    </div>
  );
}

function stepButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent',
    color: disabled ? 'var(--text-3)' : 'var(--accent)',
    fontSize: 17, fontWeight: 500, lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: 'inherit',
    transition: 'background 0.12s, color 0.12s, opacity 0.12s',
  };
}
