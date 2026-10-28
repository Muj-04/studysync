'use client';
import { safeReturnPath } from '@/lib/accessPolicy';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureProfile, ensureReferralCode, recoverPendingReferral } from '@/lib/supabase/db';

// Handles the OAuth redirect. Supabase sends users here with a `code` param
// (PKCE flow). The client exchanges it for a session, we ensure a profile row
// exists, then redirect to the app.
export default function AuthCallbackPage() {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const referralAbort = new AbortController();
    const run = async () => {
      const supabase = createClient();

      // createBrowserClient automatically exchanges PKCE callback codes during
      // initialization. Wait for that single exchange instead of consuming the
      // one-time code a second time.
      const { error: initializationError } = await supabase.auth.initialize();
      if (cancelled) return;
      if (initializationError) {
        window.location.replace('/login?verification=failed');
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userError || !user) {
        window.location.replace('/login?verification=failed');
        return;
      }

      // Ensure a profile row exists (no-op if already created by DB trigger).
      await ensureProfile();
      if (cancelled) return;

      // Referral setup is optional. Storage restrictions or referral failures
      // must not strand an authenticated user on the callback page.
      try {
        const options = { userId: user.id, signal: referralAbort.signal };
        await ensureReferralCode(options);
        if (cancelled) return;
        if (await recoverPendingReferral(options) === 'cancelled') return;
      } catch { /* Referral processing must not block sign-in. */ }
      if (cancelled) return;

      // Redirect to the app.
      window.location.replace(safeReturnPath(new URLSearchParams(window.location.search).get('redirect'), '/workspace'));
    };
    void run().catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; referralAbort.abort(); };
  }, [attempt]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f1117', color: '#fff',
      fontFamily: "'Geist', system-ui, sans-serif",
      flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center',
    }}>
      {error ? (
        <>
          <p role="alert" style={{ maxWidth: 420 }}>We couldn&apos;t finish signing you in. Check your connection and try again.</p>
          <button type="button" style={{ background: '#7c3aed', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' }} onClick={() => { setError(false); setAttempt(value => value + 1); }}>
            Try again
          </button>
          <a href="/login" style={{ color: '#c4b5fd', textDecoration: 'underline' }}>Back to login</a>
        </>
      ) : <>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(124,58,237,0.3)',
        borderTopColor: '#7c3aed',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
        Signing you in…
      </p>
      </>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
