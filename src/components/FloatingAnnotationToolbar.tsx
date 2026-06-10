'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Pencil, Eraser, Trash2, X, Type, Undo2, MousePointer } from 'lucide-react';
import type { Tool, PenType } from '@/lib/drawing';
import { PRESET_COLORS } from '@/lib/drawing';
import DragScrubber from './DragScrubber';

const BTN      = 52;
const PANEL_W  = 192;
const DRAG_THR = 4;
const POS_KEY  = 'fab-annotation-pos';
const HINT_KEY = 'fab-annotation-hint-seen';

// ─── Small helpers ────────────────────────────────────────────────────────────

function ToolRow({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', height: 32, padding: '0 8px',
        borderRadius: 4,
        border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, fontWeight: active ? 500 : 400,
        textAlign: 'left',
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
      <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function Hr() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '2px 8px' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-3)', display: 'block',
    }}>
      {children}
    </span>
  );
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  penType: PenType;
  setPenType: (p: PenType) => void;
  color: string;
  setColor: (c: string) => void;
  strokeSize: number;
  setStrokeSize: (s: number) => void;
  onClear: () => void;
  onUndo: () => void;
  splitMode?: boolean;
  activeSide?: 'left' | 'right';
  onSwitchSide?: (side: 'left' | 'right') => void;
  containerRef?: React.RefObject<HTMLElement | null>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FloatingAnnotationToolbar({
  isOpen, onOpen, onClose,
  tool, setTool, penType, setPenType,
  color, setColor, strokeSize, setStrokeSize,
  onClear, onUndo, splitMode, activeSide, onSwitchSide,
  containerRef,
}: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showHint, setShowHint]       = useState(false);

  const outerRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);

  // Stable refs so pointer / timer handlers never go stale
  const isOpenRef  = useRef(isOpen);
  const onOpenRef  = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  useEffect(() => { isOpenRef.current  = isOpen;  }, [isOpen]);
  useEffect(() => { onOpenRef.current  = onOpen;  }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const containerRefRef = useRef(containerRef);
  containerRefRef.current = containerRef;

  // Always-current position ref (avoids stale closure in pointer handlers)
  const posRef     = useRef<{ x: number; y: number } | null>(null);
  // Ref so pointer-up can dismiss hint without stale closure
  const showHintRef = useRef(false);

  const updatePos = useCallback((p: { x: number; y: number }) => {
    posRef.current = p;
    setPos(p);
  }, []);

  const dragRef = useRef<{
    startX: number; startY: number;
    originX: number; originY: number;
    hasMoved: boolean;
  } | null>(null);

  // Helper: allowed drag bounds from the container element
  function getBounds() {
    const el = containerRefRef.current?.current;
    if (el) {
      const r = el.getBoundingClientRect();
      return { minX: r.left, minY: r.top, maxX: r.right - BTN, maxY: r.bottom - BTN };
    }
    return {
      minX: 0, minY: 0,
      maxX: window.innerWidth  - BTN,
      maxY: window.innerHeight - BTN,
    };
  }

  // ── Inject CSS keyframes once ──────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('fab-annotation-styles')) return;
    const el = document.createElement('style');
    el.id = 'fab-annotation-styles';
    el.textContent = `
      @keyframes fab-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.45), 0 0 0 0 rgba(37,99,235,0.38); }
        55%       { box-shadow: 0 4px 20px rgba(0,0,0,0.45), 0 0 0 13px rgba(37,99,235,0); }
      }
      @keyframes fab-hint-in {
        from { opacity: 0; transform: translateY(-50%) translateX(10px); }
        to   { opacity: 1; transform: translateY(-50%) translateX(0); }
      }
      @keyframes fab-hint-nudge {
        0%, 100% { transform: translateY(-50%) translateX(0);   }
        50%      { transform: translateY(-50%) translateX(-6px); }
      }
    `;
    document.head.appendChild(el);
  }, []);

  // ── Initial position: restore from localStorage or default to right-centre ──
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const { minX, minY, maxX, maxY } = getBounds();

      const saved = localStorage.getItem(POS_KEY);
      if (saved) {
        try {
          const { x, y } = JSON.parse(saved) as { x: number; y: number };
          const p = {
            x: Math.min(Math.max(x, minX), maxX),
            y: Math.min(Math.max(y, minY), maxY),
          };
          updatePos(p);
          return;
        } catch {
          // fall through to default
        }
      }

      const x    = maxX - 16;
      const midY = Math.round((minY + maxY + BTN) / 2) - Math.round(BTN / 2);
      updatePos({ x, y: Math.min(Math.max(midY, minY + 8), maxY - 8) });
    });
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── First-time hint ────────────────────────────────────────────────────────
  useEffect(() => {
    if (localStorage.getItem(HINT_KEY)) return;

    let outerTimer: ReturnType<typeof setTimeout>;
    let innerTimer: ReturnType<typeof setTimeout>;

    outerTimer = setTimeout(() => {
      if (localStorage.getItem(HINT_KEY)) return;
      showHintRef.current = true;
      setShowHint(true);

      innerTimer = setTimeout(() => {
        showHintRef.current = false;
        setShowHint(false);
        localStorage.setItem(HINT_KEY, '1');
      }, 3000);
    }, 1200);

    return () => {
      clearTimeout(outerTimer);
      clearTimeout(innerTimer);
    };
  }, []);

  // ── Pointer handlers ───────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const originX = posRef.current?.x ?? 0;
    const originY = posRef.current?.y ?? 0;
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      originX, originY,
      hasMoved: false,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.hasMoved && Math.hypot(dx, dy) > DRAG_THR) {
      d.hasMoved = true;
      setIsDragging(true);
    }
    if (d.hasMoved) {
      const { minX, minY, maxX, maxY } = getBounds();
      const newX = Math.min(Math.max(d.originX + dx, minX), maxX);
      const newY = Math.min(Math.max(d.originY + dy, minY), maxY);
      posRef.current = { x: newX, y: newY };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (outerRef.current) {
          outerRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!d) return;

    if (d.hasMoved) {
      if (posRef.current) {
        setPos({ ...posRef.current });
        localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
      }
    } else {
      // It was a tap — toggle panel
      if (isOpenRef.current) onCloseRef.current(); else onOpenRef.current();
      // Also dismiss first-time hint on any tap
      if (showHintRef.current) {
        showHintRef.current = false;
        setShowHint(false);
        localStorage.setItem(HINT_KEY, '1');
      }
    }
  }, []);

  // Not yet mounted client-side
  if (!pos) return null;

  const expandUp      = pos.y > window.innerHeight * 0.45;
  const panelEdge     = expandUp ? { bottom: BTN + 8 } : { top: BTN + 8 };
  const transformOrigin = expandUp ? 'bottom right' : 'top right';

  return (
    <div ref={outerRef} style={{
      position: 'fixed',
      left: 0, top: 0,
      transform: `translate(${pos.x}px, ${pos.y}px)`,
      willChange: 'transform',
      width: BTN, height: BTN,
      zIndex: 200, userSelect: 'none',
    }}>

      {/* ── Expanding panel ── */}
      {isOpen && (
        <div
          className="animate-scale-in glass"
          style={{
            position: 'absolute',
            ...panelEdge,
            right: 0,
            width: PANEL_W,
            borderRadius: 4,
            transformOrigin,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pencil size={11} style={{ color: 'var(--violet)' }} />
              <span style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
                textTransform: 'uppercase', color: 'var(--text-2)',
              }}>
                Annotate
              </span>
              {splitMode && onSwitchSide && (
                <div style={{
                  display: 'flex', gap: 1,
                  background: 'var(--bg-elevated)',
                  borderRadius: 4, padding: 2, marginLeft: 4,
                }}>
                  {(['left', 'right'] as const).map((side) => (
                    <button
                      key={side}
                      onClick={() => onSwitchSide(side)}
                      style={{
                        width: 22, height: 18,
                        borderRadius: 3, fontSize: 9.5, fontWeight: 700,
                        background: activeSide === side ? 'var(--bg-active)' : 'transparent',
                        border: `1px solid ${activeSide === side ? 'var(--border-strong)' : 'transparent'}`,
                        color: activeSide === side ? 'var(--text-1)' : 'var(--text-3)',
                        cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
                        transition: 'background 0.12s, color 0.12s',
                      }}
                    >
                      {side === 'left' ? 'L' : 'R'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, background: 'transparent', border: '1px solid transparent',
                color: 'var(--text-3)', cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
              })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                background: 'transparent', color: 'var(--text-3)', borderColor: 'transparent',
              })}
            >
              <X size={12} />
            </button>
          </div>

          {/* Tool rows */}
          <div style={{ padding: '6px 8px' }}>
            <ToolRow
              active={tool === 'cursor'}
              onClick={() => setTool('cursor')}
              icon={<MousePointer size={13} />}
              label="Cursor"
            />
            <Hr />
            <ToolRow
              active={tool === 'pen' && penType === 'normal'}
              onClick={() => { setTool('pen'); setPenType('normal'); }}
              icon={<div style={{ width: 14, height: 2.5, borderRadius: 9999, background: 'currentColor' }} />}
              label="Pen"
            />
            <ToolRow
              active={tool === 'pen' && penType === 'marker'}
              onClick={() => { setTool('pen'); setPenType('marker'); }}
              icon={<div style={{ width: 14, height: 5, borderRadius: 2, background: 'currentColor', opacity: 0.65 }} />}
              label="Marker"
            />
            <ToolRow
              active={tool === 'pen' && penType === 'highlighter'}
              onClick={() => { setTool('pen'); setPenType('highlighter'); }}
              icon={<div style={{ width: 14, height: 9, borderRadius: 2, background: 'currentColor', opacity: 0.35 }} />}
              label="Highlighter"
            />
            <ToolRow
              active={tool === 'line'}
              onClick={() => setTool('line')}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="4" y1="20" x2="20" y2="4" />
                </svg>
              }
              label="Line"
            />
            <ToolRow
              active={tool === 'text'}
              onClick={() => setTool('text')}
              icon={<Type size={13} />}
              label="Text Note"
            />
            <ToolRow
              active={tool === 'eraser'}
              onClick={() => setTool('eraser')}
              icon={<Eraser size={13} />}
              label="Eraser"
            />
          </div>

          <Hr />

          {/* Color */}
          <div style={{ padding: '8px 12px' }}>
            <SectionLabel>Color</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
                  title={c}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c,
                    border: 'none', cursor: 'pointer', flexShrink: 0,
                    outline: color === c && tool !== 'eraser'
                      ? '2px solid var(--accent-hover)' : '1.5px solid transparent',
                    outlineOffset: 2,
                    transform: color === c && tool !== 'eraser' ? 'scale(1.18)' : 'scale(1)',
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
                  width: 20, height: 20,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 4, background: 'var(--bg-input)',
                  padding: 0, cursor: 'pointer',
                }}
              />
            </div>
          </div>

          <Hr />

          {/* Size */}
          <div style={{ padding: '8px 12px' }}>
            <SectionLabel>Size</SectionLabel>
            <div style={{ marginTop: 6 }}>
              <DragScrubber value={strokeSize} onChange={setStrokeSize} />
            </div>
          </div>

          <Hr />

          {/* Undo + Clear */}
          <div style={{ padding: '6px 8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={onUndo}
              style={{
                width: '100%', height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 4, border: '1px solid transparent',
                background: 'transparent', color: 'var(--text-2)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
              })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
              })}
            >
              <Undo2 size={12} />
              Undo
            </button>
            <button
              onClick={onClear}
              style={{
                width: '100%', height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 4, border: '1px solid transparent',
                background: 'transparent', color: 'var(--red)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, {
                background: 'var(--red-muted)', borderColor: 'rgba(229,72,77,.2)',
              })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, {
                background: 'transparent', borderColor: 'transparent',
              })}
            >
              <Trash2 size={12} />
              Clear page
            </button>
          </div>
        </div>
      )}

      {/* ── Tooltip ── */}
      {showTooltip && !isDragging && !isOpen && (
        <div style={{
          position: 'absolute',
          bottom: BTN + 10,
          left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,15,15,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-1)',
          fontSize: 11.5, fontWeight: 500,
          whiteSpace: 'nowrap',
          padding: '5px 11px',
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 1,
        }}>
          Annotation Tools
          {/* Downward arrow */}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid var(--border)',
          }} />
        </div>
      )}

      {/* ── First-time hint: arrow + label to the left of the button ── */}
      {showHint && (
        <div style={{
          position: 'absolute',
          right: BTN + 12,
          top: '50%',
          display: 'flex', alignItems: 'center', gap: 7,
          animation: 'fab-hint-in 0.4s ease forwards, fab-hint-nudge 1.3s ease-in-out 0.4s infinite',
          pointerEvents: 'none',
          zIndex: 2,
        }}>
          <div style={{
            background: 'rgba(15,15,15,0.9)',
            color: '#fff',
            padding: '6px 13px',
            borderRadius: 4,
            fontSize: 12.5, fontWeight: 600,
            whiteSpace: 'nowrap',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            Tap to annotate
          </div>
          {/* Arrow pointing right toward the button */}
          <div style={{
            width: 0, height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: '9px solid rgba(15,15,15,0.9)',
            flexShrink: 0,
          }} />
        </div>
      )}

      {/* ── Tool mode indicator (visible when toolbar is closed) ── */}
      {!isOpen && !isDragging && !showHint && (
        <div
          style={{
            position: 'absolute',
            right: BTN + 8,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(15,15,15,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '4px 9px 4px 7px',
            whiteSpace: 'nowrap',
          }}
        >
          {tool === 'cursor' ? (
            <MousePointer size={11} style={{ color: 'rgba(200,200,200,0.85)', flexShrink: 0 }} />
          ) : tool === 'eraser' ? (
            <Eraser size={11} style={{ color: 'rgba(200,200,200,0.85)', flexShrink: 0 }} />
          ) : tool === 'text' ? (
            <Type size={11} style={{ color: 'rgba(200,200,200,0.85)', flexShrink: 0 }} />
          ) : tool === 'line' ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <line x1="4" y1="20" x2="20" y2="4" />
            </svg>
          ) : (
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flexShrink: 0,
                          }} />
          )}
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: 'rgba(226,226,226,0.9)',
          }}>
            {tool === 'cursor' ? 'Cursor'
              : tool === 'eraser' ? 'Eraser'
              : tool === 'text' ? 'Text'
              : tool === 'line' ? 'Line'
              : penType === 'normal' ? 'Pen'
              : penType === 'marker' ? 'Marker'
              : 'Highlight'}
          </span>
        </div>
      )}

      {/* ── Circular trigger / drag handle ── */}
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label="Annotation Tools"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `1.5px solid ${isOpen ? 'rgba(37,99,235,.6)' : 'var(--border-strong)'}`,
          background: isOpen ? 'var(--accent-muted)' : 'var(--bg-elevated)',
          color: isOpen ? 'var(--accent-hover)' : 'var(--text-1)',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // Pulse only when closed and not being dragged
          animation: !isOpen && !isDragging ? 'fab-pulse 2.6s ease-in-out infinite' : 'none',
          transition: isDragging
            ? 'box-shadow 0.1s'
            : 'background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s',
        }}
      >
        {tool === 'cursor'
          ? <MousePointer size={20} strokeWidth={1.75} />
          : <Pencil size={22} strokeWidth={1.75} />
        }
      </button>
    </div>
  );
}
