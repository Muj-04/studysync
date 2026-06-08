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

  return (
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
  );
}
