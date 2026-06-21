'use client';
import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { BlankPage } from '@/types';
import type { DrawingCanvasHandle } from '@/components/BlankPageCanvas';

// Same minimal structural shape used by useBlankPageDrawing — declared
// locally so this hook doesn't have to reach into workspace's VirtualPage
// definition.
type CurrentVPLike =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: { id: string } }
  | null;

interface Args {
  // Layout / view state
  showSplit: boolean;
  activeSide: 'left' | 'right';
  rightSideMode: 'blank' | 'document';
  viewMode: 'page' | 'scroll';
  currentVP: CurrentVPLike;

  // Canvas refs (owned by workspace, passed through)
  pdfDrawingRef:      RefObject<DrawingCanvasHandle | null>;
  blankDrawingRef:    RefObject<DrawingCanvasHandle | null>;
  rightDocDrawingRef: RefObject<DrawingCanvasHandle | null>;

  // Blank-page drawing state (sourced from useBlankPageDrawing in step 1)
  blankUndoStacksRef:        RefObject<Record<string, Array<string | undefined>>>;
  resolveScrollBlankPageId:  () => string | null;

  // Blank-page persistence + lookup (sourced from useBlankPages)
  updateCanvasData: (id: string, data: string) => void;
  docBlankPages:    BlankPage[];
}

/**
 * Pure extraction of the workspace toolbar's Undo / Clear handlers.
 * Same branching (split vs single, scroll vs page mode, blank vs PDF),
 * same function bodies — only the surrounding scope changed. All inputs
 * the original closures captured are now explicit parameters.
 */
export function useUndoClear({
  showSplit,
  activeSide,
  rightSideMode,
  viewMode,
  currentVP,
  pdfDrawingRef,
  blankDrawingRef,
  rightDocDrawingRef,
  blankUndoStacksRef,
  resolveScrollBlankPageId,
  updateCanvasData,
  docBlankPages,
}: Args) {
  // ── Undo handler — targets the correct canvas per context ────────────────
  const handleUndo = useCallback(() => {
    if (showSplit) {
      if (activeSide === 'left') {
        pdfDrawingRef.current?.undo?.();
      } else if (rightSideMode === 'blank') {
        blankDrawingRef.current?.undo?.();
      } else {
        rightDocDrawingRef.current?.undo?.();
      }
      return;
    }
    // In scroll mode, prefer the in-workspace blank-page undo stack whenever
    // the user has touched a blank page recently — currentVP tracks the
    // scroll midpoint and can be a PDF page even right after the user drew
    // on a blank that's off-centre. Page mode keeps the BlankPageCanvas
    // ref path because BlankPageCanvas is mounted for the visible page.
    if (viewMode === 'scroll') {
      const blankId = resolveScrollBlankPageId();
      if (blankId) {
        const stack = blankUndoStacksRef.current[blankId];
        if (stack && stack.length > 0) {
          const prev = stack.pop();
          updateCanvasData(blankId, prev ?? '');
          return;
        }
        // Empty stack for this blank → fall through to PDF undo (which is
        // a no-op in scroll mode today, same as before this fix).
      }
      pdfDrawingRef.current?.undo?.();
      return;
    }
    if (currentVP?.type === 'blank') {
      blankDrawingRef.current?.undo?.();
    } else {
      pdfDrawingRef.current?.undo?.();
    }
  }, [showSplit, activeSide, rightSideMode, currentVP, viewMode, updateCanvasData, resolveScrollBlankPageId, pdfDrawingRef, blankDrawingRef, rightDocDrawingRef, blankUndoStacksRef]);

  // ── Clear handler — targets the correct canvas per context ────────────────
  const handleClear = useCallback(() => {
    if (showSplit) {
      if (activeSide === 'left') {
        pdfDrawingRef.current?.clear();
      } else if (rightSideMode === 'blank') {
        blankDrawingRef.current?.clear();
      } else {
        rightDocDrawingRef.current?.clear();
      }
      return;
    }
    if (viewMode === 'scroll') {
      const blankId = resolveScrollBlankPageId();
      if (blankId) {
        const prev = docBlankPages.find((p) => p.id === blankId)?.canvasData;
        if (prev) {
          const stack = blankUndoStacksRef.current[blankId] ?? [];
          stack.push(prev);
          if (stack.length > 50) stack.shift();
          blankUndoStacksRef.current[blankId] = stack;
        }
        updateCanvasData(blankId, '');
        return;
      }
      pdfDrawingRef.current?.clear();
      return;
    }
    if (currentVP?.type === 'blank') {
      blankDrawingRef.current?.clear();
    } else {
      pdfDrawingRef.current?.clear();
    }
  }, [showSplit, activeSide, rightSideMode, currentVP, viewMode, updateCanvasData, docBlankPages, resolveScrollBlankPageId, pdfDrawingRef, blankDrawingRef, rightDocDrawingRef, blankUndoStacksRef]);

  return { handleUndo, handleClear };
}
