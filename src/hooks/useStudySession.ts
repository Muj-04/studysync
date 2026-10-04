'use client';
import { useEffect } from 'react';
import { startStudySession, endStudySession } from '@/lib/supabase/db';

export function useStudySession(docId: string | null, userId: string | null) {
  useEffect(() => {
    if (!docId || !userId) return;
    let disposed = false;
    let sessionId: string | null = null;
    const close = () => {
      const closingId = sessionId;
      sessionId = null;
      if (closingId) void endStudySession(closingId).catch(console.error);
    };
    void startStudySession(docId).then((id) => {
      if (disposed) {
        if (id) void endStudySession(id).catch(console.error);
      } else sessionId = id;
    }).catch(console.error);
    const onPageHide = () => { disposed = true; close(); };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      close();
    };
  }, [docId, userId]);
}
