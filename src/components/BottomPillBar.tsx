'use client';
import { useRef, useState, useEffect } from 'react';
import {
  StickyNote, Pencil, Highlighter, Type, ImagePlus, Bookmark,
  Mic, Trash2, Users, Eraser, X, FilePlus,
  Maximize2, Minimize2, ChevronDown,
} from 'lucide-react';
import type { Tool, PenType } from '@/lib/drawing';
import { PRESET_COLORS } from '@/lib/drawing';
import DragScrubber from './DragScrubber';
import type { PDFPageImage } from '@/types';

/**
 * Horizontal pill bar that sits centred at the bottom of the workspace
 * main column, above PageNavigation. Replaces the draggable
 * FloatingAnnotationToolbar fab and absorbs the workspace-tool sections
 * that used to live in the right-panel "Tools" tab.
 *
 * Pills (left → right):
 *   Note · Draw · Highlight · Text · Image · Bookmark · Voice
 *   ──
 *   Clear · Study Room · Fullscreen
 *
 * Cursor and Undo are keyboard-only (Esc / Ctrl+Z).
 */

const AMBER = '#f59e0b';

interface Props {
  hasDocument: boolean;
  visible:     boolean;
  isBlankPage: boolean;
  isPPTX:      boolean;

  // Tool state
  tool:        Tool;
  setTool:     (t: Tool) => void;
  penType:     PenType;
  setPenType:  (p: PenType) => void;
  color:       string;
  setColor:    (c: string) => void;
  strokeSize:  number;
  setStrokeSize: (s: number) => void;

  // Note pill
  onActivateNotes: () => void;

  // Image pill (one of these will be set depending on page type)
  onInsertImageBlank?:    (dataUrl: string) => void;
  onAddImageToPage?:      (dataUrl: string) => void;
  onAddImageAsNewPage?:   (dataUrl: string) => void;
  docPageImages?:         Record<number, PDFPageImage[]>;
  currentPdfPageForImages?: number | null;
  onDeletePageImage?:     (pageNumber: number, imageId: string) => void;

  // Bookmark pill
  onToggleBookmark?: () => void;
  isBookmarked?:     boolean;

  // Voice pill
  onVoiceNote?: () => void;
  isRecording?: boolean;

  // Clear + Study Room
  onClearAllDrawings?: () => void;
  onCreateRoom?:       () => void;

  // Split-mode side picker (shown in popovers)
  splitMode?:    boolean;
  activeSide?:   'left' | 'right';
  onSwitchSide?: (side: 'left' | 'right') => void;

  // Fullscreen
  isFullscreen?:      boolean;
  onToggleFullscreen?: () => void;
}

// ── PillButton ────────────────────────────────────────────────────────────────

function PillButton({
  icon, label, active, onClick, danger, accent, amber, dropdown, disabled, badge,
  innerRef,
}: {
  icon:     React.ReactNode;
  label:    string;
  active?:  boolean;
  onClick?: () => void;
  danger?:  boolean;
  accent?:  boolean;
  amber?:   boolean;
  dropdown?: boolean;
  disabled?: boolean;
  badge?:   React.ReactNode;
  innerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const fgIdle =
    danger ? 'var(--red)' :
    accent ? 'var(--accent)' :
    amber  ? AMBER :
    'var(--text-2)';

  const fgActive =
    danger ? 'var(--red)' :
    amber  ? AMBER :
    'var(--accent)';

  const bgActive =
    danger ? 'var(--red-muted)' :
    amber  ? 'rgba(245,158,11,0.15)' :
    'var(--accent-muted)';

  const borderActive =
    danger ? 'var(--red)' :
    amber  ? AMBER :
    'var(--accent)';

  return (
    <button
      ref={innerRef}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 4,
        height: 34, padding: dropdown ? '0 9px 0 12px' : '0 12px',
        borderRadius: 9999,
        border: `1px solid ${active ? borderActive : 'transparent'}`,
        background: active ? bgActive : 'transparent',
        color: active ? fgActive : fgIdle,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (disabled || active) return;
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
      }}
      onMouseOut={(e) => {
        if (disabled || active) return;
        (e.currentTarget as HTMLElement).style.background = 'transparent';
        (e.currentTarget as HTMLElement).style.color = fgIdle;
      }}
    >
      {icon}
      {badge}
      {dropdown && (
        <ChevronDown size={10} strokeWidth={2.5} style={{ opacity: 0.6, marginLeft: 1 }} />
      )}
    </button>
  );
}

