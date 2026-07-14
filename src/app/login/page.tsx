'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BookOpen, Eye, EyeOff, FileText, Layers, Loader2, MessageSquare, Mic, PenLine, Sparkles } from 'lucide-react';
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

function WorkspacePreview() {
  return (
    <div className="login-preview" aria-hidden="true">
      <div className="preview-topbar">
        <span className="preview-dot" /><span className="preview-tab" /><span className="preview-tab short" />
      </div>
      <div className="preview-body">
        <div className="preview-rail">
          <span className="preview-rail-line active" />
          <span className="preview-rail-line" />
          <span className="preview-rail-line" />
          <span className="preview-rail-line" />
        </div>
        <div className="preview-pages"><span /><span /><span /></div>
        <div className="preview-paper">
          <div className="preview-paper-title" />
          <div className="preview-paper-line wide" /><div className="preview-paper-line" />
          <div className="preview-highlight" />
          <div className="preview-paper-line wide" /><div className="preview-paper-line mid" />
          <div className="preview-note">AI summary</div>
        </div>
        <div className="preview-panel">
          <div className="preview-panel-tabs"><span /><span className="on" /><span /></div>
          <div className="preview-message" /><div className="preview-message small" />
        </div>
      </div>
      <div className="preview-tools"><FileText size={13} /><PenLine size={13} /><MessageSquare size={13} /><Mic size={13} /><Sparkles size={13} /></div>
    </div>
  );
}

