'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  checkActiveSession,
  registerSession,
  getOrCreateSessionId,
} from '@/lib/supabase/db';

const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 2.8rem 0.75rem 1rem',
  background: 'transparent',
  border: '2px solid rgba(255,255,255,0.2)',
  borderRadius: '9999px',
  color: '#fff',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
  fontFamily: 'inherit',
  position: 'relative' as const,
  zIndex: 10,
  pointerEvents: 'auto' as const,
  WebkitAppearance: 'none' as const,
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const proceedToApp = async (sessionId: string) => {
    await registerSession(sessionId, navigator.userAgent.slice(0, 200));
    window.location.href = '/dashboard';
  };

  const handleLogin = async () => {
    if (loading) return;
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);

    const cleanEmail = email.trim().replace(/[^\x20-\x7e]/g, '');

    console.log('[LOGIN] start', cleanEmail.length, 'ch');

    try {
      const supabase = createClient();
      const { error: err, data } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (err) {
        console.log('[LOGIN] error', err.message);
        setError(err.message);
        return;
      }

      console.log('[LOGIN] ok', data.user?.id?.slice(0, 8));

      try {
        const sessionId = getOrCreateSessionId();
        const status = await checkActiveSession(sessionId);

        if (status === 'conflict') {
          setShowConflict(true);
          return;
        }

        await registerSession(sessionId, 'StudySync Mobile');
      } catch {
        // Session check failed - proceed anyway
      }

      try {
        window.location.href = '/dashboard';
      } catch {
        window.location.replace('/dashboard');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKickOther = async () => {
    setConflictLoading(true);
    const sessionId = getOrCreateSessionId();
    await proceedToApp(sessionId);
  };

  const handleCancelConflict = async () => {
    setConflictLoading(true);
    await createClient().auth.signOut();
    setShowConflict(false);
    setConflictLoading(false);
  };

  const BG = "https://i.pinimg.com/originals/d7/b9/0c/d7b90cc80898e8823455a127945719af.jpg";

  return (
    <>
      {/* Decorative backgrounds - pointer-events: none so they never block taps */}
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
          {/* Session conflict dialog */}
          {showConflict && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 16, zIndex: 50,
              background: 'rgba(10,15,25,0.96)', backdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '2rem',
              animation: 'scale-in 0.15s ease-out both',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', marginBottom: 16,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>
                !
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, textAlign: 'center', lineHeight: 1.4 }}>
                Already logged in elsewhere
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
                You&apos;re already logged in on another device. Log out of the other device to continue?
              </p>

              <button
                onClick={handleKickOther}
                disabled={conflictLoading}
                style={{
                  width: '100%', padding: '0.7rem', borderRadius: 8, marginBottom: 10,
                  background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 13,
                  border: 'none', cursor: conflictLoading ? 'not-allowed' : 'pointer',
                  opacity: conflictLoading ? 0.6 : 1, fontFamily: 'inherit',
                }}
              >
                {conflictLoading ? 'Logging out other device...' : 'Yes, log out other device'}
              </button>

              <button
                onClick={handleCancelConflict}
                disabled={conflictLoading}
                style={{
                  width: '100%', padding: '0.7rem', borderRadius: 8,
                  background: 'transparent', color: 'rgba(255,255,255,0.7)',
                  fontWeight: 500, fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.2)',
                  cursor: conflictLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          )}

          <h1 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 600, marginBottom: 4 }}>
            Login
          </h1>
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>
            Welcome back - sign in to continue
          </p>

          {wasKicked && (
            <div style={{
              marginBottom: '1rem', padding: '0.6rem 1rem',
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: 8, fontSize: '0.8rem', color: '#fbbf24', textAlign: 'center',
            }}>
              You were signed out because another device logged in.
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: '1rem', padding: '0.6rem 1rem',
              background: 'rgba(229,72,77,0.18)', border: '1px solid rgba(229,72,77,0.4)',
              borderRadius: 8, fontSize: '0.8rem', color: '#ff8a8e', textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <form
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
            onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
            style={{ position: 'relative', zIndex: 10 }}
          >
            {/* Hidden honeypot to confuse autofill */}
            <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
            <input type="password" name="pass" autoComplete="current-password" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />

            {/* Email */}
            <div style={{ position: 'relative', marginBottom: '1rem', zIndex: 10 }}>
              <input
                type="email"
                inputMode="email"
                placeholder="Email"
                name="studysync_email"
                id="studysync_email"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => console.log('[DEBUG] email focused')}
                style={glassInput}
              />
              <i className="bx bx-envelope" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none', zIndex: 5 }} />
            </div>

            {/* Password */}
            <div style={{ position: 'relative', marginBottom: '1.5rem', zIndex: 10 }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                name="studysync_password"
                id="studysync_password"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => console.log('[DEBUG] password focused')}
                style={glassInput}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, zIndex: 11, pointerEvents: 'auto' }}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                <i className={`bx ${showPass ? 'bx-lock-open-alt' : 'bx-lock-alt'}`} style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
              </button>
            </div>

            {/* Forgot password */}
            <div style={{ textAlign: 'right', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
              <Link
                href="/forgot-password"
                style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}
              >
                Forgot password?
              </Link>
            </div>

            {/* Login button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
                background: loading ? 'rgba(255,255,255,0.7)' : '#ffffff',
                color: '#0f172a', fontWeight: 600, fontSize: '0.9rem',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '1.5rem', fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
                position: 'relative', zIndex: 10, pointerEvents: 'auto',
              }}
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Don&apos;t have an account?{' '}
            <Link href="/register" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
              Register
            </Link>
          </p>
        </div>
      </div>

      {/* Debug focus style - visible green border on focus */}
      <style>{`
        #studysync_email:focus,
        #studysync_password:focus {
          border-color: #22c55e !important;
          outline: none !important;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3) !important;
        }
      `}</style>
    </>
  );
}
