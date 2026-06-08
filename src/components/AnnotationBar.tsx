'use client';
import { Pencil, Eraser, Trash2, ChevronUp } from 'lucide-react';
import type { Tool, PenType } from '@/lib/drawing';
import { PRESET_COLORS, SIZES } from '@/lib/drawing';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  penType: PenType;
  setPenType: (p: PenType) => void;
  color: string;
  setColor: (c: string) => void;
  strokeSize: number;
  setStrokeSize: (s: number) => void;
  onClear: () => void;
}

function Sep() {
  return (
    <div style={{
      width: 1, height: 24,
      background: 'var(--border)',
      flexShrink: 0, margin: '0 3px',
    }} />
  );
}

function ToolBtn({
  active, onClick, children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        height: 30, padding: '0 9px',
        borderRadius: 4, flexShrink: 0,
        border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 500,
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
      }}
      onMouseOver={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
        });
      }}
    >
      {children}
    </button>
  );
}

export default function AnnotationBar({
  isOpen, onToggle, tool, setTool, penType, setPenType,
  color, setColor, strokeSize, setStrokeSize, onClear,
}: Props) {
  const previewColor = tool === 'eraser' ? 'var(--text-3)' : color;

  return (
    <div style={{
      background: 'var(--bg-panel)',
      borderTop: '1px solid var(--border)',
      flexShrink: 0,
      userSelect: 'none',
    }}>

      {/* ── Header — always visible ── */}
      <div
        onClick={onToggle}
        style={{
          height: 38, display: 'flex', alignItems: 'center',
          padding: '0 14px', gap: 8, cursor: 'pointer',
        }}
      >
        <Pencil
          size={11}
          style={{
            color: isOpen ? 'var(--violet)' : 'var(--text-3)',
            transition: 'color 0.18s', flexShrink: 0,
          }}
        />
        <span style={{
          flex: 1, fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color: 'var(--text-2)',
        }}>
          Annotation Tools
        </span>
        {!isOpen && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
            {tool === 'eraser'
              ? 'Eraser'
              : `${penType.charAt(0).toUpperCase()}${penType.slice(1)}`}
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

      {/* ── Collapsible tools row ── */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? 60 : 0,
        transition: isOpen
          ? 'max-height 0.26s cubic-bezier(0,0,0.2,1)'
          : 'max-height 0.18s cubic-bezier(0.4,0,1,1)',
      }}>
        <div style={{
          borderTop: '1px solid var(--border)',
          height: 52, display: 'flex', alignItems: 'center',
          padding: '0 10px', gap: 3, overflowX: 'auto',
        }}>

          {/* Pen types */}
          <ToolBtn
            active={tool === 'pen' && penType === 'normal'}
            onClick={() => { setTool('pen'); setPenType('normal'); }}
          >
            <div style={{ width: 12, height: 2.5, borderRadius: 9999, background: previewColor }} />
            <span>Pen</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'marker'}
            onClick={() => { setTool('pen'); setPenType('marker'); }}
          >
            <div style={{ width: 12, height: 5, borderRadius: 2, background: previewColor, opacity: 0.65 }} />
            <span>Marker</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'highlighter'}
            onClick={() => { setTool('pen'); setPenType('highlighter'); }}
          >
            <div style={{ width: 12, height: 9, borderRadius: 2, background: previewColor, opacity: 0.35 }} />
            <span>Highlight</span>
          </ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')}>
            <Eraser size={13} /><span>Eraser</span>
          </ToolBtn>

          <Sep />

          {/* Color presets */}
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c, border: 'none',
                cursor: 'pointer', flexShrink: 0,
                outline: color === c && tool !== 'eraser'
                  ? '2px solid var(--accent-hover)'
                  : '1.5px solid transparent',
                outlineOffset: 2,
                transform: color === c && tool !== 'eraser' ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.12s',
              }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }}
            title="Custom color"
            style={{
              width: 18, height: 18,
              border: '1px solid var(--border-strong)',
              borderRadius: 3, padding: 0,
              cursor: 'pointer', background: 'var(--bg-input)',
            }}
          />

          <Sep />

          {/* Sizes */}
          {SIZES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStrokeSize(value)}
              style={{
                width: 30, height: 28, borderRadius: 4, flexShrink: 0,
                border: `1px solid ${strokeSize === value ? 'var(--border-strong)' : 'var(--border)'}`,
                background: strokeSize === value ? 'var(--bg-active)' : 'transparent',
                color: strokeSize === value ? 'var(--text-1)' : 'var(--text-2)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              onMouseOver={(e) => {
                if (strokeSize !== value) Object.assign(e.currentTarget.style, {
                  background: 'var(--bg-hover)', color: 'var(--text-1)',
                });
              }}
              onMouseOut={(e) => {
                if (strokeSize !== value) Object.assign(e.currentTarget.style, {
                  background: 'transparent', color: 'var(--text-2)',
                });
              }}
            >
              {label}
            </button>
          ))}

          <Sep />

          {/* Clear */}
          <button
            onClick={onClear}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 10px', borderRadius: 4, flexShrink: 0,
              border: '1px solid transparent',
              background: 'transparent', color: 'var(--red)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              fontFamily: 'inherit',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'var(--red-muted)', borderColor: 'rgba(229,72,77,.2)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              background: 'transparent', borderColor: 'transparent',
            })}
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}
