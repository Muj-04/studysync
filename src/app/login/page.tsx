'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, BookOpen, Eye, EyeOff, FileText, Layers, Loader2, Search, Sparkles, Users } from 'lucide-react';
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

function LoginWorkspacePreview() {
  return (
    <div className="workspace-preview" aria-label="StudySync workspace preview">
      <div className="workspace-preview-body">
        <aside>
          <b><BookOpen size={11} /> StudySync</b>
          <span className="active"><BookOpen size={11} /> Home</span>
          <span><FileText size={11} /> Notes</span>
          <span><Layers size={11} /> Flashcards</span>
          <span><Users size={11} /> Study Groups</span>
          <span><Sparkles size={11} /> AI Assistant</span>
        </aside>
        <section>
          <div className="workspace-search"><Search size={14} /></div>
          <div className="workspace-welcome"><div><small>Welcome back, Alex 👋</small><strong>Let&apos;s continue your learning journey</strong></div><em>🔥&nbsp; 12 day streak</em></div>
          <div className="workspace-actions">
            <span><FileText size={11} /> New Note</span><span><Layers size={11} /> New Flashcard</span><span><Users size={11} /> Study Group</span><span><FileText size={11} /> Upload PDF</span>
          </div>
          <div className="workspace-content">
            <div className="recent-study">
              <b>Recent study activity</b>
              <p><FileText size={11} /> Biochemistry — Enzymes <time>2h ago</time></p>
              <p><Layers size={11} /> Anatomy — Upper Limb <time>Yesterday</time></p>
              <p><Users size={11} /> Physics — Thermodynamics <time>2 days ago</time></p>
              <small className="workspace-link">View all notes →</small>
            </div>
            <div className="workspace-ai"><Sparkles size={14} /><b>AI study assistant</b><span>Summary ready</span><small>Turn this PDF into flashcards</small><small className="workspace-link">Try now →</small></div>
          </div>
        </section>
      </div>
    </div>
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
          <h1>Your notes,<br />flashcards,<br />and study groups<br /><span>in one place.</span></h1>
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
          <div className="login-product-preview"><LoginWorkspacePreview /></div>
        </div>
        <div className="story-features">
          <span><FileText size={15} /><b>All in one</b><small>Notes, flashcards, files, and more.</small></span>
          <span><Users size={15} /><b>Study together</b><small>Create groups and collaborate easily.</small></span>
          <span><Sparkles size={15} /><b>Smarter studying</b><small>Tools that help you learn faster.</small></span>
          <span><Layers size={15} /><b>Anywhere</b><small>Sync across all your devices.</small></span>
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
        .login-shell { min-height: 100dvh; display: grid; grid-template-columns: minmax(560px, 57.5%) minmax(500px, 42.5%); background: #fff; color: #171a28; font-family: var(--font-body); }
        .login-story { position: relative; min-height: 100dvh; box-sizing: border-box; padding: 48px clamp(50px, 5vw, 82px) 52px; overflow: hidden; display: flex; flex-direction: column; background: radial-gradient(circle at 13% 20%, rgba(139,85,239,.12), transparent 29%), radial-gradient(circle at 75% 68%, rgba(111,78,214,.1), transparent 34%), linear-gradient(145deg, #fcfbff 0%, #f4f1ff 59%, #faf9fd 100%); border-right: 1px solid rgba(82,60,122,.09); }
        .login-story::before { content: ''; position: absolute; top: 0; left: 43%; width: 400px; height: 250px; opacity: .12; background-image: radial-gradient(circle, #986cf0 1.3px, transparent 1.4px); background-size: 17px 17px; mask-image: radial-gradient(ellipse at center, #000, transparent 72%); }
        .login-story::after { content: ''; position: absolute; width: 500px; height: 500px; left: -220px; bottom: -270px; border-radius: 50%; background: rgba(117,64,223,.09); filter: blur(26px); }
        .login-brand, .mobile-brand { display: inline-flex; align-items: center; gap: 10px; color: #171a28; text-decoration: none; font-size: 18px; font-weight: 800; letter-spacing: -.025em; width: fit-content; }
        .login-brand > span, .mobile-brand > span { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: linear-gradient(135deg, #8954ef, #6432d3); color: #fff; box-shadow: 0 8px 20px rgba(107,57,213,.26); }
        .story-copy { margin-top: clamp(48px, 4.3vh, 63px); position: relative; z-index: 3; }
        .story-copy h1 { margin: 0; max-width: 640px; color: #171a28; font-size: clamp(44px, 3.8vw, 64px); line-height: 1.08; letter-spacing: -.048em; font-weight: 820; }
        .story-copy h1 span { display: inline-block; color: transparent; background: linear-gradient(105deg, #925cf2 4%, #6331d0 82%); background-clip: text; -webkit-background-clip: text; font-weight: 850; }
        .story-copy p { margin: 16px 0 0; max-width: 500px; color: #666b7b; font-size: 15px; line-height: 1.7; }
        .login-visual { position: relative; left: -24px; width: min(calc(100% + 60px), 980px); height: 784px; margin: -14px auto 0; }
        .login-students { position: absolute; z-index: 1; top: -42px; left: 50%; width: min(84%, 700px); transform: translateX(-50%); opacity: 1; pointer-events: none; mix-blend-mode: darken; -webkit-mask-image: radial-gradient(ellipse 78% 82% at 50% 54%, #000 68%, transparent 100%); mask-image: radial-gradient(ellipse 78% 82% at 50% 54%, #000 68%, transparent 100%); }
        .login-students img { display: block; width: 100%; height: auto; filter: saturate(.94) drop-shadow(0 15px 24px rgba(73,48,120,.07)); }
        .login-product-preview { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; }
        .workspace-preview { overflow: hidden; height: 470px; border: 1px solid rgba(98,74,139,.12); border-radius: 16px; background: rgba(255,255,255,.98); box-shadow: 0 28px 68px rgba(74,50,118,.14), 0 3px 10px rgba(74,50,118,.04); color: #30323f; }
        .workspace-preview-body { height: 100%; display: grid; grid-template-columns: 190px 1fr; }.workspace-preview-body aside { padding: 35px 24px; display: flex; flex-direction: column; gap: 9px; border-right: 1px solid #eeeaf4; background: #fbfafe; font-size: 12px; }.workspace-preview-body aside b, .workspace-preview-body aside span { display: flex; align-items: center; gap: 9px; padding: 10px 11px; border-radius: 8px; }.workspace-preview-body aside b { margin-bottom: 8px; color: #2f3040; }.workspace-preview-body aside b svg { color: #7040d5; }.workspace-preview-body aside span { color: #777281; }.workspace-preview-body aside .active { color: #6f3bd8; background: #eee7fc; font-weight: 700; }
        .workspace-preview-body section { position: relative; padding: 46px 24px 28px; }.workspace-search { position: absolute; top: 18px; right: 24px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; color: #aaa4b2; background: #fff; box-shadow: 0 2px 10px rgba(68,49,101,.08); }
        .workspace-welcome { display: flex; justify-content: space-between; align-items: center; }.workspace-welcome div { display: flex; flex-direction: column; gap: 5px; }.workspace-welcome small { color: #30313d; font-weight: 760; font-size: 15px; }.workspace-welcome strong { color: #8f8998; font-size: 11px; font-weight: 500; }.workspace-welcome em { padding: 8px 11px; border-radius: 8px; background: #f5f0ff; color: #554f60; font-size: 9.5px; font-style: normal; font-weight: 700; }
        .workspace-actions { display: grid; grid-template-columns: repeat(4,1fr); gap: 9px; margin: 29px 0 26px; }.workspace-actions span { min-width: 0; padding: 18px 8px; display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid #e7e1ef; border-radius: 8px; color: #4f4a59; font-size: 10.5px; font-weight: 650; white-space: nowrap; }.workspace-actions svg { color: #7641de; }
        .workspace-content { display: grid; grid-template-columns: minmax(0,1.8fr) minmax(200px,1fr); gap: 14px; }.recent-study, .workspace-ai { min-width: 0; min-height: 238px; padding: 18px; border: 1px solid #eeeaf4; border-radius: 10px; background: #fff; }.recent-study { display: flex; flex-direction: column; }.recent-study > b { display: block; margin-bottom: 8px; font-size: 12px; }.recent-study p { flex: 1; margin: 0; padding: 9px 0; display: flex; align-items: center; gap: 8px; border-top: 1px solid #f1edf5; color: #5c5865; font-size: 10.5px; }.recent-study p svg { color: #7540df; }.recent-study time { margin-left: auto; color: #9d97a4; }.workspace-ai { display: flex; flex-direction: column; justify-content: center; gap: 10px; color: #716a7d; background: linear-gradient(145deg,#faf8ff,#f1ebff); font-size: 10.5px; }.workspace-ai > svg { color: #7540df; }.workspace-ai b { color: #4d4658; font-size: 12.5px; }.workspace-ai span { width: fit-content; padding: 6px 8px; border-radius: 5px; background: #fff; color: #7540df; font-weight: 700; }.workspace-link { width: fit-content; color: #7540df !important; font-size: 10.5px !important; font-weight: 750; }
        .story-features { position: relative; z-index: 3; display: grid; grid-template-columns: repeat(4, minmax(0, 140px)); justify-content: space-between; gap: 0; margin-top: clamp(22px, 4.3vh, 67px); color: #5f586d; }.story-features span { position: relative; display: grid; grid-template-columns: 22px 1fr; align-items: center; column-gap: 8px; }.story-features svg { grid-row: 1 / span 2; align-self: start; color: #7541db; }.story-features b { font-size: 13px; }.story-features small { grid-column: 2; margin-top: 8px; color: #777181; font-size: 11px; line-height: 1.65; }
        .login-form-side { position: relative; min-height: 100dvh; display: grid; place-items: start center; padding: 0 clamp(44px, 5vw, 86px) 48px; overflow: hidden; background: radial-gradient(circle at 53% 43%, rgba(129,76,228,.05), transparent 33%), #fff; }
        .login-form-side::before { content: ''; position: absolute; width: 320px; height: 320px; top: 50%; left: 50%; border-radius: 50%; background: rgba(126,74,226,.025); filter: blur(55px); transform: translate(-50%,-50%); pointer-events: none; }
        .login-card { position: relative; left: -15px; width: 100%; max-width: 530px; box-sizing: border-box; margin-top: clamp(222px, calc(23vh - 2px), 348px); }.mobile-brand { display: none; }
        .login-card h2 { margin: 0; text-align: center; font-size: 36px; line-height: 1.15; color: #171a28; letter-spacing: -.042em; font-weight: 750; }.login-subtitle { margin: 10px 0 70px; text-align: center; color: #777b89; font-size: 16px; }
        .login-card form > label { display: block; margin: 0 0 14px; color: #343745; font-size: 14.5px; font-weight: 700; }
        .login-card input[type='email'], .login-card input[type='password'], .login-card input[type='text'] { width: 100%; height: 62px; box-sizing: border-box; padding: 0 18px; margin-bottom: 40px; border: 1px solid #d9d5df; border-radius: 10px; background: #fff; color: #262834; font: inherit; font-size: 15.5px; outline: 0; box-shadow: 0 2px 5px rgba(56,39,87,.04); transition: border-color .15s, box-shadow .15s; }
        .login-card input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }.login-card input.invalid { border-color: #ef4444; margin-bottom: 5px; }
        .password-wrap { position: relative; }.password-wrap input { padding-right: 52px !important; }.show-password { position: absolute; right: 15px; top: 18px; width: 26px; height: 26px; border: 0; border-radius: 6px; display: grid; place-items: center; color: #aaa4b2; background: transparent; cursor: pointer; }.show-password:hover { color: #7040d5; background: #f4effd; }
        .field-error { display: block; margin: 0 0 16px; color: #dc2626; font-size: 11.5px; }
        .form-options { margin: -3px 0 46px; display: flex; justify-content: space-between; align-items: center; font-size: 14.5px; }.form-options a, .create-account a { color: var(--accent); text-decoration: none; font-weight: 650; }
        .remember { display: flex !important; align-items: center; gap: 8px; margin: 0 !important; cursor: pointer; color: #535764 !important; font-weight: 500 !important; }.remember input { position: absolute; opacity: 0; pointer-events: none; }.remember span { width: 15px; height: 15px; border: 1px solid #cfc8d9; border-radius: 4px; display: grid; place-items: center; }.remember input:checked + span { background: #7540df; border-color: #7540df; }.remember input:checked + span::after { content: '✓'; color: #fff; font-size: 10px; font-weight: 800; }
        .login-submit, .google-button, .danger-button, .cancel-button { width: 100%; height: 66px; border-radius: 10px; border: 0; font: inherit; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s, background .15s; }.login-submit { background: linear-gradient(110deg, #7540df, #8a4cef); color: #fff; box-shadow: 0 12px 28px rgba(108,57,209,.24); }.login-submit:hover { background: linear-gradient(110deg, #6934d4, #7d40e4); box-shadow: 0 15px 32px rgba(108,57,209,.29); transform: translateY(-1px); }.login-submit:disabled, .google-button:disabled { cursor: not-allowed; opacity: .65; }
        .login-divider { margin: 44px 0 36px; display: flex; align-items: center; gap: 20px; color: #6f7180; font-size: 14.5px; white-space: nowrap; }.login-divider span { height: 1px; flex: 1; background: #dedbe4; }
        .google-button { height: 62px; border: 1px solid #ddd9e4; background: #fff; color: #343745; box-shadow: 0 2px 5px rgba(56,39,87,.05); }.google-button:hover { border-color: #b9a9dc; background: #fff; transform: translateY(-1px); }.danger-button, .cancel-button { height: 48px; }
        .create-account { margin: 56px 0 0; text-align: center; color: #686b78; font-size: 16px; }
        .notice { margin: -18px 0 20px; padding: 10px 12px; border-radius: 8px; display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.45; }.notice.error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }.notice.warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
        .conflict-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgba(15,23,42,.58); backdrop-filter: blur(5px); }.conflict-dialog { width: min(390px, 100%); box-sizing: border-box; padding: 28px; border-radius: 14px; background: #fff; color: #172033; text-align: center; box-shadow: 0 24px 65px rgba(0,0,0,.24); }.conflict-icon { width: 44px; height: 44px; margin: 0 auto 14px; display: grid; place-items: center; border-radius: 50%; background: #fee2e2; color: #dc2626; font-weight: 800; }.conflict-dialog h3 { margin: 0 0 8px; font-size: 17px; }.conflict-dialog p { margin: 0 0 22px; color: #64748b; font-size: 13px; line-height: 1.55; }.danger-button { background: #ef4444; color: #fff; margin-bottom: 9px; }.cancel-button { background: #f1f5f9; color: #475569; }
        .spin { animation: login-spin .8s linear infinite; } @keyframes login-spin { to { transform: rotate(360deg); } }
        @media (max-width: 1200px) and (min-width: 901px) { .login-shell { grid-template-columns: minmax(510px, 55%) minmax(420px,45%); }.login-story { padding-left: 36px; padding-right: 36px; }.story-copy h1 { font-size: 45px; }.login-visual { height: 475px; margin-top: -8px; }.login-students { top: 0; width: 72%; }.workspace-preview { height: 350px; }.workspace-preview-body { height: 100%; grid-template-columns: 120px 1fr; }.workspace-preview-body aside { padding: 18px 9px; gap: 5px; font-size: 8px; }.workspace-preview-body aside b, .workspace-preview-body aside span { padding: 6px; }.workspace-preview-body section { padding: 34px 17px 16px; }.workspace-search { top: 9px; right: 12px; width: 24px; height: 24px; }.workspace-welcome small { font-size: 10px; }.workspace-actions { margin: 15px 0; }.workspace-actions span { padding: 9px 5px; font-size: 7px; }.workspace-content { grid-template-columns: minmax(0,1.5fr) minmax(125px,.7fr); }.recent-study, .workspace-ai { min-height: 150px; padding: 11px; }.recent-study p { padding: 7px 0; }.story-features { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }.story-features small { display: none; }.login-card { margin-top: 180px; } }
        @media (max-width: 900px) { .login-shell { grid-template-columns: 1fr; }.login-story { display: none; }.login-form-side { padding: 36px 24px; background: radial-gradient(circle at 50% 25%, rgba(129,76,228,.1), transparent 36%), #faf8ff; }.mobile-brand { display: inline-flex; margin-bottom: 48px; }.login-card { left: 0; max-width: 460px; margin-top: 0; padding: 34px; border: 1px solid rgba(94,72,132,.1); border-radius: 20px; background: rgba(255,255,255,.96); box-shadow: 0 25px 60px rgba(56,39,87,.1); }.login-card h2 { font-size: 32px; }.login-subtitle { margin-bottom: 36px; }.login-card form > label { margin-bottom: 8px; }.login-card input[type='email'], .login-card input[type='password'], .login-card input[type='text'] { height: 54px; margin-bottom: 21px; }.show-password { top: 14px; }.form-options { margin-bottom: 21px; }.login-submit, .google-button { height: 54px; }.login-divider { margin: 30px 0 20px; }.create-account { margin-top: 28px; } }
        @media (max-width: 480px) { .login-form-side { place-items: start center; padding: 18px 12px 32px; }.login-card { padding: 28px 20px; border-radius: 18px; }.mobile-brand { margin-bottom: 38px; }.login-subtitle { margin-bottom: 30px; }.form-options { font-size: 11.5px; } }
        @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 1.8s; } }
      `}</style>
    </main>
  );
}
