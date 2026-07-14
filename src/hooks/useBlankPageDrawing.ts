'use client';
import { useCallback, useRef } from 'react';
import type { BlankPage } from '@/types';
import { MAX_UNDO_HISTORY } from '@/lib/drawing';

// Minimal structural shape — only the fields resolveScrollBlankPageId reads
// from `currentVP`. Declared locally so this hook doesn't have to import
// VirtualPage from workspace/page.tsx (which would invert the dep direction).
type CurrentVPLike =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: { id: string } }
  | null;

interface Args {
  docBlankPages: BlankPage[];
  updateCanvasData: (id: string, data: string) => void;
  currentVP: CurrentVPLike;
}

/**
 * Pure extraction of the scroll-mode blank-page drawing wiring that lived
 * inline in `src/app/workspace/page.tsx`. Same identifiers, same function
 * bodies — only the location changed.
 *
 * Returns:
 * - `blankUndoStacksRef` — per-page-id history of previous canvasData URLs.
 *   Read by handleUndo/handleClear in workspace.
 * - `getBlankDrawingScroll(pageId)` — current canvasData for a blank page.
 * - `saveBlankDrawingScroll(pageId, data)` — push prev to history, persist
 *   new data, and remember which page was last touched.
 * - `resolveScrollBlankPageId()` — page id Undo/Clear should target.
 * - `markBlankInteracted(pageId)` — lets callers outside this hook (e.g.
 *   the text-note save path in workspace) update the
 *   `lastInteractedBlankIdRef` that resolveScrollBlankPageId reads.
 *   Preserves the pre-extraction behavior where saveBlankNotesScroll
 *   also stamped the ref.
 */
export function useBlankPageDrawing({
  docBlankPages,
  updateCanvasData,
  currentVP,
}: Args) {
  // PDFScrollViewer supports blank-page drawing and text notes via opt-in
  // props; we provide them here so strokes and notes round-trip through the
  // same `canvasData` / `pageTextNotes` state used by single-page mode.
  // The undo stack is a per-page history of previous canvasData URLs so the
  // toolbar's Undo button works on blank pages in scroll mode (where
  // blankDrawingRef is null because BlankPageCanvas isn't mounted).
  //
  // Earlier this lookup used a ref kept in sync via useEffect — but the
  // effect runs AFTER commit, so the very first render after
  // updateCanvasData() saw stale data and Undo/Clear silently no-op'd
  // visually. Reading docBlankPages directly fixes that ordering bug.
  const blankUndoStacksRef = useRef<Record<string, Array<string | undefined>>>({});
  const blankRedoStacksRef = useRef<Record<string, Array<string | undefined>>>({});

  // The single source of truth for "which blank page is the toolbar
  // currently acting on in scroll mode". Updated on every stroke and every
  // note placement; read by handleUndo/handleClear so they can't drift to
  // a different page than the one the user actually drew on. (currentVP
  // tracks the scroll midpoint, which is not the same thing.)
  const lastInteractedBlankIdRef = useRef<string | null>(null);

  const getBlankDrawingScroll = useCallback((pageId: string): string | undefined => {
    return docBlankPages.find((p) => p.id === pageId)?.canvasData;
  }, [docBlankPages]);

  const saveBlankDrawingScroll = useCallback((pageId: string, data: string) => {
    const prev = docBlankPages.find((p) => p.id === pageId)?.canvasData;
    if (prev === data) return;
    const stack = blankUndoStacksRef.current[pageId] ?? [];
    stack.push(prev);
    // Cap history to a reasonable depth so a long session doesn't grow without bound.
    if (stack.length > MAX_UNDO_HISTORY) stack.shift();
    blankUndoStacksRef.current[pageId] = stack;
    blankRedoStacksRef.current[pageId] = [];
    lastInteractedBlankIdRef.current = pageId;
    updateCanvasData(pageId, data);
  }, [docBlankPages, updateCanvasData]);

  // Helper: returns the page id Undo/Clear should target in scroll mode.
  // Prefers currentVP when it's already on a blank page (the common case);
  // otherwise falls back to the last page the user actually saved on.
  const resolveScrollBlankPageId = useCallback((): string | null => {
    if (currentVP?.type === 'blank') return currentVP.blankPage.id;
    return lastInteractedBlankIdRef.current;
  }, [currentVP]);

  const markBlankInteracted = useCallback((pageId: string) => {
    lastInteractedBlankIdRef.current = pageId;
  }, []);

  return {
    blankUndoStacksRef,
    blankRedoStacksRef,
    getBlankDrawingScroll,
    saveBlankDrawingScroll,
    resolveScrollBlankPageId,
    markBlankInteracted,
  };
}