// ── Section + small helpers ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-3)', display: 'block', marginBottom: 6,
    }}>
      {children}
    </span>
  );
}

function Hr() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />;
}

function ColorRow({
  color, setColor,
}: { color: string; setColor: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => setColor(c)}
          title={c}
          style={{
            width: 20, height: 20, borderRadius: '50%', background: c,
            border: 'none', cursor: 'pointer', flexShrink: 0,
            outline: color === c ? '2px solid var(--accent)' : '1.5px solid transparent',
            outlineOffset: 2,
            transform: color === c ? 'scale(1.18)' : 'scale(1)',
            transition: 'transform 0.12s',
          }}
        />
      ))}
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        title="Custom color"
        style={{
          width: 20, height: 20,
          border: '1px solid var(--border-strong)',
          borderRadius: 4, background: 'var(--bg-elevated)',
          padding: 0, cursor: 'pointer',
        }}
      />
    </div>
  );
}

// ── Sub-tool row used inside the Draw popover ─────────────────────────────────

function SubToolRow({
  active, onClick, icon, label,
}: {
  active:  boolean;
  onClick: () => void;
  icon:    React.ReactNode;
  label:   string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', height: 30, padding: '0 8px',
        borderRadius: 4,
        border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
        background: active ? 'var(--accent-muted)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-1)',
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, fontWeight: active ? 600 : 500,
        textAlign: 'left',
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
      }}
      onMouseOut={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BottomPillBar({
  hasDocument, visible, isBlankPage, isPPTX,
  tool, setTool, penType, setPenType, color, setColor, strokeSize, setStrokeSize,
  onActivateNotes,
  onInsertImageBlank, onAddImageToPage, onAddImageAsNewPage,
  docPageImages, currentPdfPageForImages, onDeletePageImage,
  onToggleBookmark, isBookmarked = false,
  onVoiceNote, isRecording = false,
  onClearAllDrawings, onCreateRoom,
  splitMode, activeSide, onSwitchSide,
  isFullscreen, onToggleFullscreen,
}: Props) {
  const drawBtnRef      = useRef<HTMLButtonElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);
  const imageBtnRef     = useRef<HTMLButtonElement>(null);

  const [drawOpen,      setDrawOpen]      = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);

  const blankFileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef   = useRef<HTMLInputElement>(null);

  const [addImageData,  setAddImageData]  = useState<string | null>(null);
  const [removeImgOpen, setRemoveImgOpen] = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(false);

  // Close popovers on outside-click / Escape
  useEffect(() => {
    if (!drawOpen && !highlightOpen && !imageMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (drawBtnRef.current?.closest('[data-pill-root]')?.contains(t)) return;
      setDrawOpen(false); setHighlightOpen(false); setImageMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawOpen(false); setHighlightOpen(false); setImageMenuOpen(false); }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [drawOpen, highlightOpen, imageMenuOpen]);

  if (!hasDocument || !visible) return null;

  // ── Pill active-state predicates ────────────────────────────────────────────
  const drawActive      = (tool === 'pen' && penType !== 'highlighter') || tool === 'line' || tool === 'eraser';
  const highlightActive = tool === 'pen' && penType === 'highlighter';
  const textActive      = tool === 'text';

  // ── Image pill actions ──────────────────────────────────────────────────────
  const canInsertOnBlank  = isBlankPage && !!onInsertImageBlank;
  const canInsertOnPdf    = !isBlankPage && !isPPTX && (!!onAddImageToPage || !!onAddImageAsNewPage);
  const canInsert         = canInsertOnBlank || canInsertOnPdf;
  const hasAnyPageImages  = !!docPageImages && Object.values(docPageImages).some((imgs) => imgs.length > 0);
  const canManage         = hasAnyPageImages && !!onDeletePageImage;

  const triggerFilePicker = () => {
    setImageMenuOpen(false);
    if (canInsertOnBlank) blankFileRef.current?.click();
    else if (canInsertOnPdf) pdfFileRef.current?.click();
  };

  // Pop content: Draw + Highlight share the color/stroke section
  const Popover = ({
    children, anchorRef,
  }: { children: React.ReactNode; anchorRef: React.RefObject<HTMLButtonElement | null> }) => (
    <div
      style={{
        position: 'absolute', left: anchorRef.current?.offsetLeft ?? 0,
        bottom: '100%', marginBottom: 8,
        minWidth: 220,
        background: 'var(--bg-float)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--bg-float-border)',
        boxShadow: 'var(--shadow-float)',
        borderRadius: 10,
        padding: '10px 12px',
        zIndex: 60,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  return (
    <>
      <div
        data-pill-root
        role="toolbar"
        aria-label="Workspace tools"
        style={{
          position: 'absolute', left: '50%', bottom: 60,
          transform: 'translateX(-50%)',
          zIndex: 30,
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '5px 6px',
          background: 'var(--bg-float)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--bg-float-border)',
          boxShadow: 'var(--shadow-float)',
          borderRadius: 9999,
          maxWidth: 'calc(100% - 32px)',
          flexWrap: 'nowrap',
        }}
      >
        {/* Note */}
        <PillButton
          label="Open notes"
          icon={<StickyNote size={15} strokeWidth={1.8} />}
          onClick={onActivateNotes}
        />

        {/* Draw */}
        <div style={{ position: 'relative' }}>
          <PillButton
            innerRef={drawBtnRef}
            label="Draw"
            icon={<Pencil size={15} strokeWidth={1.8} />}
            active={drawActive}
            dropdown
            onClick={() => {
              if (!drawActive) { setTool('pen'); setPenType('normal'); }
              setHighlightOpen(false); setImageMenuOpen(false);
              setDrawOpen((o) => !o);
            }}
          />
          {drawOpen && (
            <Popover anchorRef={drawBtnRef}>
              {splitMode && onSwitchSide && (
                <>
                  <SectionLabel>Side</SectionLabel>
                  <div style={{ display: 'flex', gap: 1, background: 'var(--bg-elevated)', borderRadius: 4, padding: 2, marginBottom: 8 }}>
                    {(['left', 'right'] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => onSwitchSide(side)}
                        style={{
                          flex: 1, height: 22, borderRadius: 3,
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                          background: activeSide === side ? 'var(--bg-active)' : 'transparent',
                          border: `1px solid ${activeSide === side ? 'var(--border-strong)' : 'transparent'}`,
                          color: activeSide === side ? 'var(--text-1)' : 'var(--text-3)',
                          cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
                        }}
                      >
                        {side === 'left' ? 'L' : 'R'}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <SectionLabel>Tool</SectionLabel>
              <SubToolRow
                active={tool === 'pen' && penType === 'normal'}
                onClick={() => { setTool('pen'); setPenType('normal'); }}
                icon={<div style={{ width: 14, height: 2.5, borderRadius: 9999, background: 'currentColor' }} />}
                label="Pen"
              />
              <SubToolRow
                active={tool === 'pen' && penType === 'marker'}
                onClick={() => { setTool('pen'); setPenType('marker'); }}
                icon={<div style={{ width: 14, height: 5, borderRadius: 2, background: 'currentColor', opacity: 0.65 }} />}
                label="Marker"
              />
              <SubToolRow
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
              <SubToolRow
                active={tool === 'eraser'}
                onClick={() => setTool('eraser')}
                icon={<Eraser size={13} />}
                label="Eraser"
              />

              <Hr />
              <SectionLabel>Color</SectionLabel>
              <ColorRow color={color} setColor={(c) => { setColor(c); if (tool === 'eraser') setTool('pen'); }} />

              <Hr />
              <SectionLabel>Size</SectionLabel>
              <DragScrubber value={strokeSize} onChange={setStrokeSize} />
            </Popover>
          )}
        </div>

        {/* Highlight */}
        <div style={{ position: 'relative' }}>
          <PillButton
            innerRef={highlightBtnRef}
            label="Highlight"
            icon={<Highlighter size={15} strokeWidth={1.8} />}
            active={highlightActive}
            dropdown
            onClick={() => {
              if (!highlightActive) { setTool('pen'); setPenType('highlighter'); }
              setDrawOpen(false); setImageMenuOpen(false);
              setHighlightOpen((o) => !o);
            }}
          />
          {highlightOpen && (
            <Popover anchorRef={highlightBtnRef}>
              <SectionLabel>Highlighter color</SectionLabel>
              <ColorRow color={color} setColor={setColor} />
              <Hr />
              <SectionLabel>Size</SectionLabel>
              <DragScrubber value={strokeSize} onChange={setStrokeSize} />
            </Popover>
          )}
        </div>

        {/* Text */}
        <PillButton
          label="Text note"
          icon={<Type size={15} strokeWidth={1.8} />}
          active={textActive}
          onClick={() => setTool(textActive ? 'cursor' : 'text')}
        />

        {/* Image */}
        <div style={{ position: 'relative' }}>
          <PillButton
            innerRef={imageBtnRef}
            label="Insert image"
            icon={<ImagePlus size={15} strokeWidth={1.8} />}
            disabled={!canInsert && !canManage}
            dropdown
            onClick={() => {
              setDrawOpen(false); setHighlightOpen(false);
              setImageMenuOpen((o) => !o);
            }}
          />
          {imageMenuOpen && (
            <div
              style={{
                position: 'absolute', left: imageBtnRef.current?.offsetLeft ?? 0,
                bottom: '100%', marginBottom: 8,
                minWidth: 180,
                background: 'var(--bg-float)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid var(--bg-float-border)',
                boxShadow: 'var(--shadow-float)',
                borderRadius: 10,
                padding: 4,
                zIndex: 60,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={triggerFilePicker}
                disabled={!canInsert}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', height: 32, padding: '0 10px',
                  borderRadius: 6, background: 'transparent', border: 'none',
                  color: canInsert ? 'var(--text-1)' : 'var(--text-3)',
                  cursor: canInsert ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, textAlign: 'left',
                  transition: 'background 0.12s',
                  opacity: canInsert ? 1 : 0.55,
                }}
                onMouseOver={(e) => { if (canInsert) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <ImagePlus size={13} />
                Insert image…
              </button>
              <button
                onClick={() => { setImageMenuOpen(false); setRemoveImgOpen(true); }}
                disabled={!canManage}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', height: 32, padding: '0 10px',
                  borderRadius: 6, background: 'transparent', border: 'none',
                  color: canManage ? 'var(--text-1)' : 'var(--text-3)',
                  cursor: canManage ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, textAlign: 'left',
                  transition: 'background 0.12s',
                  opacity: canManage ? 1 : 0.55,
                }}
                onMouseOver={(e) => { if (canManage) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Trash2 size={13} />
                Manage page images
              </button>
            </div>
          )}
        </div>

        {/* Bookmark */}
        {onToggleBookmark && (
          <PillButton
            label={isBookmarked ? 'Remove bookmark' : 'Bookmark page'}
            icon={<Bookmark size={15} strokeWidth={1.8} fill={isBookmarked ? AMBER : 'none'} />}
            active={isBookmarked}
            amber
            onClick={onToggleBookmark}
          />
        )}

        {/* Voice */}
        <PillButton
          label={isRecording ? 'Recording…' : 'Voice note'}
          icon={<Mic size={15} strokeWidth={1.8} />}
          active={isRecording}
          danger={isRecording}
          disabled={!onVoiceNote}
          onClick={onVoiceNote}
          badge={isRecording ? (
            <span className="rec-dot" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--red)', flexShrink: 0, marginLeft: 2,
            }} />
          ) : null}
        />

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />

        {/* Clear */}
        {onClearAllDrawings && !isBlankPage && !isPPTX && (
          <PillButton
            label="Clear all drawings"
            icon={<Trash2 size={15} strokeWidth={1.8} />}
            danger
            onClick={() => setConfirmClear(true)}
          />
        )}

        {/* Study Room */}
        {onCreateRoom && (
          <PillButton
            label="Study Room"
            icon={<Users size={15} strokeWidth={1.8} />}
            accent
            onClick={onCreateRoom}
          />
        )}

        {/* Fullscreen */}
        {onToggleFullscreen && (
          <PillButton
            label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            icon={isFullscreen ? <Minimize2 size={14} strokeWidth={1.8} /> : <Maximize2 size={14} strokeWidth={1.8} />}
            active={isFullscreen}
            onClick={onToggleFullscreen}
          />
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={blankFileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !onInsertImageBlank) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') onInsertImageBlank(reader.result);
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />
      <input
        ref={pdfFileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') setAddImageData(reader.result);
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />

      {/* AddImage picker modal (PDF pages only) */}
      {addImageData && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setAddImageData(null)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4, overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImagePlus size={15} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Add Image</span>
              </div>
              <button
                onClick={() => setAddImageData(null)}
                style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: '1px solid transparent',
                  background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{
              padding: '16px 20px 12px',
              display: 'flex', justifyContent: 'center',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={addImageData}
                alt="Selected"
                style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 4, objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 4px', lineHeight: 1.5 }}>
                Where would you like to add this image?
              </p>

              {onAddImageToPage && (
                <button
                  onClick={() => { onAddImageToPage(addImageData); setAddImageData(null); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.13s, background 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', background: 'var(--bg-hover)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ImagePlus size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Add to current page</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>Overlay on the current PDF page as an annotation</p>
                  </div>
                </button>
              )}

              {onAddImageAsNewPage && (
                <button
                  onClick={() => { onAddImageAsNewPage(addImageData); setAddImageData(null); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 0.13s, background 0.13s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', background: 'var(--bg-hover)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', background: 'var(--bg-elevated)' })}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FilePlus size={15} style={{ color: 'var(--text-2)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Add as new page</p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>Create a new blank page with this image on it</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clear All Drawings confirm modal */}
      {confirmClear && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setConfirmClear(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4, overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eraser size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Clear All Drawings</span>
              </div>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.6, margin: '0 0 8px' }}>
                Are you sure? This will permanently remove all drawings from this document.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                Voice notes and text notes will not be affected.
              </p>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ height: 32, padding: '0 16px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onClearAllDrawings?.(); setConfirmClear(false); }}
                style={{ height: 32, padding: '0 16px', borderRadius: 4, background: 'var(--red)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Eraser size={13} />
                Clear All Drawings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Images manage modal */}
      {removeImgOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setRemoveImgOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImagePlus size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Page Images</span>
              </div>
              <button onClick={() => setRemoveImgOpen(false)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!docPageImages || Object.values(docPageImages).every((imgs) => imgs.length === 0) ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: 16 }}>
                  No images on this document.
                </p>
              ) : (
                Object.entries(docPageImages)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .flatMap(([pageStr, imgs]) => imgs.map((img) => ({ img, pageNumber: Number(pageStr) })))
                  .map(({ img, pageNumber }) => {
                    const isCurrentPage = pageNumber === currentPdfPageForImages;
                    return (
                      <div
                        key={`${pageNumber}:${img.id}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 12px', borderRadius: 4,
                          background: isCurrentPage ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                          border: `1px solid ${isCurrentPage ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
                            Page {pageNumber}
                            {isCurrentPage && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-2)', fontWeight: 500 }}>Current</span>}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                            {Math.round(img.width * 100)}% × {Math.round(img.height * 100)}%
                          </p>
                        </div>
                        <button
                          onClick={() => { onDeletePageImage?.(pageNumber, img.id); }}
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '1px solid transparent', background: 'transparent', color: 'var(--red)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'var(--red-muted)'; e.currentTarget.style.borderColor = 'var(--red)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                          title="Delete image"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
