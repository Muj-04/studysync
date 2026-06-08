'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import type { TextNote } from '@/types';

const DRAG_THRESHOLD = 4;
const HANDLE_H = 14; // px height of the top drag-handle strip

// ── NoteItem ──────────────────────────────────────────────────────────────────

interface NoteItemProps {
  note: TextNote;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onConfirm: () => void;
  onChange: (note: TextNote) => void;
  onDelete: () => void;
  onDragStart: (clientX: number, clientY: number) => void;
  onResizeStart: (clientX: number, clientY: number) => void;
  onCancelDrag: () => void;
}

function NoteItem({
  note, isEditing, isSelected,
  onSelect, onStartEdit, onStopEdit, onConfirm, onChange, onDelete,
  onDragStart, onResizeStart, onCancelDrag,
}: NoteItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus + auto-size on edit start
  useEffect(() => {
    if (isEditing) {
      const raf = requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
        ta.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isEditing]);

  const showBorder  = isSelected || isEditing;
  const showHandle  = isSelected && !isEditing;
  const minH        = note.fontSize * 1.55 + 12; // 1 line + padding

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Grow the textarea with content, never shrink below one line
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    onChange({ ...note, content: e.target.value });
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${note.x}%`, top: `${note.y}%`,
        width: `${note.width}%`,
        height: 'auto',
        minHeight: minH,
        border: showBorder
          ? `1px dashed ${isEditing ? 'rgba(120,120,140,0.65)' : 'rgba(255,255,255,0.5)'}`
          : 'none',
        borderRadius: 4,
        background: 'transparent',
        pointerEvents: 'auto',
        userSelect: isEditing ? 'text' : 'none',
        overflow: 'visible',
        cursor: isEditing ? 'text' : 'move',
      }}
      onPointerDown={(e) => {
        if (isEditing) return;
        // stopPropagation keeps the event from reaching canvas siblings.
        // Do NOT call preventDefault — that suppresses dblclick.
        e.stopPropagation();
        onSelect();
        onDragStart(e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onCancelDrag();
        onStartEdit();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Drag handle strip — top of box, visible when selected ─────────── */}
      {showHandle && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: HANDLE_H,
            background: 'rgba(89,101,217,0.10)',
            borderRadius: '3px 3px 0 0',
            cursor: 'grab',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
            onDragStart(e.clientX, e.clientY);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 2.5, height: 2.5, borderRadius: '50%',
              background: 'rgba(255,255,255,0.5)',
            }} />
          ))}
        </div>
      )}

      {/* ── Confirm button — appears while editing ────────────────────────── */}
      {isEditing && (
        <button
          title="Done — save and switch back to pen"
          style={{
            position: 'absolute',
            left: '100%', top: 0, marginLeft: 6,
            width: 26, height: 26,
            borderRadius: 6,
            background: '#ffffff',
            border: 'none',
            color: '#0f172a',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, lineHeight: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.32)',
            zIndex: 2, flexShrink: 0, fontFamily: 'inherit',
          }}
          onMouseDown={(e) => e.preventDefault()} // keep textarea focused
          onClick={(e) => { e.stopPropagation(); onConfirm(); }}
        >
          ✓
        </button>
      )}

      {/* ── Mini toolbar — visible when selected and not editing ──────────── */}
      {isSelected && !isEditing && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%', left: 0, marginBottom: 4,
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--bg-panel)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '2px 3px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
            zIndex: 1, whiteSpace: 'nowrap',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ToolBtn
            title="Decrease font size"
            onClick={() => onChange({ ...note, fontSize: Math.max(8, note.fontSize - 2) })}
          >
            A−
          </ToolBtn>
          <ToolBtn
            title="Increase font size"
            onClick={() => onChange({ ...note, fontSize: Math.min(40, note.fontSize + 2) })}
          >
            A+
          </ToolBtn>
          <input
            type="color"
            value={note.color}
            onChange={(e) => onChange({ ...note, color: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 20, height: 20,
              border: '1px solid var(--border)', borderRadius: 3,
              padding: 1, background: 'var(--bg-input)', cursor: 'pointer',
            }}
            title="Text color"
          />
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 1px' }} />
          <ToolBtn
            title="Delete note"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            danger
          >
            <Trash2 size={11} />
          </ToolBtn>
        </div>
      )}

      {/* ── Text content ──────────────────────────────────────────────────── */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          autoFocus
          value={note.content}
          onChange={handleChange}
          onBlur={onStopEdit}
          onKeyDown={(e) => {
            e.stopPropagation(); // prevent global shortcuts while typing
            if (e.key === 'Escape') onStopEdit();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            minHeight: minH,
            border: 'none', outline: 'none',
            resize: 'none', background: 'transparent',
            overflow: 'hidden',
            fontSize: note.fontSize, color: note.color,
            fontFamily: 'inherit', lineHeight: 1.55,
            padding: '6px 8px', boxSizing: 'border-box',
            cursor: 'text',
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: 'auto',
          fontSize: note.fontSize, color: note.color,
          fontFamily: 'inherit', lineHeight: 1.55,
          // push text below the drag handle when it is visible
          padding: showHandle
            ? `${HANDLE_H + 4}px 8px 6px`
            : '6px 8px',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          boxSizing: 'border-box',
          minHeight: minH,
        }}>
          {note.content}
        </div>
      )}

      {/* ── Resize handle — bottom-right corner ───────────────────────────── */}
      {isSelected && (
        <div
          style={{
            position: 'absolute', right: -5, bottom: -5,
            width: 12, height: 12,
            background: '#ffffff', border: '2px solid rgba(0,0,0,0.3)',
            borderRadius: 2, cursor: 'nwse-resize', pointerEvents: 'auto',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onResizeStart(e.clientX, e.clientY);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

function ToolBtn({
  children, onClick, title, danger = false,
}: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 4,
        background: 'transparent', border: '1px solid transparent',
        color: danger ? 'var(--red)' : 'var(--text-2)',
        cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        background: danger ? 'var(--red-muted)' : 'var(--bg-hover)',
        color: danger ? 'var(--red)' : 'var(--text-1)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        background: 'transparent',
        color: danger ? 'var(--red)' : 'var(--text-2)',
      })}
    >
      {children}
    </button>
  );
}

// ── TextNotesLayer ────────────────────────────────────────────────────────────

interface Props {
  notes: TextNote[];
  onChange: (notes: TextNote[]) => void;
  toolActive: boolean;
  onActivateTextTool?: () => void;
  onExitTextTool?: () => void;
}

export default function TextNotesLayer({
  notes, onChange, toolActive, onExitTextTool,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  // Cursor indicator position (only used when toolActive)
  const [hoverPos, setHoverPos]     = useState<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const notesRef = useRef(notes);
  notesRef.current = notes;

  const dragRef = useRef<{
    noteId: string;
    startX: number; startY: number;
    origX: number; origY: number;
    noteW: number; noteH: number;
    hasMoved: boolean;
  } | null>(null);

  const resizeRef = useRef<{
    noteId: string;
    startX: number; startY: number;
    origW: number; origH: number;
  } | null>(null);

  const cancelDrag = useCallback(() => { dragRef.current = null; }, []);

  // Clear hover indicator when text tool is deactivated
  useEffect(() => {
    if (!toolActive) setHoverPos(null);
  }, [toolActive]);

  const handleCreateClick = useCallback((e: React.MouseEvent) => {
    if (!toolActive || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;

    const newNote: TextNote = {
      id: crypto.randomUUID(),
      x: Math.max(0, Math.min(78, x)),
      y: Math.max(0, Math.min(95, y)),
      width: 20,  // narrower initial width
      height: 5,  // kept for API compat; actual height is CSS auto
      content: '',
      fontSize: 13,
      color: '#222222',
    };
    onChange([...notesRef.current, newNote]);
    setEditingId(newNote.id);
    setSelectedId(newNote.id);
    setHoverPos(null);
  }, [toolActive, onChange]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const rawDx = e.clientX - d.startX;
      const rawDy = e.clientY - d.startY;
      if (!d.hasMoved) {
        if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD) return;
        d.hasMoved = true;
      }
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = (rawDx / rect.width)  * 100;
      const dy = (rawDy / rect.height) * 100;
      onChange(notesRef.current.map(n =>
        n.id !== d.noteId ? n : {
          ...n,
          x: Math.max(0, Math.min(100 - d.noteW, d.origX + dx)),
          y: Math.max(0, Math.min(100 - d.noteH, d.origY + dy)),
        },
      ));
    } else if (resizeRef.current) {
      const r = resizeRef.current;
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - r.startX) / rect.width)  * 100;
      const dy = ((e.clientY - r.startY) / rect.height) * 100;
      onChange(notesRef.current.map(n =>
        n.id !== r.noteId ? n : {
          ...n,
          width:  Math.max(10, Math.min(70, r.origW + dx)),
          height: Math.max(5,  Math.min(80, r.origH + dy)),
        },
      ));
    }
  }, [onChange]);

  const handlePointerUp = useCallback(() => {
    dragRef.current   = null;
    resizeRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup',   handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup',   handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Deselect / stop editing when clicking outside this layer
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSelectedId(null);
        setEditingId(null);
      }
    };
    window.addEventListener('mousedown', fn);
    return () => window.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedId(null); setEditingId(null); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
    >
      {notes.map(note => (
        <NoteItem
          key={note.id}
          note={note}
          isEditing={editingId === note.id}
          isSelected={selectedId === note.id}
          onSelect={() => setSelectedId(note.id)}
          onStartEdit={() => { setEditingId(note.id); setSelectedId(note.id); }}
          onStopEdit={() => setEditingId(null)}
          onConfirm={() => {
            const current = notesRef.current.find(n => n.id === note.id);
            if (!current?.content.trim()) {
              onChange(notesRef.current.filter(n => n.id !== note.id));
            }
            setEditingId(null);
            setSelectedId(null);
            onExitTextTool?.();
          }}
          onChange={(updated) => onChange(notesRef.current.map(n => n.id === note.id ? updated : n))}
          onDelete={() => {
            onChange(notesRef.current.filter(n => n.id !== note.id));
            setSelectedId(null);
            setEditingId(null);
          }}
          onDragStart={(clientX, clientY) => {
            dragRef.current = {
              noteId: note.id,
              startX: clientX, startY: clientY,
              origX: note.x, origY: note.y,
              noteW: note.width, noteH: note.height,
              hasMoved: false,
            };
          }}
          onResizeStart={(clientX, clientY) => {
            resizeRef.current = {
              noteId: note.id,
              startX: clientX, startY: clientY,
              origW: note.width, origH: note.height,
            };
          }}
          onCancelDrag={cancelDrag}
        />
      ))}

      {/* Click-to-create overlay — only active when text tool is selected.
          zIndex: -1 keeps it behind existing notes so they stay interactive. */}
      {toolActive && (
        <div
          style={{
            position: 'absolute', inset: 0,
            pointerEvents: 'auto',
            cursor: 'none', // hide system cursor; we render our own I-beam
            zIndex: -1,
          }}
          onClick={handleCreateClick}
          onMouseMove={(e) => {
            if (!wrapperRef.current) return;
            const rect = wrapperRef.current.getBoundingClientRect();
            setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onMouseLeave={() => setHoverPos(null)}
        />
      )}

      {/* Custom I-beam cursor indicator — follows the mouse over empty areas */}
      {toolActive && hoverPos && (
        <svg
          width={14} height={22}
          viewBox="0 0 14 22"
          style={{
            position: 'absolute',
            left: hoverPos.x - 7,
            top:  hoverPos.y - 11,
            pointerEvents: 'none',
            zIndex: 20,
            overflow: 'visible',
            filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.4))',
          }}
        >
          {/* Top bar */}
          <line x1="1" y1="1.5" x2="13" y2="1.5" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
          {/* Stem */}
          <line x1="7" y1="1.5" x2="7"  y2="20.5" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" />
          {/* Bottom bar */}
          <line x1="1" y1="20.5" x2="13" y2="20.5" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
