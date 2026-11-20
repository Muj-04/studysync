import { useState, useRef, useCallback, useEffect } from 'react';

export function useResizablePanels(
  setSidebarOpen: (open: boolean) => void,
  setRightPanelOpen: (open: boolean) => void,
) {
  // ── Resizable panels ──────────────────────────────────────────────────────
  const SIDEBAR_MIN = 150;
  const SIDEBAR_MAX = 350;
  const SIDEBAR_DEFAULT = 256;
  const RPANEL_MIN = 150;
  const RPANEL_MAX = 300;
  const RPANEL_DEFAULT = 220;

  const [sidebarWidth, setSidebarWidth]       = useState(SIDEBAR_DEFAULT);
  const [rightPanelWidth, setRightPanelWidth] = useState(RPANEL_DEFAULT);
  const [isDraggingLeft, setIsDraggingLeft]   = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const dragStartXRef      = useRef(0);
  const dragStartWidthRef  = useRef(0);
  const dragSideRef        = useRef<'left' | 'right' | null>(null);

  const startLeftDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartXRef.current     = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    dragSideRef.current       = 'left';
    setIsDraggingLeft(true);
  }, [sidebarWidth]);

  const startRightDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartXRef.current     = e.clientX;
    dragStartWidthRef.current = rightPanelWidth;
    dragSideRef.current       = 'right';
    setIsDraggingRight(true);
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartXRef.current;
      if (dragSideRef.current === 'left') {
        const next = dragStartWidthRef.current + dx;
        if (next < SIDEBAR_MIN) {
          setSidebarOpen(false);
          setSidebarWidth(SIDEBAR_DEFAULT);
        } else {
          setSidebarOpen(true);
          setSidebarWidth(Math.min(next, SIDEBAR_MAX));
        }
      } else {
        const next = dragStartWidthRef.current - dx;
        if (next < RPANEL_MIN) {
          setRightPanelOpen(false);
          setRightPanelWidth(RPANEL_DEFAULT);
        } else {
          setRightPanelOpen(true);
          setRightPanelWidth(Math.min(next, RPANEL_MAX));
        }
      }
    };
    const onUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      dragSideRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingLeft, isDraggingRight, setSidebarOpen, setRightPanelOpen]);


  return { sidebarWidth, rightPanelWidth, isDraggingLeft, isDraggingRight, startLeftDrag, startRightDrag };
}
