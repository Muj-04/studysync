'use client';
import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BlankPage, PDFDocument, TextNote } from '@/types';
import type { DrawingCanvasHandle } from '@/components/BlankPageCanvas';

interface Args {
  leftNotesKey:         string;
  splitRightBlankPage:  BlankPage | null;
  activeDocument:       PDFDocument | null;
  rightDocId:           string | null;
  rightDocPage:         number;
  setPageTextNotes:     Dispatch<SetStateAction<Record<string, TextNote[]>>>;
}

/**
 * Pure extraction of the single-page-mode (incl. split-mode right pane)
 * rendering wiring that only feeds BlankPageCanvas / PDFWithDrawing.
 *
 * - The three drawing-canvas refs (left main = pdf/blank, right pane =
 *   pdf/blank). useUndoClear receives these from workspace exactly as
 *   before — workspace now sources them from this hook's return.
 * - The two text-note keys for the split-mode right pane (blank/doc).
 * - The three text-note onChange handlers (left main + the two right-pane
 *   variants).
 *
 * Bodies + identifiers copied verbatim from src/app/workspace/page.tsx.
 */
export function useSinglePageMode({
  leftNotesKey,
  splitRightBlankPage,
  activeDocument,
  rightDocId,
  rightDocPage,
  setPageTextNotes,
}: Args) {
  const pdfDrawingRef      = useRef<DrawingCanvasHandle | null>(null);
  const blankDrawingRef    = useRef<DrawingCanvasHandle | null>(null);
  const rightDocDrawingRef = useRef<DrawingCanvasHandle | null>(null);

  const rightBlankNotesKey = activeDocument && splitRightBlankPage
    ? `${activeDocument.id}:${splitRightBlankPage.id}` : '';
  const rightDocNotesKey   = rightDocId && rightDocPage
    ? `${rightDocId}:${rightDocPage}` : '';

  const handleLeftNotesChange = useCallback((notes: TextNote[]) => {
    if (!leftNotesKey) return;
    setPageTextNotes(prev => ({ ...prev, [leftNotesKey]: notes }));
  }, [leftNotesKey, setPageTextNotes]);

  const handleRightBlankNotesChange = useCallback((notes: TextNote[]) => {
    if (!rightBlankNotesKey) return;
    setPageTextNotes(prev => ({ ...prev, [rightBlankNotesKey]: notes }));
  }, [rightBlankNotesKey, setPageTextNotes]);

  const handleRightDocNotesChange = useCallback((notes: TextNote[]) => {
    if (!rightDocNotesKey) return;
    setPageTextNotes(prev => ({ ...prev, [rightDocNotesKey]: notes }));
  }, [rightDocNotesKey, setPageTextNotes]);

  return {
    pdfDrawingRef,
    blankDrawingRef,
    rightDocDrawingRef,
    rightBlankNotesKey,
    rightDocNotesKey,
    handleLeftNotesChange,
    handleRightBlankNotesChange,
    handleRightDocNotesChange,
  };
}
