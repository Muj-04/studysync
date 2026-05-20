'use client';
import { useRef } from 'react';
import { Pencil, Eraser, Trash2, X, ChevronUp, ImagePlus } from 'lucide-react';
import type { Tool, PenType } from '@/lib/drawing';
import { PRESET_COLORS, SIZES } from '@/lib/drawing';

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sep() {
  return (
    <div style={{
      width: 1, alignSelf: 'stretch',
      background: 'var(--border)',
      margin: '10px 4px',
      flexShrink: 0,
    }} />
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 6,
      padding: '8px 10px',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--text-3)',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {children}
      </div>
    </div>
  );
}

function ToolBtn({
  active, onClick, children, danger = false,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const dangerColor = 'var(--red)';
  const dangerMuted = 'var(--red-muted)';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 3,
        minWidth: 44, padding: '5px 7px',
        borderRadius: 7,
        border: active
          ? '1px solid var(--border-strong)'
          : '1px solid transparent',
        background: active
          ? 'var(--bg-active)'
          : danger ? 'transparent' : 'transparent',
        color: active
          ? 'var(--text-1)'
          : danger ? dangerColor : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
        fontFamily: 'inherit',
      }}
      onMouseOver={(e) => {
        if (!active) {
          e.currentTarget.style.background = danger ? dangerMuted : 'var(--bg-hover)';
          e.currentTarget.style.color = danger ? dangerColor : 'var(--text-1)';
          e.currentTarget.style.borderColor = danger ? 'rgba(229,72,77,.2)' : 'var(--border)';
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = danger ? dangerColor : 'var(--text-2)';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      {children}
    </button>
  );
}

function BtnLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 500, lineHeight: 1, color: 'inherit' }}>
      {children}
    </span>
  );
}

function StrokePreview({ type, color }: { type: PenType; color: string }) {
  if (type === 'normal')      return <div style={{ width: 24, height: 2.5, borderRadius: 9999, background: color }} />;
  if (type === 'marker')      return <div style={{ width: 24, height: 6, borderRadius: 2, background: color, opacity: 0.6 }} />;
  return                             <div style={{ width: 24, height: 11, borderRadius: 2, background: color, opacity: 0.3 }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  onInsertImage?: (dataUrl: string) => void;
}

export default function DrawingSheet({
  isOpen, onToggle,
  tool, setTool, penType, setPenType,
  color, setColor, strokeSize, setStrokeSize,
  onClear, onDeletePage, onInsertImage,
}: Props) {
  const touchStartY = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewColor = tool === 'eraser' ? 'var(--text-3)' : color;

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
      background: 'var(--bg-panel)',
      borderTop: '1px solid var(--border)',
      userSelect: 'none',
      flexShrink: 0,
    }}>

      {/* ── Header — always visible ── */}
      <div
        onClick={onToggle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ cursor: 'pointer' }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '7px 0 3px' }}>
          <div style={{
            width: 28, height: 3,
            background: 'var(--border-strong)',
            borderRadius: 9999,
          }} />
        </div>

        {/* Title row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '2px 14px 8px',
        }}>
          <Pencil
            size={11}
            style={{ color: isOpen ? 'var(--violet)' : 'var(--text-3)', transition: 'color 0.2s', flexShrink: 0 }}
          />
          <span style={{
            fontSize: 10.5, fontWeight: 600,
            letterSpacing: '0.07em', textTransform: 'uppercase',
            color: 'var(--text-2)', flex: 1,
          }}>
            Annotation Tools
          </span>
          {!isOpen && (
            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              {tool === 'eraser' ? 'Eraser' : `${penType.charAt(0).toUpperCase()}${penType.slice(1)}`}
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
      </div>

      {/* ── Toolbar (collapsible) ── */}
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? 92 : 0,
        transition: isOpen
          ? 'max-height 0.28s cubic-bezier(0,0,0.2,1)'
          : 'max-height 0.18s cubic-bezier(0.4,0,1,1)',
      }}>
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>

            <Group label="Tool">
              <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')}>
                <Pencil size={14} /><BtnLabel>Pen</BtnLabel>
              </ToolBtn>
              <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')}>
                <Eraser size={14} /><BtnLabel>Eraser</BtnLabel>
              </ToolBtn>
            </Group>

            <Sep />

            <Group label="Style">
              <ToolBtn active={tool === 'pen' && penType === 'normal'} onClick={() => { setTool('pen'); setPenType('normal'); }}>
                <StrokePreview type="normal" color={previewColor} /><BtnLabel>Pen</BtnLabel>
              </ToolBtn>
              <ToolBtn active={tool === 'pen' && penType === 'marker'} onClick={() => { setTool('pen'); setPenType('marker'); }}>
                <StrokePreview type="marker" color={previewColor} /><BtnLabel>Marker</BtnLabel>
              </ToolBtn>
              <ToolBtn active={tool === 'pen' && penType === 'highlighter'} onClick={() => { setTool('pen'); setPenType('highlighter'); }}>
                <StrokePreview type="highlighter" color={previewColor} /><BtnLabel>Highlight</BtnLabel>
              </ToolBtn>
            </Group>

            <Sep />

            <Group label="Size">
              {SIZES.map(({ label, value }) => (
                <ToolBtn key={value} active={strokeSize === value} onClick={() => setStrokeSize(value)}>
                  <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      borderRadius: '50%',
                      background: 'var(--text-2)',
                      width: Math.min(value * 2.2, 18),
                      height: Math.min(value * 2.2, 18),
                    }} />
                  </div>
                  <BtnLabel>{label}</BtnLabel>
                </ToolBtn>
              ))}
            </Group>

            <Sep />

            <Group label="Color">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 88, alignItems: 'center' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setTool('pen'); }}
                    title={c}
                    style={{
                      width: 18, height: 18,
                      borderRadius: '50%',
                      background: c,
                      border: 'none',
                      cursor: 'pointer', flexShrink: 0,
                      outline: color === c && tool === 'pen'
                        ? '2px solid var(--accent-hover)'
                        : '1.5px solid transparent',
                      outlineOffset: 2,
                      transform: color === c && tool === 'pen' ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.12s, outline 0.12s',
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
                    border: '1px solid var(--border-strong)',
                    borderRadius: 4,
                    background: 'var(--bg-input)',
                    padding: 0, cursor: 'pointer',
                  }}
                />
              </div>
            </Group>

            <Sep />

            <Group label="Actions">
              {onInsertImage && (
                <>
                  <ToolBtn onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus size={13} /><BtnLabel>Image</BtnLabel>
                  </ToolBtn>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') onInsertImage(reader.result);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
              <ToolBtn onClick={onClear} danger>
                <Trash2 size={13} /><BtnLabel>Clear</BtnLabel>
              </ToolBtn>
              {onDeletePage && (
                <ToolBtn onClick={onDeletePage} danger>
                  <X size={13} /><BtnLabel>Delete</BtnLabel>
                </ToolBtn>
              )}
            </Group>

          </div>
        </div>
      </div>
    </div>
  );
}
