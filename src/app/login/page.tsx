'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

// Glassmorphism constants shared across inputs
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('isLoggedIn')) window.location.replace('/workspace');
  }, []);

  const handleLogin = () => {
    localStorage.setItem('isLoggedIn', 'true');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Glassmorphism card */}
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
        {/* Heading */}
        <h1 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 600, marginBottom: 4 }}>
          Login
        </h1>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>
          Welcome back — sign in to continue
        </p>

        {/* Username */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="glass-input"
            style={glassInput}
          />
          <i className="bx bx-user" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.25rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
        </div>

        {/* Password */}
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="glass-input"
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

        {/* Remember me + Forgot password */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', fontSize: '0.85rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: '#fff', width: 14, height: 14 }} />
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>Remember me</span>
          </label>
          <a href="#" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}>
            Forgot password?
          </a>
        </div>

        {/* Login button */}
        <Link
          href="/workspace"
          onClick={handleLogin}
          style={{ display: 'block', width: '100%', padding: '0.8rem', borderRadius: '9999px', background: '#ffffff', color: '#0f172a', fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer', marginBottom: '1.5rem', fontFamily: 'inherit', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}
        >
          Login
        </Link>

        {/* Register link */}
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
