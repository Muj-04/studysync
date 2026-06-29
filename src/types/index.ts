export interface PDFDocument {
  id: string;
  name: string;
  url: string;
  pageCount: number;
  currentPage: number;
  type?: 'pdf' | 'pptx';
  slides?: string[]; // pre-rendered JPEG data URLs, one per slide
}

export interface VoiceNote {
  id: string;
  documentId: string;
  pageNumber: number | string; // number for PDF pages, blankPage.id for blank pages
  audioBlob: Blob;
  audioUrl: string; // blob URL; replace with remote URL when persisting to DB
  duration: number; // seconds
  timestamp: Date;
  title?: string;
}

export interface PDFPageImage {
  id: string;
  src: string;      // base64 data URL
  x: number;        // fraction of canvas width (0–1)
  y: number;        // fraction of canvas height (0–1)
  width: number;    // fraction of canvas width (0–1)
  height: number;   // fraction of canvas height (0–1)
}

// Stubs for future features — not yet implemented

export interface CanvasImage {
  id: string;
  src: string;    // base64 data URL
  x: number;     // logical canvas px (0..PAGE_W)
  y: number;     // logical canvas px (0..PAGE_H)
  width: number;
  height: number;
}

export interface BlankPage {
  id: string;
  documentId: string;
  /** 0 = before PDF page 1, n = after PDF page n */
  insertAfterPage: number;
  canvasData?: string; // base64 PNG of freehand strokes
  images?: CanvasImage[];
  createdAt: number; // ms timestamp — orders multiple blanks after the same PDF page
  bgTheme?: 'white' | 'dark';
}

export interface Collaborator {
  id: string;
  name: string;
  avatarUrl?: string;
  color: string;
  activeDocumentId?: string;
  currentPage?: number;
}

export interface WorkspaceSession {
  id: string;
  ownerId: string;
  collaborators: Collaborator[];
  documents: PDFDocument[];
  createdAt: Date;
}

export type NoteCategory = 'important' | 'review' | 'idea';

export interface TextNote {
  id: string;
  x: number;        // 0..100 (% of page width)
  y: number;        // 0..100 (% of page height)
  width: number;    // 0..100 (% of page width)
  height: number;   // 0..100 (% of page height)
  content: string;
  fontSize: number; // px
  color: string;    // hex
  /** Optional Figma-aligned category — NULL = uncategorized. Persisted
      in text_notes.category (see 2026-06-28_text_notes_category.sql). */
  category?: NoteCategory;
}

export interface KeyTerm {
  id: string;
  documentId: string;
  term: string;
  definition: string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  documentId: string;
  virtualIndex: number;
  label: string;
  createdAt: number;
}
