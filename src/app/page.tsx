'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, PenTool, Mic, Users, Sparkles,
  Check,
} from 'lucide-react';
import LandingHero from '@/components/LandingHero';
import { createClient } from '@/lib/supabase/client';

// ── Auth redirect ─────────────────────────────────────────────────────────────

function useAuthRedirect() {
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace('/workspace');
      else setChecking(false);
    });
  }, []);
  return checking;
}

// ── Smooth-scroll helper ──────────────────────────────────────────────────────

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <PenTool size={20} />,
    title: 'PDF Annotation',
    desc: 'Draw, highlight, and take text notes on any PDF. Pen, marker, highlighter — pixel-perfect on every page.',
    color: '#7c3aed',
    glow: 'rgba(124,58,237,0.18)',
  },
  {
    icon: <Mic size={20} />,
    title: 'Voice Notes',
    desc: 'Record audio notes tied to each page. Replay context-aware annotations exactly where you left them.',
    color: '#0ea5e9',
    glow: 'rgba(14,165,233,0.18)',
  },
  {
    icon: <Users size={20} />,
    title: 'Study Rooms',
    desc: 'Collaborate in real-time with live drawing, voice chat, and shared page navigation for your whole group.',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.18)',
  },
  {
    icon: <Sparkles size={20} />,
    title: 'AI Assistant',
    desc: 'Summarize chapters, explain concepts, generate flashcards, and quiz yourself — powered by Gemini.',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.18)',
  },
] as const;

const FREE_FEATURES    = ['Up to 3 documents', '30 MB voice storage', 'Basic drawing tools', 'AI Summary (15/month)'];
const PREMIUM_FEATURES = ['Unlimited documents', '1 GB voice storage', 'All drawing tools', 'AI (300 req/month)', 'Study Rooms (5 members)', 'Friends & invites'];
const PRO_FEATURES     = ['Everything in Premium', '5 GB voice storage', 'AI (1,000 req/month)', 'Study Rooms (20 members)', 'AI Flashcards & Quiz', 'Early access to features'];

// ── Sub-components ────────────────────────────────────────────────────────────

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(20px, 5vw, 56px)',
      background: scrolled ? 'rgba(15,17,23,0.88)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
      transition: 'background 0.3s, border-color 0.3s, backdrop-filter 0.3s',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(124,58,237,0.45)',
        }}>
          <BookOpen size={16} style={{ color: '#fff' }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
          StudySync
        </span>
      </div>

      {/* Nav links (hidden on small screens) */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-links-desktop">
        <button
          onClick={() => scrollTo('features')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0, transition: 'color 0.15s' }}
          onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
        >
          Features
        </button>
        <button
          onClick={() => scrollTo('pricing')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0, transition: 'color 0.15s' }}
          onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
        >
          Pricing
        </button>
      </nav>

      {/* Auth buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link
          href="/login"
          style={{
            height: 36, padding: '0 18px',
            display: 'inline-flex', alignItems: 'center',
            borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.8)', fontSize: 13.5, fontWeight: 500,
            textDecoration: 'none', fontFamily: 'inherit',
            background: 'rgba(255,255,255,0.06)',
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          }}
          onMouseOver={(e) => { Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.12)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }); }}
          onMouseOut={(e) => { Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.18)' }); }}
        >
          Sign In
        </Link>
        <Link
          href="/register"
          style={{
            height: 36, padding: '0 18px',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            color: '#fff', fontSize: 13.5, fontWeight: 600,
            textDecoration: 'none', fontFamily: 'inherit',
            boxShadow: '0 0 20px rgba(124,58,237,0.4)',
            transition: 'opacity 0.15s, box-shadow 0.15s',
          }}
          onMouseOver={(e) => { Object.assign(e.currentTarget.style, { opacity: '0.9', boxShadow: '0 0 28px rgba(124,58,237,0.55)' }); }}
          onMouseOut={(e) => { Object.assign(e.currentTarget.style, { opacity: '1', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }); }}
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}

function FeatureCard({ icon, title, desc, color, glow }: typeof FEATURES[number]) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: '1 1 240px', minWidth: 0,
        background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16,
        padding: '28px 24px',
        position: 'relative', overflow: 'hidden',
        transition: 'background 0.25s, border-color 0.25s, transform 0.25s, box-shadow 0.25s',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? `0 12px 40px rgba(0,0,0,0.35), 0 0 60px ${glow}` : 'none',
      }}
    >
      {/* Accent glow */}
      <div style={{
        position: 'absolute', top: -30, left: -30,
        width: 120, height: 120,
        background: glow,
        borderRadius: '50%',
        filter: 'blur(40px)',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.35s',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: 44, height: 44, borderRadius: 12, marginBottom: 20,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
        transition: 'transform 0.25s',
        transform: hovered ? 'scale(1.08)' : 'none',
        position: 'relative',
      }}>
        {icon}
      </div>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.65 }}>
        {desc}
      </p>
    </div>
  );
}

