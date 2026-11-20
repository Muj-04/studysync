'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { recoverPendingReferral } from '@/lib/supabase/referrals';

/** Recovery is optional and never blocks the authenticated app. */
export default function ReferralRecovery() {
  useEffect(() => {
    const { auth } = createClient();
    let disposed = false;
    let generation = 0;
    let account: string | null = null;
    let pending: AbortController | null = null;
    const recover = (userId: string | null) => {
      if (disposed) return;
      if (account !== userId) { pending?.abort(); pending = null; }
      account = userId;
      if (!userId || pending) return;
      const controller = new AbortController();
      pending = controller;
      // Do not await Supabase work inside its synchronous auth-event callback.
      void Promise.resolve().then(() => recoverPendingReferral({ userId, signal: controller.signal }))
        .catch(() => { /* Retain pending intent for the next bounded trigger. */ })
        .finally(() => { if (pending === controller) pending = null; });
    };
    const reconcile = () => {
      const started = generation;
      void auth.getSession().then(({ data: { session } }) => {
        if (!disposed && started === generation) recover(session?.user.id ?? null);
      }).catch(() => {});
    };
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      generation++;
      recover(session?.user.id ?? null);
    });
    reconcile();
    window.addEventListener('online', reconcile);
    return () => {
      disposed = true;
      pending?.abort();
      subscription.unsubscribe();
      window.removeEventListener('online', reconcile);
    };
  }, []);
  return null;
}
