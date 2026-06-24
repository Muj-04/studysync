'use client';
import { useState, useEffect, useCallback } from 'react';
import { Upload, Pencil, Mic, Sparkles, Users, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const TOUR_KEY = 'studysync_onboarding_v1';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint?: string;
}

interface Props {
  onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const STEPS: Step[] = [
    {
      icon: <Upload size={28} />,
      title: t('tour_step1_title'),
      description: t('tour_step1_desc'),
      hint: t('tour_step1_hint'),
    },
    {
      icon: <Pencil size={28} />,
      title: t('tour_step2_title'),
      description: t('tour_step2_desc'),
      hint: t('tour_step2_hint'),
    },
    {
      icon: <Mic size={28} />,
      title: t('tour_step3_title'),
      description: t('tour_step3_desc'),
      hint: t('tour_step3_hint'),
    },
    {
      icon: <Sparkles size={28} />,
      title: t('tour_step4_title'),
      description: t('tour_step4_desc'),
      hint: t('tour_step4_hint'),
    },
    {
      icon: <Users size={28} />,
      title: t('tour_step5_title'),
      description: t('tour_step5_desc'),
      hint: t('tour_step5_hint'),
    },
  ];

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      try { localStorage.setItem(TOUR_KEY, '1'); } catch {}
      onComplete();
    }, 220);
  }, [onComplete]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  // Allow Escape to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 16px 48px',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.22s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        key={step}
        style={{
          width: '100%', maxWidth: 480,
          background: 'rgba(10,15,25,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          padding: '28px 28px 24px',
          animation: 'pop-in 0.22s cubic-bezier(0.16,1,0.3,1) both',
          position: 'relative',
        }}
      >
        {/* Skip button */}
        <button
          onClick={dismiss}
          title={t('tour_skip')}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={13} />
        </button>

        {/* Step icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: 'var(--accent-muted)',
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          {current.icon}
        </div>

        {/* Title */}
        <h3 style={{
          margin: '0 0 8px',
          fontSize: 17, fontWeight: 600, color: 'var(--text-1)',
          letterSpacing: '-0.01em',
        }}>
          {current.title}
        </h3>

        {/* Description */}
        <p style={{
          margin: '0 0 12px',
          fontSize: 13.5, lineHeight: 1.65,
          color: 'var(--text-2)',
        }}>
          {current.description}
        </p>

        {/* Hint pill */}
        {current.hint && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20,
            fontSize: 11.5, color: 'var(--text-3)',
            marginBottom: 20,
          }}>
            {current.hint}
          </div>
        )}

        {/* Step dots */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 20,
          marginTop: current.hint ? 0 : 8,
        }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 18 : 6,
                height: 6, borderRadius: 3,
                background: i === step ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {step > 0 && (
            <button
              onClick={prev}
              style={{
                height: 36, padding: '0 14px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, color: 'var(--text-2)',
                cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <ChevronLeft size={14} />
              {t('common_back')}
            </button>
          )}
          <button
            onClick={next}
            style={{
              height: 36, padding: '0 18px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6, color: '#fff',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
              marginLeft: 'auto',
            }}
          >
            {isLast ? t('tour_finish') : t('tour_next')}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// Exported for use in workspace to check first-visit
export function shouldShowTour(): boolean {
  try { return !localStorage.getItem(TOUR_KEY); } catch { return false; }
}
