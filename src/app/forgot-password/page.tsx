'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const REDIRECT = 'https://pdf-study-workspace.vercel.app/reset-password';

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

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: REDIRECT,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
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
        <h1 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 600, marginBottom: 4 }}>
          Reset Password
        </h1>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>
          {sent ? 'Check your inbox for the reset link.' : 'Enter your email and we\'ll send a reset link.'}
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

        {sent ? (
          /* ── Success state ── */
          <div style={{
            marginBottom: '1.5rem', padding: '0.9rem 1rem',
            background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.4)',
            borderRadius: 10, textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📬</div>
            <p style={{ fontSize: '0.85rem', color: '#6ee7b7', margin: 0, lineHeight: 1.5 }}>
              Check your email for a reset link.<br />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                It may take a minute to arrive.
              </span>
            </p>
          </div>
        ) : (
          /* ── Email input ── */
          <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              style={glassInput}
            />
            <i className="bx bx-envelope" style={{
              position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none',
            }} />
          </div>
        )}

        {!sent && (
          <button
            onClick={handleSend}
            disabled={loading}
            style={{
              display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
              background: loading ? 'rgba(255,255,255,0.7)' : '#ffffff',
              color: '#0f172a', fontWeight: 600, fontSize: '0.9rem',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '1.5rem', fontFamily: 'inherit', textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        )}

        {sent && (
          <Link
            href="/login"
            style={{
              display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              fontWeight: 600, fontSize: '0.9rem', textAlign: 'center',
              textDecoration: 'none', marginBottom: '1.5rem', boxSizing: 'border-box',
              border: '1.5px solid rgba(255,255,255,0.25)',
            }}
          >
            Back to Login
          </Link>
        )}

        {!sent && (
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Remember your password?{' '}
            <Link href="/login" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
              Login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
