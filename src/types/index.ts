export interface PDFDocument {
  id: string;
  name: string;
  url: string;
  pageCount: number;
  currentPage: number;
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

// Stubs for future features — not yet implemented

export interface BlankPage {
  id: string;
  documentId: string;
  /** 0 = before PDF page 1, n = after PDF page n */
  insertAfterPage: number;
  canvasData?: string; // base64 PNG data URL; replace with remote URL when persisting to DB
  createdAt: number; // ms timestamp — orders multiple blanks after the same PDF page
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
