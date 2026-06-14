'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureProfile } from '@/lib/supabase/db';

// Handles the OAuth redirect. Supabase sends users here with a `code` param
// (PKCE flow). The client exchanges it for a session, we ensure a profile row
// exists, then redirect to the app.
export default function AuthCallbackPage() {
  useEffect(() => {
    const run = async () => {
      const supabase = createClient();

      // Exchange the OAuth code in the URL for a session.
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      // Ensure a profile row exists (no-op if already created by DB trigger).
      await ensureProfile();

      // Redirect to the app.
      window.location.replace('/workspace');
    };
    run();
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f1117', color: '#fff',
      fontFamily: "'Geist', system-ui, sans-serif",
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(124,58,237,0.3)',
        borderTopColor: '#7c3aed',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
        Signing you in…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
