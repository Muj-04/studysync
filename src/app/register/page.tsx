'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AtSign,
  BookOpen,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  PROFILE_HANDLE_MAX_LENGTH,
  normalizeProfileHandle,
  validateProfileHandle,
} from '@/lib/profileHandle';
import styles from './RegisterPage.module.css';

const OAUTH_REDIRECT = 'https://pdf-study-workspace.vercel.app/auth/callback';

function OAuthButtons() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | null>(null);

  const signIn = async (provider: 'google') => {
    setLoadingProvider(provider);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: OAUTH_REDIRECT },
    });
  };

  return (
    <div className={styles.oauthArea}>
      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => signIn('google')}
        className={styles.googleButton}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M47.532 24.552c0-1.636-.132-3.2-.378-4.704H24.48v8.898h12.984c-.558 3.018-2.256 5.574-4.806 7.29l7.776 6.048c4.536-4.188 7.098-10.356 7.098-17.532z"/>
          <path fill="#34A853" d="M24.48 48c6.498 0 11.952-2.154 15.936-5.838l-7.776-6.048c-2.16 1.446-4.926 2.298-8.16 2.298-6.282 0-11.604-4.242-13.512-9.954H2.934l-1.26 5.814v.006C5.598 42.9 14.418 48 24.48 48z"/>
          <path fill="#FBBC05" d="M10.968 28.458a14.46 14.46 0 0 1-.756-4.458c0-1.548.27-3.048.756-4.458v-5.82H2.934A23.94 23.94 0 0 0 .48 24c0 3.87.924 7.53 2.454 10.278l8.034-5.82z"/>
          <path fill="#EA4335" d="M24.48 9.588c3.54 0 6.714 1.218 9.216 3.606l6.912-6.912C36.426 2.394 30.978 0 24.48 0 14.418 0 5.598 5.1 1.674 13.722l8.034 5.82c1.908-5.712 7.23-9.954 13.512-9.954l.26.001z"/>
        </svg>
        {loadingProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <div className={styles.divider}>
        <span />
        or sign up with email
        <span />
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Persist referral code from URL so it survives email confirmation + OAuth redirects
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) localStorage.setItem('studysync_pending_ref', ref.trim().toUpperCase());

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace('/dashboard');
    });
  }, []);

  useEffect(() => {
    const normalized = normalizeProfileHandle(handle);
    if (!normalized || validateProfileHandle(normalized)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data, error: availabilityError } = await createClient()
        .rpc('is_handle_available', { p_handle: normalized });
      if (cancelled) return;
      if (availabilityError) setHandleStatus('error');
      else setHandleStatus(data === true ? 'available' : 'taken');
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle]);

  const DISPOSABLE_DOMAINS = new Set([
    'tempmail.com','guerrillamail.com','guerrillamail.net','guerrillamail.org','guerrillamail.biz','guerrillamail.de',
    '10minutemail.com','10minutemail.net','10minutemail.org','mailinator.com','yopmail.com','yopmail.fr',
    'sharklasers.com','guerrillamailblock.com','grr.la','guerrillamail.info','spam4.me','trashmail.com',
    'trashmail.me','trashmail.net','trashmail.at','trashmail.io','trashmail.org','mailnull.com',
    'spamgourmet.com','throwam.com','throwam.net','getnada.com','filzmail.com','dispostable.com',
    'mailnesia.com','maildrop.cc','discard.email','spamfree24.org','fakeinbox.com','tempr.email',
    'zetmail.com','crazymailing.com','meltmail.com','wegwerfmail.de','wegwerfmail.net','wegwerfmail.org',
  ]);

  const handleRegister = async () => {
    const displayName = username.trim();
    const normalizedHandle = normalizeProfileHandle(handle);
    if (!displayName || !normalizedHandle || !email || !password) { setError('Please fill in all fields.'); return; }
    if (displayName.length > 50) { setError('Display name must be 50 characters or fewer.'); return; }
    const handleError = validateProfileHandle(normalizedHandle);
    if (handleError) { setError(handleError); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    const emailDomain = email.trim().toLowerCase().split('@')[1] ?? '';
    if (DISPOSABLE_DOMAINS.has(emailDomain)) {
      setError('Disposable email addresses are not allowed. Please use a real email.');
      return;
    }
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data: handleAvailable, error: availabilityError } = await supabase
      .rpc('is_handle_available', { p_handle: normalizedHandle });
    if (availabilityError) {
      setLoading(false);
      setError('Could not verify this handle. Please try again.');
      return;
    }
    if (handleAvailable !== true) {
      setLoading(false);
      setHandleStatus('taken');
      setError('This handle is already taken.');
      return;
    }
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { username: displayName, handle: normalizedHandle } },
    });
    setLoading(false);
    if (err) {
      const { data: stillAvailable } = await supabase
        .rpc('is_handle_available', { p_handle: normalizedHandle });
      if (stillAvailable === false) {
        setHandleStatus('taken');
        setError('This handle was just taken. Please choose another.');
      } else {
        setError(err.message);
      }
      return;
    }

    // Supabase Auth, with email-confirm enabled, returns error=null even
    // when the email is already in use — an intentional anti-enumeration
    // behavior. The discriminator is data.user.identities:
    //   * length === 0  → email belongs to a CONFIRMED user; the returned
    //                     user object is a placeholder, no row is created,
    //                     no email is sent. We must surface this clearly
    //                     so the visitor doesn't think they own a new
    //                     account (and isn't lured into checking an inbox
    //                     they don't control).
    //   * length  >= 1  → genuine new signup OR an existing UNCONFIRMED
    //                     user (Supabase re-sent the confirmation email).
    //                     Both cases legitimately need "check your email";
    //                     the only side effect for the unconfirmed-existing
    //                     case is a confirmation re-send, which is the
    //                     desired UX (user lost the previous email).
    const identities = data?.user?.identities;
    if (identities && identities.length === 0) {
      setError(
        'An account with this email already exists. Try logging in, or use Forgot password to reset it.',
      );
      return;
    }
    setMessage('Account created! Check your email to confirm, then log in.');
  };

  return (
    <main className={styles.page}>
      <section className={styles.storyPanel} aria-label="Why students choose StudySync">
        <Link href="/" className={styles.brand} aria-label="StudySync home">
          <span><BookOpen size={18} strokeWidth={2.4} /></span>
          StudySync
        </Link>

        <div className={styles.storyCopy}>
          <div className={styles.eyebrow}><Sparkles size={14} /> Built for focused students</div>
          <h1>
            Create your
            <span className={styles.headlineSecond}><em>StudySync</em> account</span>
          </h1>
          <p>Join students who keep their documents, notes, flashcards, and study groups together in one focused workspace.</p>
        </div>

        <div className={styles.illustrationWrap}>
          <div className={styles.illustrationGlow} />
          <Image
            src="/register/studysync-devices.png"
            alt="StudySync dashboard displayed on a laptop beside a mobile flashcard"
            width={1536}
            height={1024}
            sizes="(max-width: 900px) 86vw, 48vw"
            className={styles.illustration}
            priority
          />
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.formGlow} />
        <div className={styles.card}>
          <Link href="/" className={styles.mobileBrand} aria-label="StudySync home">
            <span><BookOpen size={17} /></span>StudySync
          </Link>
          <h2>Create your account</h2>
          <p className={styles.subtitle}>Let&apos;s get your study space ready.</p>

          {error && <div className={styles.errorNotice} role="alert">{error}</div>}
          {message && <div className={styles.successNotice} role="status">{message}</div>}

          <OAuthButtons />

          <div className={styles.fields}>
            <div className={styles.field}>
              <UserRound size={17} aria-hidden="true" />
              <input
                type="text"
                placeholder="Display name"
                aria-label="Display name"
                autoComplete="name"
                maxLength={50}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={styles.input}
              />
            </div>

            <div>
              <div className={styles.field}>
                <AtSign size={17} aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Handle (for example: study_sam)"
                  aria-label="Unique account handle"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={PROFILE_HANDLE_MAX_LENGTH}
                  value={handle}
                  onChange={(event) => {
                    const nextHandle = event.target.value.toLowerCase();
                    setHandle(nextHandle);
                    setHandleStatus(validateProfileHandle(nextHandle) ? 'idle' : 'checking');
                  }}
                  aria-describedby="handle-status"
                  className={styles.input}
                />
              </div>
              <p
                id="handle-status"
                aria-live="polite"
                className={
                  handleStatus === 'available'
                    ? styles.handleAvailable
                    : handleStatus === 'taken' || handleStatus === 'error'
                      ? styles.handleError
                      : styles.handleHint
                }
              >
                {handleStatus === 'checking' && 'Checking availability…'}
                {handleStatus === 'available' && 'Handle is available'}
                {handleStatus === 'taken' && 'This handle is already taken'}
                {handleStatus === 'error' && 'Could not check availability'}
                {handleStatus === 'idle' && '3–24 lowercase letters, numbers, or underscores'}
              </p>
            </div>

            <div className={styles.field}>
              <Mail size={17} aria-hidden="true" />
              <input
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Password (minimum 6 characters)"
                aria-label="Password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={styles.passwordInput}
              />
              <button
                type="button"
                onClick={() => setShowPass((visible) => !visible)}
                className={styles.passwordToggle}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRegister}
            disabled={loading || !!message}
            className={styles.submitButton}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p className={styles.loginPrompt}>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
