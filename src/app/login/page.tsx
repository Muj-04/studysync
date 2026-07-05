'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  checkActiveSession,
  registerSession,
  getOrCreateSessionId,
  ensureReferralCode,
  processReferral,
} from '@/lib/supabase/db';

const OAUTH_REDIRECT = 'https://pdf-study-workspace.vercel.app/auth/callback';

function OAuthButtons() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | null>(null);

  const signIn = async (provider: 'google') => {
    setLoadingProvider(provider);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: OAUTH_REDIRECT },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {/* Google */}
      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => signIn('google')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', height: 44, borderRadius: 9999,
          background: loadingProvider === 'google' ? 'rgba(255,255,255,0.85)' : '#ffffff',
          border: 'none', cursor: loadingProvider !== null ? 'not-allowed' : 'pointer',
          color: '#1f1f1f', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit',
          transition: 'background 0.15s, opacity 0.15s',
          opacity: loadingProvider !== null && loadingProvider !== 'google' ? 0.5 : 1,
        }}
        onMouseOver={(e) => { if (!loadingProvider) e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
        onMouseOut={(e) => { if (!loadingProvider) e.currentTarget.style.background = '#ffffff'; }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
          <path fill="#4285F4" d="M47.532 24.552c0-1.636-.132-3.2-.378-4.704H24.48v8.898h12.984c-.558 3.018-2.256 5.574-4.806 7.29l7.776 6.048c4.536-4.188 7.098-10.356 7.098-17.532z"/>
          <path fill="#34A853" d="M24.48 48c6.498 0 11.952-2.154 15.936-5.838l-7.776-6.048c-2.16 1.446-4.926 2.298-8.16 2.298-6.282 0-11.604-4.242-13.512-9.954H2.934l-1.26 5.814v.006C5.598 42.9 14.418 48 24.48 48z"/>
          <path fill="#FBBC05" d="M10.968 28.458a14.46 14.46 0 0 1-.756-4.458c0-1.548.27-3.048.756-4.458v-5.82H2.934A23.94 23.94 0 0 0 .48 24c0 3.87.924 7.53 2.454 10.278l8.034-5.82z"/>
          <path fill="#EA4335" d="M24.48 9.588c3.54 0 6.714 1.218 9.216 3.606l6.912-6.912C36.426 2.394 30.978 0 24.48 0 14.418 0 5.598 5.1 1.674 13.722l8.034 5.82c1.908-5.712 7.23-9.954 13.512-9.954l.26.001z"/>
        </svg>
        {loadingProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0',
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.18)' }} />
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
          or continue with email
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.18)' }} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugMsg, setDebugMsg] = useState('Ready');

  const [showConflict, setShowConflict] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);

  const [wasKicked, setWasKicked] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWasKicked(new URLSearchParams(window.location.search).get('kicked') === '1');
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace('/dashboard');
    }).catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (loading) return;

    const rawEmail = emailRef.current?.value || '';
    const rawPass = passRef.current?.value || '';

    setDebugMsg('Tapped! email=' + rawEmail.length + ' pass=' + rawPass.length);

    if (!rawEmail || !rawPass) {
      setError('Please fill in all fields.');
      setDebugMsg('Empty fields: email=' + rawEmail.length + ' pass=' + rawPass.length);
      return;
    }

    setError('');
    setLoading(true);

    const cleanEmail = rawEmail.trim().replace(/[^\x20-\x7e]/g, '');

    try {
      setDebugMsg('[1] Connecting...');
      const supabase = createClient();

      setDebugMsg('[2] Signing in...');
      const { error: err, data } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: rawPass,
      });

      if (err) {
        setDebugMsg('[X] ' + err.message);
        setError(err.message);
        return;
      }

      setDebugMsg('[3] OK! ' + (data.user?.id?.slice(0, 8) || ''));

      try {
        const sessionId = getOrCreateSessionId();
        const status = await checkActiveSession(sessionId);
        if (status === 'conflict') {
          setShowConflict(true);
          return;
        }
        await registerSession(sessionId, 'StudySync Mobile');
      } catch {
        setDebugMsg('[4] Session skip');
      }

      try {
        await ensureReferralCode();
        const pendingRef = localStorage.getItem('studysync_pending_ref');
        if (pendingRef) {
          let ip: string | undefined;
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3000);
            const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
            clearTimeout(t);
            const json = await res.json() as { ip?: string };
            ip = json.ip;
          } catch { /* non-fatal */ }
          await processReferral(pendingRef, ip);
          localStorage.removeItem('studysync_pending_ref');
        }
      } catch { /* non-fatal */ }

      setDebugMsg('[5] Redirecting...');
      window.location.href = '/dashboard';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDebugMsg('[ERR] ' + msg);
      setError('Login failed: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKickOther = async () => {
    setConflictLoading(true);
    const sessionId = getOrCreateSessionId();
    await registerSession(sessionId, navigator.userAgent.slice(0, 200));
    window.location.href = '/dashboard';
  };

  const handleCancelConflict = async () => {
    setConflictLoading(true);
    await createClient().auth.signOut();
    setShowConflict(false);
    setConflictLoading(false);
  };

  const BG = "https://i.pinimg.com/originals/d7/b9/0c/d7b90cc80898e8823455a127945719af.jpg";

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 2.8rem 0.75rem 1rem',
    background: 'transparent',
    border: '2px solid rgba(255,255,255,0.2)',
    borderRadius: '9999px',
    color: '#fff',
    fontSize: '16px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    WebkitAppearance: 'none',
    position: 'relative',
    zIndex: 10,
  };

  return (
    <>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, backgroundImage: `url('${BG}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', zIndex: -2, pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: -1, pointerEvents: 'none' }} />

      <div className="min-h-screen flex items-center justify-center p-4" style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            width: '100%',
            maxWidth: 360,
            padding: '2.5rem 2rem',
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: '16px',
            color: '#fff',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {showConflict && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 16, zIndex: 50,
              background: 'rgba(10,15,25,0.96)', backdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '2rem',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', marginBottom: 16, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>!</div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>Already logged in elsewhere</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24 }}>Log out of the other device to continue?</p>
              <button onClick={handleKickOther} disabled={conflictLoading} style={{ width: '100%', padding: '0.7rem', borderRadius: 8, marginBottom: 10, background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 13, border: 'none', fontFamily: 'inherit', opacity: conflictLoading ? 0.6 : 1 }}>
                {conflictLoading ? 'Working...' : 'Yes, log out other device'}
              </button>
              <button onClick={handleCancelConflict} disabled={conflictLoading} style={{ width: '100%', padding: '0.7rem', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: 13, border: '1px solid rgba(255,255,255,0.2)', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          )}

          <h1 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 600, marginBottom: 4 }}>Login</h1>
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>Welcome back - sign in to continue</p>

          {/* DEBUG — remove after fixing */}
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 8, fontSize: '0.7rem', color: '#4ade80', textAlign: 'center', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {debugMsg}
          </div>

          {wasKicked && (
            <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, fontSize: '0.8rem', color: '#fbbf24', textAlign: 'center' }}>
              You were signed out because another device logged in.
            </div>
          )}

          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(229,72,77,0.18)', border: '1px solid rgba(229,72,77,0.4)', borderRadius: 8, fontSize: '0.8rem', color: '#ff8a8e', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <OAuthButtons />

          {/* Uncontrolled inputs — refs read the DOM value directly (Android WebView fix) */}
          <div style={{ position: 'relative', marginBottom: '1rem', zIndex: 10 }}>
            <input
              ref={emailRef}
              type="text"
              inputMode="email"
              placeholder="Email"
              name="ss_notmail"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue=""
              id="ss_em"
              style={inputStyle}
            />
            <i className="bx bx-envelope" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none', zIndex: 5 }} />
          </div>

          <div style={{ position: 'relative', marginBottom: '1.5rem', zIndex: 10 }}>
            <input
              ref={passRef}
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              name="ss_notpass"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue=""
              id="ss_pw"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, zIndex: 11 }}
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              <i className={`bx ${showPass ? 'bx-lock-open-alt' : 'bx-lock-alt'}`} style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
            </button>
          </div>

          <div style={{ textAlign: 'right', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
            <Link href="/forgot-password" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>Forgot password?</Link>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            style={{
              display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
              background: loading ? 'rgba(255,255,255,0.7)' : '#ffffff',
              color: '#0f172a', fontWeight: 600, fontSize: '0.9rem',
              border: 'none', marginBottom: '1.5rem', fontFamily: 'inherit',
              textAlign: 'center', boxSizing: 'border-box',
              position: 'relative', zIndex: 10,
            }}
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>Register</Link>
          </p>
        </div>
      </div>

      <style>{`
        #ss_em:focus, #ss_pw:focus {
          border-color: #22c55e !important;
          outline: none !important;
          box-shadow: 0 0 0 2px rgba(34,197,94,0.3) !important;
        }
      `}</style>
    </>
  );
}
