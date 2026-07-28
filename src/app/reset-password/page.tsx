'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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

const BG = "https://i.pinimg.com/originals/d7/b9/0c/d7b90cc80898e8823455a127945719af.jpg";

function AuthBg() {
  return (
    <>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, backgroundImage: `url('${BG}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', zIndex: -2, pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: -1, pointerEvents: 'none' }} />
    </>
  );
}

type Status = 'loading' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordPage() {
  const [status, setStatus]       = useState<Status>('loading');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Read callback parameters before creating the browser client. Supabase
    // automatically exchanges a PKCE code during client initialization and
    // then removes that one-time code from the address bar.
    const initialUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(initialUrl.hash.slice(1));
    const redirectError = initialUrl.searchParams.get('error_description')
      ?? hashParams.get('error_description');
    const hasRecoveryParameters = initialUrl.searchParams.has('code')
      || hashParams.has('access_token')
      || hashParams.get('type') === 'recovery';

    if (redirectError || !hasRecoveryParameters) {
      const timer = window.setTimeout(() => setStatus('invalid'), 0);
      return () => window.clearTimeout(timer);
    }

    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled && event === 'PASSWORD_RECOVERY' && session) {
        setStatus('ready');
      }
    });

    const run = async () => {
      // Implicit flow: hash tokens — Supabase client parses them automatically.
      // Listen for the PASSWORD_RECOVERY event which fires once the session is set.
      const { error: initializationError } = await supabase.auth.initialize();
      if (cancelled) return;

      if (initializationError) {
        setStatus('invalid');
        subscription.unsubscribe();
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      setStatus(!sessionError && session ? 'ready' : 'invalid');
    };

    void run();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    if (!password) { setError('Please enter a new password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    setSubmitting(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setSubmitting(false); setError(err.message); return; }

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    setSubmitting(false);
    if (signOutError) {
      setError('Password updated, but the recovery session could not be closed. Please log out and try again.');
      return;
    }
    setStatus('done');
  };

  /* ── Loading ── */
  if (status === 'loading') {
    return (
      <>
        <AuthBg />
        <div className="min-h-screen flex items-center justify-center p-4">
          <div style={{
            width: '100%', maxWidth: 360, padding: '2.5rem 2rem', textAlign: 'center',
            background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)', border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: '16px', color: '#fff',
          }}>
            <div className="spinner" style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
              margin: '0 auto 16px',
            }} />
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
              Verifying reset link…
            </p>
          </div>
        </div>
      </>
    );
  }

  /* ── Invalid link ── */
  if (status === 'invalid') {
    return (
      <>
        <AuthBg />
        <div className="min-h-screen flex items-center justify-center p-4">
          <div style={{
            width: '100%', maxWidth: 360, padding: '2.5rem 2rem', textAlign: 'center',
            background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)', border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: '16px', color: '#fff',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔗</div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: 8 }}>Link expired</h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem' }}>
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              style={{
                display: 'block', padding: '0.8rem', borderRadius: '9999px',
                background: '#ffffff', color: '#0f172a',
                fontWeight: 600, fontSize: '0.9rem', textAlign: 'center',
                textDecoration: 'none', marginBottom: '1rem',
              }}
            >
              Request new link
            </Link>
            <Link href="/login" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
              Back to Login
            </Link>
          </div>
        </div>
      </>
    );
  }

  /* ── Done ── */
  if (status === 'done') {
    return (
      <>
        <AuthBg />
        <div className="min-h-screen flex items-center justify-center p-4">
          <div style={{
            width: '100%', maxWidth: 360, padding: '2.5rem 2rem', textAlign: 'center',
            background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)', border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: '16px', color: '#fff',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: 8 }}>Password updated!</h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem' }}>
              Your password has been changed. You can now log in with your new password.
            </p>
            <Link
              href="/login"
              style={{
                display: 'block', padding: '0.8rem', borderRadius: '9999px',
                background: '#ffffff', color: '#0f172a',
                fontWeight: 600, fontSize: '0.9rem', textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              Go to Login
            </Link>
          </div>
        </div>
      </>
    );
  }

  /* ── Ready: show form ── */
  return (
    <>
      <AuthBg />
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
          }}
        >
          <h1 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 600, marginBottom: 4 }}>
            Set New Password
          </h1>
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>
            Choose a strong password for your account.
          </p>

          {error && (
            <div style={{
              marginBottom: '1rem', padding: '0.6rem 1rem',
              background: 'rgba(229,72,77,0.18)', border: '1px solid rgba(229,72,77,0.4)',
              borderRadius: 8, fontSize: '0.8rem', color: '#ff8a8e', textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          {/* New password */}
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="New password (min 6 chars)"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
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

          {/* Confirm password */}
          <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              style={{
                ...glassInput,
                borderColor: confirm && confirm !== password
                  ? 'rgba(229,72,77,0.6)'
                  : 'rgba(255,255,255,0.2)',
              }}
            />
            <i className="bx bx-lock-alt" style={{
              position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none',
            }} />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
              background: submitting ? 'rgba(255,255,255,0.7)' : '#ffffff',
              color: '#0f172a', fontWeight: 600, fontSize: '0.9rem',
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              marginBottom: '1.5rem', fontFamily: 'inherit', textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            {submitting ? 'Updating…' : 'Set New Password'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            <Link href="/login" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
