'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  CircleHelp,
  Cloud,
  FileText,
  Layers3,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  Sparkles,
  StickyNote,
} from 'lucide-react';
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

function RecoveryVisual() {
  return (
    <div className={styles.recoveryVisual} role="img" aria-label="StudySync password recovery illustration">
      <div className={styles.recoveryGlow} aria-hidden="true" />
      <Image
        src="/landing/studysync-students.png"
        alt="Students studying with a laptop and study notes"
        fill
        priority
        sizes="(max-width: 920px) 0px, 48vw"
        className={styles.recoveryIllustration}
      />

      <div className={styles.recoveryMailCard} aria-hidden="true">
        <div className={styles.recoveryCardHeader}>
          <span className={styles.recoveryCardIcon}><Mail size={14} /></span>
          <strong>Recovery email</strong>
          <span className={styles.recoveryCardStatus}>Ready</span>
        </div>
        <strong className={styles.recoveryCardTitle}>Reset link prepared</strong>
        <span className={styles.recoveryCardLine} />
        <span className={`${styles.recoveryCardLine} ${styles.recoveryCardLineShort}`} />
        <span className={styles.recoveryCardHint}>Secure access to your study space</span>
      </div>

      <span className={`${styles.studyIcon} ${styles.pdfIcon}`} aria-hidden="true"><FileText size={18} /></span>
      <span className={`${styles.studyIcon} ${styles.noteIcon}`} aria-hidden="true"><StickyNote size={17} /></span>
      <span className={`${styles.studyIcon} ${styles.flashcardIcon}`} aria-hidden="true"><Layers3 size={18} /></span>
      <span className={styles.lockBadge} aria-hidden="true"><Lock size={20} /></span>
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
          <div className={styles.storyCopy}>
            <h1>Forgot your<br />password?</h1>
            <p className={styles.storySubtitle}>No worries, your study space is still waiting.</p>
            <p className={styles.storyDescription}>
              Reset your password securely and continue accessing your PDFs, notes, flashcards, and study rooms.
            </p>
          </div>

          <RecoveryVisual />

          <div className={styles.storyBenefits} aria-label="StudySync benefits">
            <span><ShieldCheck size={17} /><span><strong>Your data is safe</strong><small>Private notes and personal data.</small></span></span>
            <span><Cloud size={17} /><span><strong>Your progress stays</strong><small>Your study progress remains intact.</small></span></span>
            <span><Sparkles size={17} /><span><strong>Recover with ease</strong><small>Get back to focused studying.</small></span></span>
          </div>
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
