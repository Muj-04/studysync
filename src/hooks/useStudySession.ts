'use client';
import { useEffect, useRef } from 'react';
import { startStudySession, endStudySession } from '@/lib/supabase/db';

export function useStudySession(docId: string | null, userId: string | null) {
  const sessionIdRef = useRef<string | null>(null);
  const docIdRef = useRef<string | null>(null);

  const closeSession = async () => {
    if (sessionIdRef.current) {
      await endStudySession(sessionIdRef.current);
      sessionIdRef.current = null;
    }
  };

  useEffect(() => {
    if (!docId || !userId) return;
    if (docId === docIdRef.current) return;

    // End previous session for a different doc
    closeSession();
    docIdRef.current = docId;

    startStudySession(docId).then((id) => {
      if (id) sessionIdRef.current = id;
    });

    const handleUnload = () => {
      if (sessionIdRef.current) {
        // sendBeacon is best-effort on page unload
        const sid = sessionIdRef.current;
        endStudySession(sid);
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      closeSession();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, userId]);
}
