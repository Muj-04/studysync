'use client';
import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getOrCreateSessionId,
  registerSession,
  updateSessionLastSeen,
} from '@/lib/supabase/db';
import { clearLocalUserData } from '@/lib/clearLocalUserData';

const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSessionGuard({ onKicked }: { onKicked?: () => void } = {}) {
  const sessionIdRef = useRef('');
  const kickedRef    = useRef(false);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    sessionIdRef.current = sessionId;

    const supabase = createClient();
    let removeChannel: (() => void) | null = null;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      // Register (or re-confirm) this session
      await registerSession(sessionId, navigator.userAgent.slice(0, 200));

      // Watch for another device registering — payload.new.session_id will differ
      const channel = supabase
        .channel(`session_guard:${user.id}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'active_sessions',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newId = (payload.new as { session_id: string }).session_id;
            if (newId !== sessionIdRef.current && !kickedRef.current) {
              kickedRef.current = true;
              supabase.auth.signOut()
                .then(() => clearLocalUserData())
                .then(() => onKicked?.());
            }
          },
        )
        .subscribe();

      removeChannel = () => supabase.removeChannel(channel);
    });

    const interval = setInterval(
      () => updateSessionLastSeen(sessionIdRef.current),
      LAST_SEEN_INTERVAL_MS,
    );

    return () => {
      clearInterval(interval);
      removeChannel?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
