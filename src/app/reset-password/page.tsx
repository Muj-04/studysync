'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './reset-password.module.css';

type Status = 'loading' | 'ready' | 'invalid' | 'done';

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={compact ? styles.mobileBrand : styles.brand}
      aria-label="StudySync home"
    >
      <span className={styles.brandMark}>
        <BookOpen size={compact ? 17 : 19} strokeWidth={2.2} />
      </span>
      <span>StudySync</span>
    </Link>
  );
}

function ResetShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={styles.storyPanel} aria-label="About StudySync password security">
        <Brand />

        <div className={styles.storyContent}>
          <div className={styles.storyCopy}>
            <h1>
              Reset your <span>password</span>
            </h1>
            <p>Choose a strong, new password to keep your account secure.</p>
          </div>

          <div className={styles.deviceVisual} aria-hidden="true">
            <Image
              src="/register/studysync-devices.png"
              alt=""
              fill
              priority
              sizes="(max-width: 920px) 0px, 50vw"
              className={styles.deviceImage}
            />
          </div>

          <div className={styles.securityCard}>
            <strong>🔒 Your account security matters</strong>
            <span>Your data is protected with secure authentication.</span>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <Brand compact />
          {children}
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
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
      // Supabase parses the recovery parameters and creates the recovery session.
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

  if (status === 'loading') {
    return (
      <ResetShell>
        <div className={styles.stateContent} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <h2>Verifying your reset link</h2>
          <p>Please wait while we securely prepare your password reset.</p>
        </div>
      </ResetShell>
    );
  }

  if (status === 'invalid') {
    return (
      <ResetShell>
        <div className={styles.stateContent}>
          <span className={styles.stateEyebrow}>RESET LINK</span>
          <h2>Link expired</h2>
          <p>This reset link is invalid or has expired. Please request a new one.</p>
          <Link href="/forgot-password" className={styles.primaryLink}>Request New Link</Link>
          <Link href="/login" className={styles.secondaryLink}>Back to Login</Link>
        </div>
      </ResetShell>
    );
  }

  if (status === 'done') {
    return (
      <ResetShell>
        <div className={styles.stateContent}>
          <span className={styles.stateEyebrow}>PASSWORD UPDATED</span>
          <h2>Your password is ready</h2>
          <p>Your password has been changed. You can now log in with your new password.</p>
          <Link href="/login" className={styles.primaryLink}>Go to Login</Link>
        </div>
      </ResetShell>
    );
  }

  return (
    <ResetShell>
      <div className={styles.formHeading}>
        <span className={styles.formEyebrow}>SECURE PASSWORD RESET</span>
        <h2>Create your new password</h2>
        <p>Make sure it&apos;s something you&apos;ll remember, but hard for others to guess.</p>
      </div>

      {error && <div className={styles.errorMessage} role="alert">{error}</div>}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        noValidate
      >
        <label htmlFor="new-password">New password</label>
        <div className={styles.passwordField}>
          <input
            id="new-password"
            type={showPass ? 'text' : 'password'}
            placeholder="Enter new password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />
          <button
            type="button"
            onClick={() => setShowPass((value) => !value)}
            aria-label={showPass ? 'Hide passwords' : 'Show passwords'}
          >
            {showPass ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>

        <label htmlFor="confirm-password">Confirm new password</label>
        <div className={styles.passwordField}>
          <input
            id="confirm-password"
            type={showPass ? 'text' : 'password'}
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={!!confirm && confirm !== password}
            disabled={submitting}
          />
          <button
            type="button"
            onClick={() => setShowPass((value) => !value)}
            aria-label={showPass ? 'Hide passwords' : 'Show passwords'}
          >
            {showPass ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>

        <button className={styles.submitButton} type="submit" disabled={submitting}>
          {submitting ? 'Updating…' : 'Update Password'}
        </button>
      </form>

      <div className={styles.loginFooter}>
        <span>Remember your password?</span>
        <Link href="/login">Back to Login</Link>
      </div>
    </ResetShell>
  );
}
