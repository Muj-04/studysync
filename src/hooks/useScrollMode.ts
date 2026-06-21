'use client';
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PDFDocument, TextNote } from '@/types';
import type { Tool } from '@/lib/drawing';

interface Args {
  activeDocument:    PDFDocument | null;
  pageTextNotes:     Record<string, TextNote[]>;
  setPageTextNotes:  Dispatch<SetStateAction<Record<string, TextNote[]>>>;
  setLeftTool:       Dispatch<SetStateAction<Tool>>;
  markBlankInteracted: (pageId: string) => void;
}

/**
 * Pure extraction of the scroll-mode wiring for PDFScrollViewer's blank
 * pages: text-note read/write keyed by ${docId}:${pageId} and the small
 * tool-toggle callbacks PDFScrollViewer drives when the user enters /
 * exits the text tool inside its overlay.
 *
 * Bodies copied verbatim from src/app/workspace/page.tsx — only the
 * surrounding scope changed.
 */
export function useScrollMode({
  activeDocument,
  pageTextNotes,
  setPageTextNotes,
  setLeftTool,
  markBlankInteracted,
}: Args) {
  const getBlankNotesScroll = useCallback((pageId: string): TextNote[] => {
    if (!activeDocument) return [];
    return pageTextNotes[`${activeDocument.id}:${pageId}`] ?? [];
  }, [activeDocument, pageTextNotes]);

  const saveBlankNotesScroll = useCallback((pageId: string, notes: TextNote[]) => {
    if (!activeDocument) return;
    const key = `${activeDocument.id}:${pageId}`;
    setPageTextNotes((prev) => ({ ...prev, [key]: notes }));
    markBlankInteracted(pageId);
  }, [activeDocument, setPageTextNotes, markBlankInteracted]);

  const activateTextToolScroll = useCallback(() => setLeftTool('text'), [setLeftTool]);
  const exitTextToolScroll     = useCallback(() => setLeftTool('pen'),  [setLeftTool]);

  return {
    getBlankNotesScroll,
    saveBlankNotesScroll,
    activateTextToolScroll,
    exitTextToolScroll,
  };
}
