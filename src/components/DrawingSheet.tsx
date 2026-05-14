'use client';
import { useRef } from 'react';
import { Pencil, Eraser, Trash2, X, ChevronUp } from 'lucide-react';
import type { Tool, PenType } from '@/lib/drawing';
import { PRESET_COLORS, SIZES } from '@/lib/drawing';

// ─── Toolbar sub-components ───────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{
      width: 1, alignSelf: 'stretch', margin: '8px 3px',
      background: 'rgba(255,255,255,0.1)', flexShrink: 0,
    }} />
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 6, padding: '7px 10px', flexShrink: 0,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
        letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)',
      }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{children}</div>
    </div>
  );
}

function ToolBtn({
  active, onClick, children, danger = false,
}: {
  active?: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        minWidth: 46, padding: '6px 8px', borderRadius: 10,
        border: active ? '1.5px solid rgba(255,255,255,0.48)' : '1.5px solid transparent',
        background: active
          ? 'rgba(255,255,255,0.2)'
          : danger ? 'transparent' : 'rgba(255,255,255,0.05)',
        color: active ? '#fff' : danger ? 'rgba(255,100,100,0.65)' : 'rgba(255,255,255,0.55)',
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        fontFamily: 'inherit',
        boxShadow: active ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
      }}
      onMouseOver={(e) => {
        if (!active) {
          e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.12)';
          e.currentTarget.style.color = danger ? '#fca5a5' : '#fff';
          e.currentTarget.style.borderColor = danger ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.2)';
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.background = danger ? 'transparent' : 'rgba(255,255,255,0.05)';
          e.currentTarget.style.color = danger ? 'rgba(255,100,100,0.65)' : 'rgba(255,255,255,0.55)';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      {children}
    </button>
  );
}

function BtnLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1, letterSpacing: '0.02em' }}>{children}</span>;
}

function StrokePreview({ type, color }: { type: PenType; color: string }) {
  if (type === 'normal') return <div style={{ width: 26, height: 3, borderRadius: 9999, background: color }} />;
  if (type === 'marker') return <div style={{ width: 26, height: 7, borderRadius: 3, background: color, opacity: 0.55 }} />;
  return <div style={{ width: 26, height: 13, borderRadius: 2, background: color, opacity: 0.28 }} />;
}

// ─── Sheet component ──────────────────────────────────────────────────────────

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
  onDeletePage?: () => void;
}

export default function DrawingSheet({
  isOpen, onToggle,
  tool, setTool, penType, setPenType, color, setColor, strokeSize, setStrokeSize,
  onClear, onDeletePage,
}: Props) {
  const touchStartY = useRef<number | null>(null);
  const previewColor = tool === 'eraser' ? 'rgba(255,255,255,0.5)' : color;

  const onTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy < -36 && !isOpen) onToggle();
    if (dy > 36 && isOpen) onToggle();
    touchStartY.current = null;
  };

  return (
    <div style={{
      flexShrink: 0,
      background: 'rgba(255,255,255,0.07)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1.5px solid rgba(255,255,255,0.12)',
      userSelect: 'none',
    }}>

      {/* Drag handle + header — always visible, click/swipe to toggle */}
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
            background: 'rgba(255,255,255,0.2)',
            transition: 'background 0.15s ease',
          }} />
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 16px 9px' }}>
          <Pencil
            size={12}
            style={{
              color: isOpen ? '#a78bfa' : 'rgba(255,255,255,0.4)',
              flexShrink: 0,
              transition: 'color 0.2s ease',
            }}
          />
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', flex: 1,
          }}>
            Drawing Tools
          </span>
          {!isOpen && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
              {tool === 'eraser' ? 'Eraser' : penType.charAt(0).toUpperCase() + penType.slice(1)}
            </span>
          )}
          <ChevronUp size={14} style={{
            color: 'rgba(255,255,255,0.35)', flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      {/* Collapsible toolbar */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? 100 : 0,
        transition: isOpen
          ? 'max-height 0.3s cubic-bezier(0, 0, 0.2, 1)'
          : 'max-height 0.2s cubic-bezier(0.4, 0, 1, 1)',
      }}>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>

            <Section label="Tool">
              <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')}>
                <Pencil size={15} /><BtnLabel>Pen</BtnLabel>
              </ToolBtn>
              <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')}>
                <Eraser size={15} /><BtnLabel>Eraser</BtnLabel>
              </ToolBtn>
            </Section>

            <Divider />

            <Section label="Style">
              <ToolBtn active={tool === 'pen' && penType === 'normal'} onClick={() => { setTool('pen'); setPenType('normal'); }}>
                <StrokePreview type="normal" color={previewColor} /><BtnLabel>Normal</BtnLabel>
              </ToolBtn>
              <ToolBtn active={tool === 'pen' && penType === 'marker'} onClick={() => { setTool('pen'); setPenType('marker'); }}>
                <StrokePreview type="marker" color={previewColor} /><BtnLabel>Marker</BtnLabel>
              </ToolBtn>
              <ToolBtn active={tool === 'pen' && penType === 'highlighter'} onClick={() => { setTool('pen'); setPenType('highlighter'); }}>
                <StrokePreview type="highlighter" color={previewColor} /><BtnLabel>Hi-lite</BtnLabel>
              </ToolBtn>
            </Section>

            <Divider />

            <Section label="Size">
              {SIZES.map(({ label, value }) => (
                <ToolBtn key={value} active={strokeSize === value} onClick={() => setStrokeSize(value)}>
                  <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      borderRadius: '50%', background: 'rgba(255,255,255,0.85)',
                      width: Math.min(value * 2.2, 18), height: Math.min(value * 2.2, 18),
                    }} />
                  </div>
                  <BtnLabel>{label}</BtnLabel>
                </ToolBtn>
              ))}
            </Section>

            <Divider />

            <Section label="Color">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 96, alignItems: 'center' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setTool('pen'); }}
                    title={c}
                    style={{
                      width: 18, height: 18, borderRadius: '50%', background: c,
                      border: 'none', cursor: 'pointer', flexShrink: 0,
                      outline: color === c && tool === 'pen' ? '2.5px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      outlineOffset: 1.5,
                      transform: color === c && tool === 'pen' ? 'scale(1.25)' : 'scale(1)',
                      transition: 'transform 0.14s ease, outline 0.14s ease',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => { setColor(e.target.value); setTool('pen'); }}
                  title="Custom color"
                  style={{
                    width: 18, height: 18,
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 4,
                    background: 'transparent',
                    padding: 0, cursor: 'pointer',
                  }}
                />
              </div>
            </Section>

            <Divider />

            <Section label="Actions">
              <ToolBtn onClick={onClear} danger>
                <Trash2 size={14} /><BtnLabel>Clear</BtnLabel>
              </ToolBtn>
              {onDeletePage && (
                <ToolBtn onClick={onDeletePage} danger>
                  <X size={14} /><BtnLabel>Delete</BtnLabel>
                </ToolBtn>
              )}
            </Section>

          </div>
        </div>
      </div>
    </div>
  );
}
