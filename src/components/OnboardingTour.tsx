'use client';
import { useState, useEffect, useCallback } from 'react';
import { Upload, Pencil, Mic, Sparkles, Users, X, ChevronRight, ChevronLeft } from 'lucide-react';

const TOUR_KEY = 'studysync_onboarding_v1';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint?: string;
}

const STEPS: Step[] = [
  {
    icon: <Upload size={28} />,
    title: 'Upload your PDFs',
    description: 'Drag and drop PDF or PPTX files onto the workspace, or click the upload button in the sidebar. Open multiple documents side by side.',
    hint: 'Free plan: up to 3 documents',
  },
  {
    icon: <Pencil size={28} />,
    title: 'Annotate with drawing tools',
    description: 'Use the floating toolbar to draw, highlight, and add text notes on any page. Your annotations sync across devices.',
    hint: 'Press A to toggle the annotation toolbar',
  },
  {
    icon: <Mic size={28} />,
    title: 'Record voice notes',
    description: 'Attach voice notes to any page using the mic button in the bottom-right corner of each page. Play them back instantly.',
    hint: 'Voice notes are linked to the exact page you were on',
  },
  {
    icon: <Sparkles size={28} />,
    title: 'AI-powered summaries',
    description: 'Open the Document Tools panel (right side) to generate AI summaries, extract key terms, and get instant answers about your document.',
    hint: 'Powered by Gemini — works with any text PDF',
  },
  {
    icon: <Users size={28} />,
    title: 'Study together',
    description: 'Create a Study Room to collaborate with classmates in real time. Share documents, discuss notes, and study smarter together.',
    hint: 'Find Study Rooms in the header toolbar',
  },
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingTour({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

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
          title="Skip tour"
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
          background: 'rgba(37,99,235,0.18)',
          border: '1px solid rgba(37,99,235,0.35)',
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
              Back
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
            {isLast ? "Let's go!" : 'Next'}
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