function PricingCard({
  name, price, sub, badge, features, cta, ctaHref, highlight,
}: {
  name: string; price: string; sub: string;
  badge?: string; features: string[];
  cta: string; ctaHref: string; highlight?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: '1 1 260px', minWidth: 0,
        background: highlight ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1.5px solid ${highlight ? 'rgba(124,58,237,0.5)' : hov ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 20,
        padding: '32px 28px',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        transition: 'transform 0.25s, box-shadow 0.25s, border-color 0.25s',
        transform: highlight ? (hov ? 'scale(1.03) translateY(-4px)' : 'scale(1.02)') : (hov ? 'translateY(-4px)' : 'none'),
        boxShadow: highlight
          ? (hov ? '0 0 0 1px rgba(124,58,237,0.4), 0 20px 60px rgba(124,58,237,0.25)' : '0 0 40px rgba(124,58,237,0.15)')
          : (hov ? '0 12px 40px rgba(0,0,0,0.3)' : 'none'),
      }}
    >
      {badge && (
        <div style={{
          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: '#fff', fontSize: 11, fontWeight: 700,
          padding: '4px 14px', borderRadius: 9999,
          whiteSpace: 'nowrap', letterSpacing: '0.04em',
          boxShadow: '0 4px 16px rgba(124,58,237,0.5)',
        }}>
          {badge}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>
          {name}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>{price}</span>
          {sub && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{sub}</span>}
        </div>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: 'rgba(255,255,255,0.75)' }}>
            <Check size={14} style={{ color: highlight ? '#a78bfa' : 'rgba(255,255,255,0.45)', flexShrink: 0, marginTop: 2 }} />
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        style={{
          display: 'block', textAlign: 'center',
          padding: '12px 0', borderRadius: 10,
          background: highlight ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${highlight ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
          color: '#fff', fontSize: 14, fontWeight: 600,
          textDecoration: 'none', fontFamily: 'inherit',
          boxShadow: highlight ? '0 0 24px rgba(124,58,237,0.4)' : 'none',
          transition: 'opacity 0.15s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.opacity = '0.85'; }}
        onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        {cta}
      </Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const checking = useAuthRedirect();
  if (checking) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      color: '#fff',
      fontFamily: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
      overflowX: 'hidden',
    }}>
      {/* Ambient gradients */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)',
          width: 900, height: 600,
          background: 'radial-gradient(ellipse, rgba(124,58,237,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '30%', right: -200,
          width: 500, height: 500,
          background: 'radial-gradient(ellipse, rgba(14,165,233,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />
      </div>

      <NavBar />

      {/* HERO */}
      <LandingHero />

      {/* ══ FEATURES ══ */}
      <section id="features" style={{
        position: 'relative', zIndex: 1,
        padding: 'clamp(64px, 7vw, 88px) clamp(20px, 5vw, 64px) clamp(56px, 6vw, 76px)',
        maxWidth: 1180, margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 14px' }}>
            Everything you need
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff' }}>
            Built for deep studying
          </h2>
          <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Every tool you need to go from passive reading to active learning.
          </p>
        </div>

        <div className="landing-feature-grid">
          {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{
        position: 'relative', zIndex: 1,
        padding: 'clamp(60px, 7vw, 86px) clamp(20px, 5vw, 64px) clamp(72px, 8vw, 100px)',
      }}>
        {/* Divider glow */}
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.4), transparent)',
        }} />

        <div style={{ textAlign: 'center', marginBottom: 46 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 14px' }}>
            Simple pricing
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 16px', color: '#fff' }}>
            Start free, scale when ready
          </h2>
          <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            No credit card required for Free. Upgrade any time.
          </p>
        </div>

        <div style={{
          display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: 1000, margin: '0 auto',
        }}>
          <PricingCard
            name="Free"
            price="$0"
            sub="forever"
            features={FREE_FEATURES}
            cta="Get Started Free"
            ctaHref="/register"
          />
          <PricingCard
            name="Premium"
            price="$4.99"
            sub="/month"
            badge="Most Popular"
            features={PREMIUM_FEATURES}
            cta="Start Premium"
            ctaHref="/register"
            highlight
          />
          <PricingCard
            name="Pro"
            price="$13.99"
            sub="/month"
            features={PRO_FEATURES}
            cta="Start Pro"
            ctaHref="/register"
          />
        </div>

        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>
          All paid plans include a 7-day free trial.{' '}
          <Link href="/pricing" style={{ color: '#a78bfa', textDecoration: 'none' }}
            onMouseOver={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseOut={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          >
            See full comparison →
          </Link>
        </p>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{
        position: 'relative', zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: 'clamp(40px, 6vw, 64px) clamp(20px, 5vw, 64px) clamp(28px, 4vw, 40px)',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', gap: 40, flexWrap: 'wrap',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}>
          {/* Brand */}
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 12px rgba(124,58,237,0.4)',
              }}>
                <BookOpen size={14} style={{ color: '#fff' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>StudySync</span>
            </div>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65, margin: 0, maxWidth: 240 }}>
              The collaborative PDF workspace for students who take studying seriously.
            </p>
          </div>

          {/* Links */}
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>
              Product
            </p>
            {[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Workspace', href: '/workspace' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Community', href: '/community' },
            ].map(({ label, href }) => (
              <Link key={label} href={href} style={{
                display: 'block', fontSize: 14, color: 'rgba(255,255,255,0.55)',
                textDecoration: 'none', marginBottom: 10, transition: 'color 0.15s',
              }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Account */}
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>
              Account
            </p>
            {[
              { label: 'Sign In', href: '/login' },
              { label: 'Register', href: '/register' },
              { label: 'Settings', href: '/settings' },
            ].map(({ label, href }) => (
              <Link key={label} href={href} style={{
                display: 'block', fontSize: 14, color: 'rgba(255,255,255,0.55)',
                textDecoration: 'none', marginBottom: 10, transition: 'color 0.15s',
              }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Support */}
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>
              Support
            </p>
            <a
              href="mailto:support@studysync.io"
              style={{ fontSize: 14, color: '#a78bfa', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#c4b5fd'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = '#a78bfa'; }}
            >
              support@studysync.io
            </a>
          </div>
        </div>

        <div style={{
          maxWidth: 1100, margin: '0 auto',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
            © 2026 StudySync. All rights reserved.
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
            Built for learners everywhere.
          </p>
        </div>
      </footer>

      {/* Keyframes */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(6px); }
        }
        .nav-links-desktop {
          display: flex;
        }
        .landing-feature-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        @media (max-width: 900px) {
          .landing-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 600px) {
          .nav-links-desktop { display: none !important; }
          .landing-feature-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
