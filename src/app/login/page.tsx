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
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Session conflict dialog state
  const [showConflict, setShowConflict] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);

  // Kicked-from-other-device banner
  const [wasKicked, setWasKicked] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWasKicked(new URLSearchParams(window.location.search).get('kicked') === '1');
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace('/dashboard');
    });
  }, []);

  const proceedToApp = async (sessionId: string) => {
    await registerSession(sessionId, navigator.userAgent.slice(0, 200));
    window.location.href = '/dashboard';
  };

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) { setLoading(false); setError(err.message); return; }

    // Auth succeeded — check for session conflict before redirecting
    const sessionId = getOrCreateSessionId();
    const status = await checkActiveSession(sessionId);

    setLoading(false);

    if (status === 'conflict') {
      setShowConflict(true);
      return;
    }

    // 'ok' or 'free_user' — register and proceed
    await proceedToApp(sessionId);
  };

  const handleKickOther = async () => {
    setConflictLoading(true);
    const sessionId = getOrCreateSessionId();
    await proceedToApp(sessionId); // registerSession inside proceedToApp overwrites the old one
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
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, backgroundImage: `url('${BG}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', zIndex: -2, pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: -1, pointerEvents: 'none' }} />
      <div className="min-h-screen flex items-center justify-center p-4">
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
        }}
      >
        {/* ── Session conflict dialog (overlay inside card) ── */}
        {showConflict && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 16, zIndex: 10,
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
              ⚠️
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
              {conflictLoading ? 'Logging out other device…' : 'Yes, log out other device'}
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
          Welcome back — sign in to continue
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

        {/* Email */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={glassInput}
          />
          <i className="bx bx-envelope" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
        </div>

        {/* Password */}
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={glassInput}
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            <i className={`bx ${showPass ? 'bx-lock-open-alt' : 'bx-lock-alt'}`} style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)' }} />
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
          onClick={handleLogin}
          disabled={loading}
          style={{
            display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
            background: loading ? 'rgba(255,255,255,0.7)' : '#ffffff',
            color: '#0f172a', fontWeight: 600, fontSize: '0.9rem',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '1.5rem', fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
          }}
        >
          {loading ? 'Signing in…' : 'Login'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
            Register
          </Link>
        </p>
      </div>
      </div>
    </>
  );
}
