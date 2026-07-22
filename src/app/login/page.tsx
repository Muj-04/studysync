'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, BookOpen, Eye, EyeOff, FileText, Layers, Loader2, Sparkles, Users } from 'lucide-react';
import { ProductPreview } from '@/components/LandingHero';
import { createClient } from '@/lib/supabase/client';
import {
  checkActiveSession, registerSession, getOrCreateSessionId,
  ensureReferralCode, processReferral,
} from '@/lib/supabase/db';
import { clearLocalUserData } from '@/lib/clearLocalUserData';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M47.5 24.6c0-1.7-.1-3.2-.4-4.8H24.5v8.9h13c-.6 3-2.3 5.6-4.8 7.3l7.8 6.1c4.5-4.2 7-10.4 7-17.5z" />
      <path fill="#34A853" d="M24.5 48c6.5 0 12-2.2 15.9-5.8l-7.8-6.1c-2.2 1.5-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10H2.9v5.9C6.9 42.9 15 48 24.5 48z" />
      <path fill="#FBBC05" d="M10.9 28.4A14.5 14.5 0 0 1 10.2 24c0-1.5.3-3 .7-4.4v-5.9h-8A24 24 0 0 0 .5 24c0 3.9.9 7.5 2.4 10.3l8-5.9z" />
      <path fill="#EA4335" d="M24.5 9.6c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C36.4 2.4 31 0 24.5 0 15 0 6.9 5.1 2.9 13.7l8 5.9c1.9-5.8 7.3-10 13.6-10z" />
    </svg>
  );
}

