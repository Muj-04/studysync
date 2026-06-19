'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Client-side auth guard for protected pages.
 *
 * - Verifies a Supabase session on mount; if absent, redirects to /login.
 * - Subscribes to onAuthStateChange to redirect on SIGNED_OUT (handles the
 *   back-button-after-logout case where a cached page would otherwise render).
 * - Uses router.replace so the protected page is not pushed into history.
 */
export function useAuthGuard() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) router.replace('/login');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);
}
