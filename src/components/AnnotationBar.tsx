'use client';
import { Pencil, Eraser, Trash2, ChevronUp } from 'lucide-react';
import type { Tool, PenType } from '@/lib/drawing';
import { PRESET_COLORS } from '@/lib/drawing';
import DragScrubber from './DragScrubber';

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
      background: '#333333',
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
        border: `1px solid ${active ? '#555555' : 'transparent'}`,
        background: active ? '#3a3a3a' : 'transparent',
        color: '#ffffff',
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 500,
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseOver={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: '#2a2a2a', borderColor: '#444444',
        });
      }}
      onMouseOut={(e) => {
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'transparent', borderColor: 'transparent',
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
  const previewColor = tool === 'eraser' ? '#888888' : color;

  return (
    <div style={{
      background: '#1a1a1a',
      borderTop: '1px solid #333333',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.6)',
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
            color: isOpen ? '#7c3aed' : '#888888',
            transition: 'color 0.18s', flexShrink: 0,
          }}
        />
        <span style={{
          flex: 1, fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color: '#cccccc',
        }}>
          Annotation Tools
        </span>
        {!isOpen && (
          <span style={{ fontSize: 10.5, color: '#888888' }}>
            {tool === 'eraser'
              ? 'Eraser'
              : `${penType.charAt(0).toUpperCase()}${penType.slice(1)}`}
          </span>
        )}
        <ChevronUp
          size={13}
          style={{
            color: '#888888', flexShrink: 0,
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
          borderTop: '1px solid #333333',
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
                  ? '2px solid #3b82f6'
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
              border: '1px solid #555555',
              borderRadius: 3, padding: 0,
              cursor: 'pointer', background: '#2a2a2a',
            }}
          />

          <Sep />

          {/* Sizes */}
          <DragScrubber value={strokeSize} onChange={setStrokeSize} label="Size" width={100} />

          <Sep />

          {/* Clear */}
          <button
            onClick={onClear}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 10px', borderRadius: 4, flexShrink: 0,
              border: '1px solid transparent',
              background: 'transparent', color: '#ef4444',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              fontFamily: 'inherit',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)',
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
