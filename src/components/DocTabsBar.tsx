'use client';

import { useState } from 'react';
import { FileText, Presentation, X } from 'lucide-react';
import {
  DndContext, closestCenter, DragOverlay,
  MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  horizontalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PDFDocument } from '@/types';

/**
 * Horizontal multi-document tabs row, rendered between the workspace
 * header (56px) and the main content area. Matches the reference
 * design: each tab is a small file-icon + filename pill, the active
 * tab gets a soft `--bg-panel` background and a 2px violet
 * underline. Hover reveals a close × on each tab.
 *
 * Drag-reorder is supported via @dnd-kit (horizontal axis) — the
 * machinery was previously inside SidebarThumbnails's vertical
 * document list, which has been retired in favour of this row.
 *
 * Returns null when no documents are open (so the workspace doesn't
 * show an empty strip on first load).
 */

interface Props {
  documents:        PDFDocument[];
  activeDocumentId: string | null;
  onSelect:         (id: string) => void;
  onRemove:         (id: string) => void;
  onReorder?:       (ids: string[]) => void;
}

export default function DocTabsBar({
  documents, activeDocumentId, onSelect, onRemove, onReorder,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor,    { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,    { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = documents.findIndex((d) => d.id === active.id);
    const newIndex = documents.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder?.(arrayMove(documents.map((d) => d.id), oldIndex, newIndex));
  };

  const draggingDoc = draggingId ? documents.find((d) => d.id === draggingId) : null;

  if (documents.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open documents"
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 2,
        height: 40, flexShrink: 0,
        padding: '0 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-app)',
        overflowX: 'auto', overflowY: 'hidden',
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={documents.map((d) => d.id)}
          strategy={horizontalListSortingStrategy}
        >
          {documents.map((doc) => (
            <SortableTab
              key={doc.id}
              doc={doc}
              isActive={doc.id === activeDocumentId}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {draggingDoc && (
            <div style={{ opacity: 0.92 }}>
              <TabVisual doc={draggingDoc} isActive={draggingDoc.id === activeDocumentId} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Sortable tab ──────────────────────────────────────────────────────────────

function SortableTab({
  doc, isActive, onSelect, onRemove,
}: {
  doc: PDFDocument; isActive: boolean;
  onSelect: (id: string) => void; onRemove: (id: string) => void;
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: doc.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0 : 1,
        display: 'flex', alignItems: 'stretch',
      }}
      {...attributes}
      {...listeners}
    >
      <TabVisual
        doc={doc}
        isActive={isActive}
        onClick={() => onSelect(doc.id)}
        onClose={() => onRemove(doc.id)}
      />
    </div>
  );
}

// ── Visual (also reused for the drag overlay) ─────────────────────────────────

function TabVisual({
  doc, isActive, onClick, onClose,
}: {
  doc: PDFDocument;
  isActive: boolean;
  onClick?: () => void;
  onClose?: () => void;
}) {
  const Icon = doc.type === 'pptx' ? Presentation : FileText;
  return (
    <div
      role="tab"
      aria-selected={isActive}
      className="group"
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        height: 40,
        padding: '0 12px',
        cursor: 'pointer',
        userSelect: 'none',
        background: isActive ? 'var(--bg-panel)' : 'transparent',
        borderRadius: '8px 8px 0 0',
        transition: 'background 0.12s',
        minWidth: 0, maxWidth: 220, flexShrink: 0,
      }}
      onMouseOver={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
      }}
      onMouseOut={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <Icon
        size={13}
        style={{
          color: isActive ? 'var(--accent)' : 'var(--text-3)',
          flexShrink: 0,
        }}
      />
      <span style={{
        fontSize: 12.5,
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--text-1)' : 'var(--text-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        flex: 1, minWidth: 0,
      }}>
        {doc.name}
      </span>
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Close ${doc.name}`}
          className="opacity-0 group-hover:opacity-100"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', flexShrink: 0, opacity: 0,
            transition: 'opacity 0.12s, color 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)', background: 'var(--bg-hover)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'transparent' })}
        >
          <X size={11} />
        </button>
      )}
      {/* Active underline */}
      {isActive && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 8, right: 8, bottom: -1,
            height: 2, borderRadius: 1,
            background: 'var(--accent)',
          }}
        />
      )}
    </div>
  );
}