export default function LoginPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [wasKicked, setWasKicked] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);

  useEffect(() => {
    setWasKicked(new URLSearchParams(window.location.search).get('kicked') === '1');
    const savedEmail = localStorage.getItem('studysync_login_email');
    if (savedEmail) {
      setEmail(savedEmail);
      if (emailRef.current) emailRef.current.value = savedEmail;
    }
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace('/dashboard');
    }).catch(() => {});
  }, []);

  const proceedToApp = async (sessionId: string) => {
    await registerSession(sessionId, navigator.userAgent.slice(0, 200));
    window.location.href = '/dashboard';
  };

  const processPendingReferral = async () => {
    try {
      await ensureReferralCode();
      const pendingRef = localStorage.getItem('studysync_pending_ref');
      if (!pendingRef) return;
      let ip: string | undefined;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const response = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
        clearTimeout(timer);
        ip = ((await response.json()) as { ip?: string }).ip;
      } catch { /* referral still works without IP */ }
      await processReferral(pendingRef, ip);
      localStorage.removeItem('studysync_pending_ref');
    } catch { /* referral processing must not block login */ }
  };

  const validate = (rawEmail: string, rawPassword: string) => {
    const cleanEmail = rawEmail.trim();
    let valid = true;
    if (!cleanEmail) { setEmailError('Enter your email address.'); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setEmailError('Enter a valid email address.'); valid = false; }
    if (!rawPassword) { setPasswordError('Enter your password.'); valid = false; }
    return valid;
  };

  const handleLogin = async () => {
    if (loading) return;
    // Read the DOM values directly as well as React state. Capacitor WebViews
    // can update autofilled inputs without reliably dispatching an input event.
    const rawEmail = emailRef.current?.value ?? email;
    const rawPassword = passwordRef.current?.value ?? password;
    if (!validate(rawEmail, rawPassword)) return;
    setError(''); setLoading(true);
    const cleanEmail = rawEmail.trim().replace(/[^\x20-\x7e]/g, '');
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email: cleanEmail, password: rawPassword });
      if (authError) {
        setError(/invalid login credentials/i.test(authError.message) ? 'Incorrect email or password. Please try again.' : authError.message);
        return;
      }
      if (remember) localStorage.setItem('studysync_login_email', cleanEmail);
      else localStorage.removeItem('studysync_login_email');

      try {
        const sessionId = getOrCreateSessionId();
        if (await checkActiveSession(sessionId) === 'conflict') { setShowConflict(true); return; }
        await registerSession(sessionId, navigator.userAgent.slice(0, 200));
      } catch { /* proceed if session status cannot be checked */ }

      await processPendingReferral();
      window.location.href = '/dashboard';
    } catch { setError('Login failed. Check your connection and try again.'); }
    finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true); setError('');
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) { setError(oauthError.message); setGoogleLoading(false); }
  };

  const handleKickOther = async () => {
    setConflictLoading(true);
    await proceedToApp(getOrCreateSessionId());
  };

  const handleCancelConflict = async () => {
    setConflictLoading(true);
    await createClient().auth.signOut();
    await clearLocalUserData();
    setShowConflict(false); setConflictLoading(false);
  };

  return (
    <main className="login-shell">
      <section className="login-story">
        <Link href="/" className="login-brand"><span><BookOpen size={19} strokeWidth={2.4} /></span>StudySync</Link>
        <div className="story-copy">
          <div className="story-eyebrow"><Sparkles size={14} /> One workspace for focused learning</div>
          <h1>Your notes, flashcards,<br />and study groups <span>in one place.</span></h1>
          <p>Organize your academic life, understand difficult material, and prepare for exams with StudySync.</p>
        </div>
        <div className="login-visual">
          <div className="login-students" aria-hidden="true">
            <Image
              src="/landing/studysync-students.png"
              alt=""
              width={1536}
              height={1024}
              priority
              sizes="(max-width: 900px) 0px, 34vw"
            />
          </div>
          <div className="login-product-preview"><ProductPreview /></div>
        </div>
        <div className="story-features">
          <span><FileText size={13} /> PDF notes</span>
          <span><Layers size={13} /> Flashcards</span>
          <span><Users size={13} /> Study groups</span>
          <span><Sparkles size={13} /> AI assistant</span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <div className="mobile-brand"><span><BookOpen size={17} /></span>StudySync</div>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Enter your details to access your workspace.</p>

          {wasKicked && <div className="notice warning"><AlertCircle size={15} />You were signed out because another device logged in.</div>}
          {error && <div className="notice error" role="alert"><AlertCircle size={15} />{error}</div>}

          <form onSubmit={(event) => { event.preventDefault(); handleLogin(); }} noValidate>
            <label htmlFor="login-email">Email</label>
            <input
              ref={emailRef} id="login-email" name="email" type="email" inputMode="email" autoComplete="email"
              value={email} placeholder="you@university.edu"
              aria-invalid={!!emailError} aria-describedby={emailError ? 'email-error' : undefined}
              onChange={(event) => { setEmail(event.target.value); setEmailError(''); setError(''); }}
              className={emailError ? 'invalid' : ''}
            />
            {emailError && <span id="email-error" className="field-error">{emailError}</span>}

            <label htmlFor="login-password">Password</label>
            <div className="password-wrap">
              <input
                ref={passwordRef} id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                value={password} placeholder="Enter your password"
                aria-invalid={!!passwordError} aria-describedby={passwordError ? 'password-error' : undefined}
                onChange={(event) => { setPassword(event.target.value); setPasswordError(''); setError(''); }}
                className={passwordError ? 'invalid' : ''}
              />
              <button type="button" className="show-password" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {passwordError && <span id="password-error" className="field-error">{passwordError}</span>}

            <div className="form-options">
              <label className="remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span />Remember me</label>
              <Link href="/forgot-password">Forgot password?</Link>
            </div>

            <button className="login-submit" type="submit" disabled={loading || googleLoading}>
              {loading ? <><Loader2 className="spin" size={16} />Signing in…</> : 'Log In'}
            </button>
          </form>

          <div className="login-divider"><span />Or continue with<span /></div>
          <button className="google-button" type="button" onClick={handleGoogle} disabled={loading || googleLoading}>
            {googleLoading ? <Loader2 className="spin" size={17} /> : <GoogleIcon />}{googleLoading ? 'Redirecting…' : 'Google'}
          </button>
          <p className="create-account">Don&apos;t have an account? <Link href="/register">Create one</Link></p>
        </div>
      </section>

      {showConflict && (
        <div className="conflict-backdrop" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
          <div className="conflict-dialog">
            <div className="conflict-icon">!</div>
            <h3 id="conflict-title">Already logged in elsewhere</h3>
            <p>You&apos;re signed in on another device. Continue here and sign out the other device?</p>
            <button className="danger-button" disabled={conflictLoading} onClick={handleKickOther}>{conflictLoading ? 'Switching device…' : 'Continue on this device'}</button>
            <button className="cancel-button" disabled={conflictLoading} onClick={handleCancelConflict}>Cancel</button>
          </div>
        </div>
      )}

      <style>{`
        .login-shell { min-height: 100dvh; display: grid; grid-template-columns: minmax(540px, 1.12fr) minmax(500px, .88fr); background: #f9f7fd; color: #171a28; font-family: var(--font-body); }
        .login-story { position: relative; min-height: 100dvh; padding: 40px clamp(38px, 4.4vw, 72px) 26px; overflow: hidden; display: flex; flex-direction: column; background: radial-gradient(circle at 16% 24%, rgba(133,83,239,.14), transparent 31%), radial-gradient(circle at 82% 68%, rgba(111,78,214,.11), transparent 35%), linear-gradient(145deg, #fbfaff 0%, #f4f1ff 60%, #faf9fd 100%); border-right: 1px solid rgba(82,60,122,.13); }
        .login-story::after { content: ''; position: absolute; width: 520px; height: 520px; left: -220px; bottom: -260px; border-radius: 50%; background: rgba(117,64,223,.1); filter: blur(22px); }
        .login-brand, .mobile-brand { display: inline-flex; align-items: center; gap: 10px; color: #171a28; text-decoration: none; font-size: 18px; font-weight: 800; letter-spacing: -.025em; width: fit-content; }
        .login-brand > span, .mobile-brand > span { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: linear-gradient(135deg, #8954ef, #6432d3); color: #fff; box-shadow: 0 8px 20px rgba(107,57,213,.26); }
        .story-copy { margin-top: clamp(42px, 6vh, 70px); position: relative; z-index: 3; }
        .story-eyebrow { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 17px; padding: 6px 11px; border: 1px solid rgba(116,65,232,.2); border-radius: 999px; color: #6c38d3; background: rgba(255,255,255,.72); font-size: 11px; font-weight: 750; }
        .story-copy h1 { margin: 0; max-width: 660px; color: #171a28; font-size: clamp(40px, 3.65vw, 66px); line-height: 1.055; letter-spacing: -.052em; font-weight: 820; }
        .story-copy h1 span { display: inline-block; color: transparent; background: linear-gradient(105deg, #8b55ef 8%, #6331d0 80%); background-clip: text; -webkit-background-clip: text; }
        .story-copy p { margin: 20px 0 0; max-width: 580px; color: #666b7b; font-size: 15px; line-height: 1.7; }
        .login-visual { position: relative; z-index: 2; width: min(100%, 860px); height: clamp(420px, 47vh, 540px); margin: auto auto 0; }
        .login-students { position: absolute; z-index: 1; top: 0; left: 50%; width: min(66%, 590px); transform: translateX(-50%); pointer-events: none; -webkit-mask-image: radial-gradient(ellipse 72% 76% at 50% 54%, #000 62%, transparent 100%); mask-image: radial-gradient(ellipse 72% 76% at 50% 54%, #000 62%, transparent 100%); }
        .login-students img { display: block; width: 100%; height: auto; mix-blend-mode: multiply; filter: saturate(.94) drop-shadow(0 16px 25px rgba(73,48,120,.08)); }
        .login-product-preview { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; }
        .story-features { position: relative; z-index: 3; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 18px; color: #5f586d; font-size: 10.5px; font-weight: 650; }.story-features span { display: flex; align-items: center; gap: 5px; }.story-features svg { color: #7541db; flex-shrink: 0; }
        .login-form-side { min-height: 100dvh; display: grid; place-items: center; padding: 48px clamp(30px, 4.5vw, 76px); background: radial-gradient(circle at 52% 38%, rgba(129,76,228,.1), transparent 34%), linear-gradient(160deg, #fdfcff 0%, #f8f6fd 55%, #f4f1fb 100%); }
        .login-card { width: 100%; max-width: 500px; box-sizing: border-box; padding: clamp(36px, 3.5vw, 52px); border: 1px solid rgba(94,72,132,.1); border-radius: 22px; background: rgba(255,255,255,.95); box-shadow: 0 30px 78px rgba(56,39,87,.11), 0 2px 8px rgba(56,39,87,.04); backdrop-filter: blur(18px); }.mobile-brand { display: none; }
        .login-card h2 { margin: 0; font-size: clamp(32px, 2.5vw, 42px); color: #171a28; letter-spacing: -.045em; }.login-subtitle { margin: 9px 0 34px; color: #777b89; font-size: 14px; }
        .login-card form > label { display: block; margin: 0 0 8px; color: #343745; font-size: 12.5px; font-weight: 700; }
        .login-card input[type='email'], .login-card input[type='password'], .login-card input[type='text'] { width: 100%; height: 52px; box-sizing: border-box; padding: 0 15px; margin-bottom: 20px; border: 1px solid #ddd9e4; border-radius: 10px; background: #fff; color: #262834; font: inherit; font-size: 13.5px; outline: 0; box-shadow: 0 2px 5px rgba(56,39,87,.06); transition: border-color .15s, box-shadow .15s; }
        .login-card input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }.login-card input.invalid { border-color: #ef4444; margin-bottom: 5px; }
        .password-wrap { position: relative; }.password-wrap input { padding-right: 48px !important; }.show-password { position: absolute; right: 13px; top: 13px; width: 26px; height: 26px; border: 0; border-radius: 6px; display: grid; place-items: center; color: #96909e; background: transparent; cursor: pointer; }.show-password:hover { color: #7040d5; background: #f4effd; }
        .field-error { display: block; margin: 0 0 16px; color: #dc2626; font-size: 11.5px; }
        .form-options { margin: -2px 0 21px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }.form-options a, .create-account a { color: var(--accent); text-decoration: none; font-weight: 600; }
        .remember { display: flex !important; align-items: center; gap: 8px; margin: 0 !important; cursor: pointer; color: #535764 !important; font-weight: 500 !important; }.remember input { position: absolute; opacity: 0; pointer-events: none; }.remember span { width: 15px; height: 15px; border: 1px solid #cfc8d9; border-radius: 4px; display: grid; place-items: center; }.remember input:checked + span { background: #7540df; border-color: #7540df; }.remember input:checked + span::after { content: '✓'; color: #fff; font-size: 10px; font-weight: 800; }
        .login-submit, .google-button, .danger-button, .cancel-button { width: 100%; height: 52px; border-radius: 10px; border: 0; font: inherit; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }.login-submit { background: linear-gradient(110deg, #7540df, #8a4cef); color: #fff; box-shadow: 0 12px 28px rgba(108,57,209,.24); }.login-submit:hover { background: linear-gradient(110deg, #6934d4, #7d40e4); transform: translateY(-1px); }.login-submit:disabled, .google-button:disabled { cursor: not-allowed; opacity: .65; }
        .login-divider { margin: 30px 0 20px; display: flex; align-items: center; gap: 14px; color: #78869b; font-size: 11.5px; white-space: nowrap; }.login-divider span { height: 1px; flex: 1; background: #dde3ec; }
        .google-button { border: 1px solid #ddd9e4; background: #fff; color: #343745; box-shadow: 0 2px 5px rgba(56,39,87,.05); }.google-button:hover { border-color: #b9a9dc; background: #fff; transform: translateY(-1px); }
        .create-account { margin: 28px 0 0; text-align: center; color: #777b89; font-size: 12px; }
        .notice { margin: -18px 0 20px; padding: 10px 12px; border-radius: 8px; display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.45; }.notice.error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }.notice.warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
        .conflict-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgba(15,23,42,.58); backdrop-filter: blur(5px); }.conflict-dialog { width: min(390px, 100%); box-sizing: border-box; padding: 28px; border-radius: 14px; background: #fff; color: #172033; text-align: center; box-shadow: 0 24px 65px rgba(0,0,0,.24); }.conflict-icon { width: 44px; height: 44px; margin: 0 auto 14px; display: grid; place-items: center; border-radius: 50%; background: #fee2e2; color: #dc2626; font-weight: 800; }.conflict-dialog h3 { margin: 0 0 8px; font-size: 17px; }.conflict-dialog p { margin: 0 0 22px; color: #64748b; font-size: 13px; line-height: 1.55; }.danger-button { background: #ef4444; color: #fff; margin-bottom: 9px; }.cancel-button { background: #f1f5f9; color: #475569; }
        .spin { animation: login-spin .8s linear infinite; } @keyframes login-spin { to { transform: rotate(360deg); } }
        @media (max-width: 1100px) and (min-width: 901px) { .login-shell { grid-template-columns: minmax(470px, 1fr) minmax(430px, .92fr); }.login-story { padding-left: 34px; padding-right: 34px; }.story-copy h1 { font-size: 46px; }.login-visual { height: 430px; }.story-features { grid-template-columns: repeat(2, minmax(0,1fr)); }.login-card { padding: 38px; } }
        @media (max-width: 900px) { .login-shell { grid-template-columns: 1fr; }.login-story { display: none; }.login-form-side { padding: 36px 24px; }.mobile-brand { display: inline-flex; margin-bottom: 48px; }.login-card { max-width: 500px; }.login-card h2 { font-size: 32px; } }
        @media (max-width: 480px) { .login-form-side { place-items: start center; padding: 18px 12px 32px; }.login-card { padding: 28px 20px; border-radius: 18px; }.mobile-brand { margin-bottom: 38px; }.login-subtitle { margin-bottom: 30px; }.form-options { font-size: 11.5px; } }
        @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 1.8s; } }
      `}</style>
    </main>
  );
}
