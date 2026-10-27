'use client';
import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getOrCreateSessionId,
  registerSession,
  getProfile,
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
    let disposed = false;
    let enforcing = false;
    let removeChannel: (() => void) | null = null;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || disposed) return;
      const profile = await getProfile();
      if (disposed || !profile || profile.plan === 'free' || profile.isVip) return;
      enforcing = true;

      // Register (or re-confirm) this session
      await registerSession(sessionId, navigator.userAgent.slice(0, 200));
      if (disposed) return;

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
            if (!disposed && newId !== sessionIdRef.current && !kickedRef.current) {
              kickedRef.current = true;
              supabase.auth.signOut({ scope: 'local' })
                .then(() => clearLocalUserData())
                .then(() => onKicked?.());
            }
          },
        )
        .subscribe();

      removeChannel = () => supabase.removeChannel(channel);
    }).catch(console.error);

    const interval = setInterval(
      () => { if (enforcing && !disposed) void updateSessionLastSeen(sessionIdRef.current).catch(console.error); },
      LAST_SEEN_INTERVAL_MS,
    );

    return () => {
      disposed = true;
      clearInterval(interval);
      removeChannel?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
