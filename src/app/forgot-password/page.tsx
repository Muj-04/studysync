'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CircleHelp, Mail, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './forgot-password.module.css';

const REDIRECT = 'https://pdf-study-workspace.vercel.app/reset-password';

function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="StudySync home">
      <span className={styles.brandMark}><BookOpen size={19} strokeWidth={2.1} /></span>
      <span>StudySync</span>
    </Link>
  );
}

function Testimonial() {
  return (
    <div className={styles.testimonial}>
      <Image
        src="/forgot-password-students.png"
        alt="Students studying together around a table"
        fill
        priority
        sizes="(max-width: 920px) 0px, 44vw"
        className={styles.testimonialImage}
      />
      <div className={styles.testimonialShade} />
      <div className={styles.testimonialCopy}>
        <div className={styles.stars} aria-label="Five star review">★★★★★</div>
        <blockquote>
          “StudySync completely changed how I prepare for finals. The AI flashcards<br className={styles.quoteBreak} />
          and live study rooms saved me dozens of hours this semester.”
        </blockquote>
        <div className={styles.student}>
          <span className={styles.studentAvatar} role="img" aria-label="Jessica Parker" />
          <span>
            <strong>Jessica Parker</strong>
            <small>Pre-Med Student, Stanford</small>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    setError('');
    setLoading(true);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: REDIRECT,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <main className={styles.page}>
      <section className={styles.storyPanel} aria-label="About StudySync">
        <Brand />
        <div className={styles.storyContent}>
          <div>
            <h1>Get back to your studies<br />in no time.</h1>
            <p>
              Don&apos;t worry, it happens to the best of us. Reset your<br className={styles.desktopBreak} />
              password securely and regain access to all your notes<br className={styles.desktopBreak} />
              and study rooms.
            </p>
          </div>
          <Testimonial />
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <Link href="/login" className={styles.backLink}>
            <ArrowLeft size={17} strokeWidth={1.8} />
            Back to log in
          </Link>

          <div className={styles.mailIcon} aria-hidden>
            {sent ? <MailCheck size={23} strokeWidth={1.9} /> : <Mail size={23} strokeWidth={1.9} />}
          </div>

          <h2>{sent ? 'Check your inbox' : 'Reset password'}</h2>
          <p className={styles.formIntro}>
            {sent
              ? <>We sent a password reset link to <strong>{email.trim()}</strong>. Follow the instructions in the email to continue.</>
              : <>Enter the email associated with your account and we&apos;ll send<br className={styles.desktopBreak} /> you a link to reset your password.</>}
          </p>

          {error && <div className={styles.errorMessage} role="alert">{error}</div>}

          {!sent ? (
            <form
              className={styles.form}
              onSubmit={(event) => { event.preventDefault(); void handleSend(); }}
              noValidate
            >
              <label htmlFor="reset-email">Email address</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={!!error}
                disabled={loading}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <div className={styles.sentActions}>
              <button type="button" onClick={() => { setSent(false); setError(''); }}>
                Send another link
              </button>
              <Link href="/login">Back to log in</Link>
            </div>
          )}
        </div>
      </section>

      <button type="button" className={styles.helpButton} aria-label="Help" title="Help">
        <CircleHelp size={34} strokeWidth={1.5} />
      </button>
    </main>
  );
}
