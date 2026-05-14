'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, X, FileText, LogOut, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { clampZoom } from '@/components/PDFViewer';
import { usePDF } from '@/hooks/usePDF';
import { useVoiceNotes } from '@/hooks/useVoiceNotes';
import { useBlankPages } from '@/hooks/useBlankPages';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import PDFUploader from '@/components/PDFUploader';
import PDFViewer from '@/components/PDFViewer';
import PDFWithDrawing from '@/components/PDFWithDrawing';
import BlankPageCanvas from '@/components/BlankPageCanvas';
import DrawingSheet from '@/components/DrawingSheet';
import VoiceNotesSheet from '@/components/VoiceNotesSheet';
import PageNavigation from '@/components/PageNavigation';
import type { BlankPage } from '@/types';
import type { DrawingCanvasHandle } from '@/components/BlankPageCanvas';
import type { Tool, PenType } from '@/lib/drawing';

// ─── Shared glass styles ──────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  backdropFilter: 'blur(15px)',
  WebkitBackdropFilter: 'blur(15px)',
  border: '2px solid rgba(255,255,255,0.2)',
};

// ─── Virtual page sequence ────────────────────────────────────────────────────

type VirtualPage =
  | { type: 'pdf'; pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

function buildVirtualSequence(pdfPageCount: number, blankPages: BlankPage[]): VirtualPage[] {
  const pages: VirtualPage[] = [];
  blankPages
    .filter((b) => b.insertAfterPage === 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((b) => pages.push({ type: 'blank', blankPage: b }));
  for (let p = 1; p <= pdfPageCount; p++) {
    pages.push({ type: 'pdf', pdfPage: p });
    blankPages
      .filter((b) => b.insertAfterPage === p)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((b) => pages.push({ type: 'blank', blankPage: b }));
  }
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem('isLoggedIn')) router.replace('/login');
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    router.push('/login');
  };

  const { documents, activeDocument, activeDocumentId, isLoading, addDocument, removeDocument, setActiveDocument, goToPage } = usePDF();
  const { isRecording, recordingDuration, recordingContext, startRecording, stopRecording, deleteNote, updateNoteTitle, getNotesForPage } = useVoiceNotes();
  const { insertBlankPage, removeBlankPage, updateCanvasData, getBlankPagesForDocument } = useBlankPages();
  const { getDrawing, saveDrawing } = usePDFDrawings();

  // ── Virtual page navigation ───────────────────────────────────────────────
  const [virtualIndex, setVirtualIndex] = useState(0);
  const docBlankPages = activeDocument ? getBlankPagesForDocument(activeDocument.id) : [];
  const virtualSequence = activeDocument ? buildVirtualSequence(activeDocument.pageCount, docBlankPages) : [];
  const currentVP: VirtualPage | null = virtualSequence[virtualIndex] ?? null;
  const currentPdfPage = currentVP?.type === 'pdf' ? currentVP.pdfPage : null;

  useEffect(() => { setVirtualIndex(0); }, [activeDocumentId]);
  useEffect(() => {
    if (currentPdfPage !== null) goToPage(currentPdfPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPdfPage]);

  const goVirtualPrev = useCallback(() => setVirtualIndex((i) => Math.max(0, i - 1)), []);
  const goVirtualNext = useCallback(() => setVirtualIndex((i) => Math.min(i + 1, virtualSequence.length - 1)), [virtualSequence.length]);
  const goVirtualToPage = useCallback((page: number) => setVirtualIndex(Math.max(0, Math.min(page - 1, virtualSequence.length - 1))), [virtualSequence.length]);

  const handleInsertBlankPage = useCallback(() => {
    if (!activeDocument) return;
    const afterPage = currentVP?.type === 'pdf' ? currentVP.pdfPage : currentVP?.type === 'blank' ? currentVP.blankPage.insertAfterPage : activeDocument.currentPage;
    insertBlankPage(activeDocument.id, afterPage);
    setVirtualIndex((i) => i + 1);
  }, [activeDocument, currentVP, insertBlankPage]);

  const handleDeleteBlankPage = useCallback((id: string) => {
    removeBlankPage(id);
    setVirtualIndex((i) => Math.max(0, i - 1));
  }, [removeBlankPage]);

  // ── Drawing state (shared between blank page + PDF overlay) ───────────────
  const [tool, setTool] = useState<Tool>('pen');
  const [penType, setPenType] = useState<PenType>('normal');
  const [color, setColor] = useState('#111111');
  const [strokeSize, setStrokeSize] = useState(5);
  const drawingRef = useRef<DrawingCanvasHandle | null>(null);

  // ── PDF-specific drawing ──────────────────────────────────────────────────
  const [drawMode, setDrawMode] = useState(false);
  const toggleDrawMode = useCallback(() => setDrawMode((d) => !d), []);

  const currentDrawing = activeDocument && currentVP?.type === 'pdf'
    ? getDrawing(activeDocument.id, currentVP.pdfPage)
    : undefined;

  const handleSaveDrawing = useCallback((data: string) => {
    if (activeDocument && currentVP?.type === 'pdf') {
      saveDrawing(activeDocument.id, currentVP.pdfPage, data);
    }
  }, [activeDocument, currentVP, saveDrawing]);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1.0);
  const handleZoomChange = useCallback((z: number) => setZoom(clampZoom(z)), []);

  // ── Sidebar visibility ────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Bottom bar + sheet visibility ────────────────────────────────────────
  const [navBarVisible, setNavBarVisible] = useState(true);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [drawingSheetOpen, setDrawingSheetOpen] = useState(false);

  // Auto-expand voice notes when a recording starts
  useEffect(() => {
    if (isRecording) setVoiceSheetOpen(true);
  }, [isRecording]);

  // Auto-expand drawing sheet when draw mode is activated
  useEffect(() => {
    if (drawMode) setDrawingSheetOpen(true);
  }, [drawMode]);

  // ── Voice notes ───────────────────────────────────────────────────────────
  const activePdfPage = activeDocument?.currentPage ?? 1;
  const pageIdentifier: number | string = currentVP?.type === 'blank' ? currentVP.blankPage.id : activePdfPage;
  const pageNotes = activeDocument ? getNotesForPage(activeDocument.id, pageIdentifier) : [];
  const pageKey = activeDocument ? `${activeDocument.id}:${pageIdentifier}` : '';

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') goVirtualNext();
      if (e.key === 'ArrowLeft') goVirtualPrev();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [goVirtualNext, goVirtualPrev]);

  const handleFilesAdded = (files: File[]) => files.forEach((f) => addDocument(f));

  // Whether the drawing sheet should be shown at all
  const showDrawingSheet = currentVP?.type === 'blank' || (drawMode && currentVP?.type === 'pdf');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-5 flex-shrink-0 z-20"
        style={{
          ...glass,
          height: 54,
          borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0,
          boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.12) 100%)',
              border: '1px solid rgba(255,255,255,0.3)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="font-semibold text-white text-[15px] tracking-tight">StudySpace</span>
        </div>

        <div className="flex items-center gap-2">
          {documents.length > 0 && <PDFUploader onFilesAdded={handleFilesAdded} compact />}
          <button
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer"
            style={{
              color: 'rgba(255,255,255,0.45)',
              background: 'transparent',
              border: '1px solid transparent',
              transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, {
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.2)',
            })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, {
              background: 'transparent',
              color: 'rgba(255,255,255,0.45)',
              borderColor: 'transparent',
            })}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {documents.length === 0 ? (
        /* ── Empty state ── */
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
          <div className="w-full max-w-sm text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)',
                border: '2px solid rgba(255,255,255,0.22)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              }}
            >
              <BookOpen size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Start studying</h1>
            <p className="text-sm mb-8 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Upload one or more PDFs to get started
            </p>
            {isLoading ? (
              <div className="flex justify-center">
                <div
                  className="w-8 h-8 rounded-full border-2"
                  style={{
                    borderColor: 'rgba(255,255,255,0.5)',
                    borderTopColor: 'transparent',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              </div>
            ) : (
              <PDFUploader onFilesAdded={handleFilesAdded} />
            )}
          </div>
        </div>
      ) : (
        /* ── Main workspace ── */
        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar (desktop) ── */}
          <div
            className="hidden sm:block flex-shrink-0"
            style={{
              width: sidebarOpen ? 244 : 0,
              overflow: 'hidden',
              transition: 'width 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <aside
              className="flex flex-col overflow-y-auto"
              style={{
                width: 244,
                height: '100%',
                ...glass,
                borderTop: 'none', borderBottom: 'none', borderLeft: 'none', borderRadius: 0,
              }}
            >
              <div
                className="px-4 pt-5 pb-2"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.38)' }}>
                  Documents
                </span>
              </div>

              <ul className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
                {documents.map((doc) => {
                  const isActive = doc.id === activeDocumentId;
                  return (
                    <li key={doc.id}>
                      <button
                        onClick={() => setActiveDocument(doc.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm group cursor-pointer"
                        style={{
                          background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
                          border: isActive ? '1px solid rgba(255,255,255,0.28)' : '1px solid transparent',
                          color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                          transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease',
                          boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                        }}
                        onMouseOver={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.color = '#fff';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
                          }
                        }}
                      >
                        <FileText size={13} className="flex-shrink-0" style={{ color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)' }} />
                        <span className="flex-1 truncate text-[12.5px] font-medium leading-snug">{doc.name}</span>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); removeDocument(doc.id); }}
                          className="opacity-0 group-hover:opacity-100 cursor-pointer p-1 rounded-lg"
                          style={{
                            color: 'rgba(255,255,255,0.35)',
                            transition: 'opacity 0.15s ease, color 0.15s ease, background 0.15s ease',
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.color = '#fca5a5';
                            e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          aria-label="Remove document"
                        >
                          <X size={11} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <PDFUploader onFilesAdded={handleFilesAdded} compact />
              </div>
            </aside>
          </div>

          {/* ── Tab bar (mobile) ── */}
          <div
            className="sm:hidden absolute top-[54px] left-0 right-0 flex overflow-x-auto z-10"
            style={{
              ...glass,
              borderLeft: 'none', borderRight: 'none', borderRadius: 0,
              height: 44,
            }}
          >
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setActiveDocument(doc.id)}
                className="flex-shrink-0 px-4 text-xs whitespace-nowrap cursor-pointer font-medium h-full flex items-center"
                style={{
                  borderBottom: `2px solid ${doc.id === activeDocumentId ? 'rgba(255,255,255,0.85)' : 'transparent'}`,
                  color: doc.id === activeDocumentId ? '#fff' : 'rgba(255,255,255,0.42)',
                  background: 'transparent',
                  transition: 'color 0.18s ease, border-color 0.18s ease',
                }}
              >
                {doc.name}
              </button>
            ))}
          </div>

          {/* ── Main content column ── */}
          <main className="flex-1 flex flex-col overflow-hidden" style={{ position: 'relative' }}>

            {/* Sidebar toggle button — desktop only */}
            <button
              className="hidden sm:flex"
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              style={{
                position: 'absolute', top: 18, left: 0, zIndex: 20,
                alignItems: 'center', justifyContent: 'center',
                width: 20, height: 36,
                borderRadius: '0 10px 10px 0',
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1.5px solid rgba(255,255,255,0.2)',
                borderLeft: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                transition: 'background 0.18s ease, color 0.18s ease',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.2)', color: '#fff' })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' })}
            >
              {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>

            {activeDocument && (
              <>
                {/* Page view — fills remaining space, manages its own scroll */}
                <div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
                  {currentVP?.type === 'blank' ? (
                    <BlankPageCanvas
                      ref={drawingRef}
                      blankPage={currentVP.blankPage}
                      onSaveData={updateCanvasData}
                      tool={tool}
                      penType={penType}
                      color={color}
                      strokeSize={strokeSize}
                    />
                  ) : drawMode ? (
                    <PDFWithDrawing
                      ref={drawingRef}
                      document={activeDocument}
                      tool={tool}
                      penType={penType}
                      color={color}
                      strokeSize={strokeSize}
                      savedData={currentDrawing}
                      onSave={handleSaveDrawing}
                      zoom={zoom}
                      onZoomChange={handleZoomChange}
                    />
                  ) : (
                    <div style={{ flex: 1, overflow: 'auto' }}>
                      <PDFViewer document={activeDocument} zoom={zoom} onZoomChange={handleZoomChange} />
                    </div>
                  )}
                </div>

                {/* ── Bottom bar (collapsible) ── */}
                <div style={{
                  flexShrink: 0, overflow: 'hidden',
                  maxHeight: navBarVisible ? 700 : 0,
                  transition: navBarVisible
                    ? 'max-height 0.35s cubic-bezier(0, 0, 0.2, 1)'
                    : 'max-height 0.25s cubic-bezier(0.4, 0, 1, 1)',
                }}>
                  {/* Drawing tools bottom sheet */}
                  {showDrawingSheet && (
                    <DrawingSheet
                      isOpen={drawingSheetOpen}
                      onToggle={() => setDrawingSheetOpen((o) => !o)}
                      tool={tool}
                      setTool={setTool}
                      penType={penType}
                      setPenType={setPenType}
                      color={color}
                      setColor={setColor}
                      strokeSize={strokeSize}
                      setStrokeSize={setStrokeSize}
                      onClear={() => drawingRef.current?.clear()}
                      onDeletePage={
                        currentVP?.type === 'blank'
                          ? () => handleDeleteBlankPage(currentVP.blankPage.id)
                          : undefined
                      }
                    />
                  )}

                  {/* Voice notes bottom sheet */}
                  <VoiceNotesSheet
                    isOpen={voiceSheetOpen}
                    onToggle={() => setVoiceSheetOpen((o) => !o)}
                    notes={pageNotes}
                    pageKey={pageKey}
                    documentId={activeDocument.id}
                    pageNumber={pageIdentifier}
                    isRecording={isRecording}
                    recordingDuration={recordingDuration}
                    recordingContext={recordingContext}
                    onStart={() => startRecording(activeDocument.id, pageIdentifier)}
                    onStop={stopRecording}
                    onDelete={deleteNote}
                    onUpdateTitle={updateNoteTitle}
                  />

                  {/* Page navigation */}
                  <PageNavigation
                    currentPage={virtualIndex + 1}
                    pageCount={virtualSequence.length}
                    isBlankPage={currentVP?.type === 'blank'}
                    onPrev={goVirtualPrev}
                    onNext={goVirtualNext}
                    onGoToPage={goVirtualToPage}
                    onInsertBlankPage={handleInsertBlankPage}
                    onToggleDraw={currentVP?.type === 'pdf' ? toggleDrawMode : undefined}
                    isDrawing={drawMode && currentVP?.type === 'pdf'}
                    zoom={zoom}
                    onZoomIn={() => handleZoomChange(zoom + 0.25)}
                    onZoomOut={() => handleZoomChange(zoom - 0.25)}
                    onHideBar={() => setNavBarVisible(false)}
                  />
                </div>

                {/* Floating restore button — shown when bar is hidden */}
                {!navBarVisible && (
                  <button
                    onClick={() => setNavBarVisible(true)}
                    title="Show toolbar"
                    aria-label="Show toolbar"
                    className="animate-scale-in"
                    style={{
                      position: 'absolute', bottom: 20, right: 20, zIndex: 30,
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.16)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: '1.5px solid rgba(255,255,255,0.28)',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 6px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
                      transition: 'background 0.18s ease, transform 0.18s ease',
                    }}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.26)', transform: 'scale(1.06)' })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.16)', transform: 'scale(1)' })}
                  >
                    <ChevronUp size={18} />
                    {isRecording && (
                      <span className="rec-dot" style={{
                        position: 'absolute', top: 5, right: 5,
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#ef4444',
                        boxShadow: '0 0 6px rgba(239,68,68,0.7)',
                      }} />
                    )}
                  </button>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
