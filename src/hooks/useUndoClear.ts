'use client';
import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { BlankPage, PDFDocument } from '@/types';
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

  // PDF-page drawing state (workspace-owned; mirrors the blank-page stack
  // pattern). Keys are `${docId}:${pdfPage}`. Used only in scroll mode —
  // single-page-mode PDF undo/clear continue to go through pdfDrawingRef.
  pdfUndoStacksRef:           RefObject<Record<string, Array<string | undefined>>>;
  lastInteractedPdfPageRef:   RefObject<{ docId: string; pdfPage: number } | null>;
  activeDocument:             PDFDocument | null;
  getPdfDrawing:              (docId: string, page: number) => string | undefined;
  savePdfDrawing:             (docId: string, page: number, data: string) => void;
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
  pdfUndoStacksRef,
  lastInteractedPdfPageRef,
  activeDocument,
  getPdfDrawing,
  savePdfDrawing,
}: Args) {
  // Helper for the scroll-mode PDF-page Undo branch. Mirrors
  // resolveScrollBlankPageId's "current or last-touched" semantics so
  // pressing Undo right after a stroke still finds its target even if the
  // user scrolled away mid-stroke.
  const resolveScrollPdfTarget = (): { docId: string; pdfPage: number } | null => {
    if (currentVP?.type === 'pdf' && activeDocument) {
      return { docId: activeDocument.id, pdfPage: currentVP.pdfPage };
    }
    return lastInteractedPdfPageRef.current;
  };
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
    // In scroll mode, blank and PDF pages each have their own in-workspace
    // undo stack (BlankPageCanvas / PDFWithDrawing aren't mounted here, so
    // pdfDrawingRef is null). Preference order:
    //   1. If currentVP is a PDF page and its stack has entries → pop it.
    //   2. Else try the blank stack (current or last-touched blank).
    //   3. Else fall back to the last-touched PDF page's stack.
    //   4. Last resort: pdfDrawingRef (null in scroll mode, but kept for
    //      future-proofing / page-mode parity if this branch is ever shared).
    if (viewMode === 'scroll') {
      if (currentVP?.type === 'pdf' && activeDocument) {
        const key = `${activeDocument.id}:${currentVP.pdfPage}`;
        const pdfStack = pdfUndoStacksRef.current[key];
        if (pdfStack && pdfStack.length > 0) {
          const prev = pdfStack.pop();
          savePdfDrawing(activeDocument.id, currentVP.pdfPage, prev ?? '');
          return;
        }
      }
      const blankId = resolveScrollBlankPageId();
      if (blankId) {
        const stack = blankUndoStacksRef.current[blankId];
        if (stack && stack.length > 0) {
          const prev = stack.pop();
          updateCanvasData(blankId, prev ?? '');
          return;
        }
      }
      const pdfTarget = resolveScrollPdfTarget();
      if (pdfTarget) {
        const key = `${pdfTarget.docId}:${pdfTarget.pdfPage}`;
        const pdfStack = pdfUndoStacksRef.current[key];
        if (pdfStack && pdfStack.length > 0) {
          const prev = pdfStack.pop();
          savePdfDrawing(pdfTarget.docId, pdfTarget.pdfPage, prev ?? '');
          return;
        }
      }
      pdfDrawingRef.current?.undo?.();
      return;
    }
    if (currentVP?.type === 'blank') {
      blankDrawingRef.current?.undo?.();
    } else {
      pdfDrawingRef.current?.undo?.();
    }
  }, [showSplit, activeSide, rightSideMode, currentVP, viewMode, updateCanvasData, resolveScrollBlankPageId, pdfDrawingRef, blankDrawingRef, rightDocDrawingRef, blankUndoStacksRef, pdfUndoStacksRef, lastInteractedPdfPageRef, activeDocument, savePdfDrawing]);

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
      // PDF page clear: only act on the currently-centred page — Clear is
      // destructive, no fallback to last-touched.
      if (currentVP?.type === 'pdf' && activeDocument) {
        const key = `${activeDocument.id}:${currentVP.pdfPage}`;
        const prev = getPdfDrawing(activeDocument.id, currentVP.pdfPage);
        if (prev) {
          const pdfStack = pdfUndoStacksRef.current[key] ?? [];
          pdfStack.push(prev);
          if (pdfStack.length > 50) pdfStack.shift();
          pdfUndoStacksRef.current[key] = pdfStack;
        }
        savePdfDrawing(activeDocument.id, currentVP.pdfPage, '');
        return;
      }
      // Blank page clear (existing behaviour preserved — resolveScrollBlank-
      // PageId may fall back to last-touched, which is the pre-fix contract).
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
  }, [showSplit, activeSide, rightSideMode, currentVP, viewMode, updateCanvasData, docBlankPages, resolveScrollBlankPageId, pdfDrawingRef, blankDrawingRef, rightDocDrawingRef, blankUndoStacksRef, pdfUndoStacksRef, activeDocument, getPdfDrawing, savePdfDrawing]);

  return { handleUndo, handleClear };
}
