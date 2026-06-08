'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 2.8rem 0.75rem 1rem',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid #1e293b',
  borderRadius: '4px',
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
          background: 'rgba(9,9,11,0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid #1e293b',
          borderRadius: '4px',
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
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 4, fontSize: '0.8rem', color: '#ef4444', textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{
            marginBottom: '1rem', padding: '0.6rem 1rem',
            background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.4)',
            borderRadius: 4, fontSize: '0.8rem', color: '#6ee7b7', textAlign: 'center',
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
            display: 'block', width: '100%', padding: '0.8rem', borderRadius: '4px',
            background: (loading || !!message) ? 'rgba(255,255,255,0.7)' : '#ffffff',
            color: '#ffffff', fontWeight: 600, fontSize: '0.9rem',
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
