'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const OAUTH_REDIRECT = 'https://pdf-study-workspace.vercel.app/auth/callback';

function OAuthButtons() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);

  const signIn = async (provider: 'google' | 'apple') => {
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

      {/* Apple */}
      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => signIn('apple')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', height: 44, borderRadius: 9999,
          background: loadingProvider === 'apple' ? '#111' : '#000000',
          border: '1.5px solid rgba(255,255,255,0.25)',
          cursor: loadingProvider !== null ? 'not-allowed' : 'pointer',
          color: '#ffffff', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit',
          transition: 'background 0.15s, opacity 0.15s',
          opacity: loadingProvider !== null && loadingProvider !== 'apple' ? 0.5 : 1,
        }}
        onMouseOver={(e) => { if (!loadingProvider) e.currentTarget.style.background = '#1a1a1a'; }}
        onMouseOut={(e) => { if (!loadingProvider) e.currentTarget.style.background = '#000000'; }}
      >
        <svg width="16" height="18" viewBox="0 0 814 1000" style={{ flexShrink: 0 }} fill="#ffffff">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46 427.5 114.3 261.3 152.8 194.6c28.4-49.5 74.8-82 127.1-82 50.2 0 84.7 35.4 152.3 35.4 65.8 0 107.5-35.4 164-35.4 56.5 0 100.6 28.6 130.6 77.3zm-219.7-109.4c-12.3-26.6-30.4-53.1-57.7-73.6-27.3-20.5-57.7-33.2-84.5-33.2-2.1 0-4.3.2-6.4.5 1.3 37.2 18.3 74.4 40.6 100.8 21.8 25.7 55.7 47.5 87.7 56.1 2.5.7 5.1 1.1 7.7 1.3 1.3-18 0-36.3-13.3-51.9h26z"/>
        </svg>
        {loadingProvider === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.18)' }} />
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
          or continue with email
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.18)' }} />
      </div>
    </div>
  );
}

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

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace('/dashboard');
    });
  }, []);

  const handleRegister = async () => {
    if (!username || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setMessage('Account created! Check your email to confirm, then log in.');
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
        }}
      >
        <h1 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 600, marginBottom: 4 }}>
          Register
        </h1>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>
          Create your account to get started
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

        {message && (
          <div style={{
            marginBottom: '1rem', padding: '0.6rem 1rem',
            background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.4)',
            borderRadius: 8, fontSize: '0.8rem', color: '#6ee7b7', textAlign: 'center',
          }}>
            {message}
          </div>
        )}

        <OAuthButtons />

        {/* Username */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={glassInput}
          />
          <i className="bx bx-user" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
        </div>

        {/* Email */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={glassInput}
          />
          <i className="bx bx-envelope" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
        </div>

        {/* Password */}
        <div style={{ position: 'relative', marginBottom: '1.75rem' }}>
          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Password (min 6 chars)"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        <button
          onClick={handleRegister}
          disabled={loading || !!message}
          style={{
            display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
            background: (loading || !!message) ? 'rgba(255,255,255,0.7)' : '#ffffff',
            color: '#0f172a', fontWeight: 600, fontSize: '0.9rem',
            border: 'none', cursor: (loading || !!message) ? 'not-allowed' : 'pointer',
            marginBottom: '1.5rem', fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
          }}
        >
          {loading ? 'Creating account…' : 'Create Account'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
            Login
          </Link>
        </p>
      </div>
      </div>
    </>
  );
}