export default function LoginPage() {
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
    if (savedEmail) setEmail(savedEmail);
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

  const validate = () => {
    const cleanEmail = email.trim();
    let valid = true;
    if (!cleanEmail) { setEmailError('Enter your email address.'); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setEmailError('Enter a valid email address.'); valid = false; }
    if (!password) { setPasswordError('Enter your password.'); valid = false; }
    return valid;
  };

  const handleLogin = async () => {
    if (loading || !validate()) return;
    setError(''); setLoading(true);
    const cleanEmail = email.trim().replace(/[^\x20-\x7e]/g, '');
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email: cleanEmail, password });
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
          <h1>Your notes, flashcards,<br />and study groups in one place.</h1>
          <p>Organize your academic life, understand difficult material, and prepare for exams with StudySync.</p>
        </div>
        <WorkspacePreview />
        <div className="story-features"><span><FileText size={13} /> PDF notes</span><span><Layers size={13} /> Flashcards</span><span><Sparkles size={13} /> AI study tools</span></div>
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
              id="login-email" type="email" inputMode="email" autoComplete="email"
              value={email} placeholder="you@university.edu"
              aria-invalid={!!emailError} aria-describedby={emailError ? 'email-error' : undefined}
              onChange={(event) => { setEmail(event.target.value); setEmailError(''); setError(''); }}
              className={emailError ? 'invalid' : ''}
            />
            {emailError && <span id="email-error" className="field-error">{emailError}</span>}

            <label htmlFor="login-password">Password</label>
            <div className="password-wrap">
              <input
                id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
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
        .login-shell { min-height: 100dvh; display: grid; grid-template-columns: minmax(440px, 1fr) minmax(520px, 1.18fr); background: #fff; color: #111827; font-family: var(--font-body); }
        .login-story { position: relative; min-height: 100dvh; padding: 48px 50px 34px; overflow: hidden; display: flex; flex-direction: column; background: linear-gradient(145deg, #f8faff 0%, #f4f6fb 58%, #eef1f8 100%); border-right: 1px solid #e5e9f1; }
        .login-story::after { content: ''; position: absolute; width: 420px; height: 420px; left: -180px; bottom: -220px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 9%, transparent); filter: blur(12px); }
        .login-brand, .mobile-brand { display: inline-flex; align-items: center; gap: 10px; color: #0f172a; text-decoration: none; font-size: 19px; font-weight: 750; letter-spacing: -.025em; width: fit-content; }
        .login-brand > span, .mobile-brand > span { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: var(--accent); color: #fff; box-shadow: 0 7px 18px color-mix(in srgb, var(--accent) 28%, transparent); }
        .story-copy { margin-top: 68px; position: relative; z-index: 1; }
        .story-copy h1 { margin: 0; max-width: 520px; color: #0b1730; font-size: clamp(36px, 3.2vw, 54px); line-height: 1.1; letter-spacing: -.042em; font-weight: 800; }
        .story-copy p { margin: 20px 0 0; max-width: 520px; color: #53627a; font-size: 16px; line-height: 1.7; }
        .login-preview { position: relative; z-index: 1; margin-top: auto; height: 255px; border: 1px solid #dce3ee; border-radius: 20px 20px 0 0; background: #fff; overflow: hidden; box-shadow: 0 24px 55px rgba(38,51,77,.13); transform: translateY(35px); }
        .preview-topbar { height: 32px; border-bottom: 1px solid #e7eaf0; background: #fbfcfe; display: flex; align-items: center; gap: 8px; padding: 0 14px; }
        .preview-dot { width: 9px; height: 9px; border-radius: 3px; background: var(--accent); }
        .preview-tab { width: 78px; height: 9px; border-radius: 4px; background: #e4e9f2; }.preview-tab.short { width: 45px; }
        .preview-body { height: 210px; display: grid; grid-template-columns: 68px 72px 1fr 112px; }
        .preview-rail { border-right: 1px solid #e7eaf0; background: #f8f9fc; padding: 15px 10px; display: flex; flex-direction: column; gap: 11px; }
        .preview-rail-line { height: 7px; border-radius: 4px; background: #dfe5ee; }.preview-rail-line.active { background: color-mix(in srgb, var(--accent) 45%, white); }
        .preview-pages { border-right: 1px solid #e7eaf0; padding: 13px 10px; display: flex; flex-direction: column; gap: 8px; background: #fbfcfe; }
        .preview-pages span { display: block; height: 49px; border: 1px solid #dce2ec; border-radius: 3px; background: linear-gradient(#edf1f7 8px, transparent 8px); }.preview-pages span:first-child { border-color: var(--accent); }
        .preview-paper { margin: 13px; border: 1px solid #e1e5ec; padding: 22px 24px; position: relative; box-shadow: 0 4px 14px rgba(15,23,42,.05); }
        .preview-paper-title { width: 45%; height: 12px; background: #cbd4e2; border-radius: 3px; margin: 0 auto 21px; }
        .preview-paper-line { width: 82%; height: 6px; background: #e2e7ef; border-radius: 3px; margin: 8px 0; }.preview-paper-line.wide { width: 100%; }.preview-paper-line.mid { width: 65%; }
        .preview-highlight { height: 25px; margin: 15px -5px 10px; background: color-mix(in srgb, var(--accent) 12%, white); border-left: 3px solid var(--accent); }
        .preview-note { position: absolute; right: 14px; bottom: 12px; padding: 5px 8px; border-radius: 5px; background: var(--accent); color: #fff; font-size: 7px; }
        .preview-panel { border-left: 1px solid #e7eaf0; padding: 12px 9px; }.preview-panel-tabs { display: flex; gap: 8px; border-bottom: 1px solid #e7eaf0; padding-bottom: 8px; }.preview-panel-tabs span { width: 24px; height: 5px; border-radius: 3px; background: #dce2ec; }.preview-panel-tabs .on { background: var(--accent); }.preview-message { margin-top: 13px; height: 48px; border-radius: 8px; background: #f0f3f8; }.preview-message.small { height: 32px; margin-left: 18px; background: color-mix(in srgb, var(--accent) 15%, white); }
        .preview-tools { position: absolute; left: 50%; bottom: 13px; transform: translateX(-50%); display: flex; gap: 13px; padding: 7px 12px; border: 1px solid #dce2ec; border-radius: 999px; background: #fff; color: #64748b; box-shadow: 0 5px 16px rgba(15,23,42,.12); }
        .story-features { position: relative; z-index: 2; display: flex; gap: 18px; color: #65738a; font-size: 11px; }.story-features span { display: flex; align-items: center; gap: 5px; }
        .login-form-side { min-height: 100dvh; display: grid; place-items: center; padding: 48px clamp(32px, 7vw, 110px); }
        .login-card { width: 100%; max-width: 420px; }.mobile-brand { display: none; }
        .login-card h2 { margin: 0; font-size: 31px; color: #0b1730; letter-spacing: -.035em; }.login-subtitle { margin: 8px 0 38px; color: #526179; font-size: 14px; }
        .login-card form > label { display: block; margin: 0 0 8px; color: #17233a; font-size: 12.5px; font-weight: 650; }
        .login-card input[type='email'], .login-card input[type='password'], .login-card input[type='text'] { width: 100%; height: 47px; box-sizing: border-box; padding: 0 15px; margin-bottom: 20px; border: 1px solid #cad3e1; border-radius: 10px; background: #fff; color: #111827; font: inherit; font-size: 13px; outline: 0; box-shadow: 0 2px 4px rgba(15,23,42,.06); transition: border-color .15s, box-shadow .15s; }
        .login-card input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }.login-card input.invalid { border-color: #ef4444; margin-bottom: 5px; }
        .password-wrap { position: relative; }.password-wrap input { padding-right: 48px !important; }.show-password { position: absolute; right: 13px; top: 12px; width: 26px; height: 26px; border: 0; display: grid; place-items: center; color: #8290a6; background: transparent; cursor: pointer; }
        .field-error { display: block; margin: 0 0 16px; color: #dc2626; font-size: 11.5px; }
        .form-options { margin: -2px 0 21px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }.form-options a, .create-account a { color: var(--accent); text-decoration: none; font-weight: 600; }
        .remember { display: flex !important; align-items: center; gap: 8px; margin: 0 !important; cursor: pointer; color: #334155 !important; font-weight: 500 !important; }.remember input { position: absolute; opacity: 0; pointer-events: none; }.remember span { width: 15px; height: 15px; border: 1px solid #c8d1df; border-radius: 4px; display: grid; place-items: center; }.remember input:checked + span { background: var(--accent); border-color: var(--accent); }.remember input:checked + span::after { content: '✓'; color: #fff; font-size: 10px; font-weight: 800; }
        .login-submit, .google-button, .danger-button, .cancel-button { width: 100%; height: 48px; border-radius: 10px; border: 0; font: inherit; font-size: 13px; font-weight: 650; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }.login-submit { background: var(--accent); color: #fff; box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 23%, transparent); }.login-submit:hover { background: var(--accent-hover); }.login-submit:disabled, .google-button:disabled { cursor: not-allowed; opacity: .65; }
        .login-divider { margin: 30px 0 20px; display: flex; align-items: center; gap: 14px; color: #78869b; font-size: 11.5px; white-space: nowrap; }.login-divider span { height: 1px; flex: 1; background: #dde3ec; }
        .google-button { border: 1px solid #cfd7e3; background: #fff; color: #26344b; box-shadow: 0 2px 4px rgba(15,23,42,.05); }.google-button:hover { background: #f8fafc; }
        .create-account { margin: 31px 0 0; text-align: center; color: #66758b; font-size: 12px; }
        .notice { margin: -18px 0 20px; padding: 10px 12px; border-radius: 8px; display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.45; }.notice.error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }.notice.warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
        .conflict-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgba(15,23,42,.58); backdrop-filter: blur(5px); }.conflict-dialog { width: min(390px, 100%); box-sizing: border-box; padding: 28px; border-radius: 14px; background: #fff; color: #172033; text-align: center; box-shadow: 0 24px 65px rgba(0,0,0,.24); }.conflict-icon { width: 44px; height: 44px; margin: 0 auto 14px; display: grid; place-items: center; border-radius: 50%; background: #fee2e2; color: #dc2626; font-weight: 800; }.conflict-dialog h3 { margin: 0 0 8px; font-size: 17px; }.conflict-dialog p { margin: 0 0 22px; color: #64748b; font-size: 13px; line-height: 1.55; }.danger-button { background: #ef4444; color: #fff; margin-bottom: 9px; }.cancel-button { background: #f1f5f9; color: #475569; }
        .spin { animation: login-spin .8s linear infinite; } @keyframes login-spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) { .login-shell { grid-template-columns: 1fr; }.login-story { display: none; }.login-form-side { padding: 36px 24px; }.mobile-brand { display: inline-flex; margin-bottom: 58px; }.login-card { max-width: 440px; }.login-card h2 { font-size: 28px; } }
        @media (max-width: 480px) { .login-form-side { place-items: start center; padding-top: 24px; }.mobile-brand { margin-bottom: 44px; }.login-subtitle { margin-bottom: 30px; }.form-options { font-size: 11.5px; } }
        @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 1.8s; } }
      `}</style>
    </main>
  );
}
