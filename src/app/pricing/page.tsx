'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Zap, Crown, Sparkles, ArrowLeft, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

// ── Animated price number ─────────────────────────────────────────────────────

function useAnimatedPrice(target: number, duration = 420) {
  const [display, setDisplay] = useState(target);
  const animRef = useRef<number | null>(null);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const to   = target;
    if (Math.abs(from - to) < 0.01) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * ease);
      if (t < 1) animRef.current = requestAnimationFrame(tick);
      else { prevRef.current = to; setDisplay(to); }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target, duration]);

  return display;
}

// Plan feature keys – resolved inside the component via t()
const FREE_FEATURE_KEYS = ['price_free_f1','price_free_f2','price_free_f3','price_free_f4','price_free_f5','price_free_f6','price_free_f7'] as const;
const PREMIUM_FEATURE_KEYS = ['price_prem_f1','price_prem_f2','price_prem_f3','price_prem_f4','price_prem_f5','price_prem_f6','price_prem_f7','price_prem_f8'] as const;
const PRO_FEATURE_KEYS = ['price_pro_f1','price_pro_f2','price_pro_f3','price_pro_f4','price_pro_f5','price_pro_f6','price_pro_f7'] as const;

// ── Feature row ───────────────────────────────────────────────────────────────

function Feature({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '5px 0', fontSize: 13.5,
      color: accent ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: accent ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={10} style={{ color: accent ? '#60a5fa' : 'rgba(255,255,255,0.45)' }} strokeWidth={3} />
      </div>
      <span style={{ lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { t } = useLanguage();
  const [yearly, setYearly]           = useState(false);
  const [userPlan, setUserPlan]       = useState<'free' | 'premium' | 'pro' | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [ready, setReady]             = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Animated prices
  const premiumPrice = useAnimatedPrice(yearly ? 39    : 4.99);
  const proPrice     = useAnimatedPrice(yearly ? 109   : 13.99);
  const premiumSub   = useAnimatedPrice(yearly ? 3.25  : 4.99);
  const proSub       = useAnimatedPrice(yearly ? 9.08  : 13.99);

  // Load user plan
  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles').select('plan').eq('id', user.id).maybeSingle();
          setUserPlan((data?.plan as 'free' | 'premium' | 'pro') ?? 'free');
        } else {
          setUserPlan(null);
        }
      } finally {
        setReady(true);
      }
    };
    load();
  }, []);

  // Handle Stripe redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setToast({ type: 'success', msg: '🎉 Payment successful! Your plan has been upgraded.' });
      window.history.replaceState({}, '', '/pricing');
      const refresh = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
          setUserPlan((data?.plan as 'free' | 'premium' | 'pro') ?? 'free');
        }
      };
      setTimeout(refresh, 1500);
    } else if (params.get('canceled') === 'true') {
      setToast({ type: 'error', msg: 'Payment canceled. No charges were made.' });
      window.history.replaceState({}, '', '/pricing');
    }
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCheckout = useCallback(async (plan: 'premium' | 'pro') => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/login?redirect=/pricing'; return; }

    setLoadingPlan(plan);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          billing: yearly ? 'yearly' : 'monthly',
          email:   user.email,
          userId:  user.id,
        }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Something went wrong. Try again.' });
    } finally {
      setLoadingPlan(null);
    }
  }, [yearly]);

  const cardBase: React.CSSProperties = {
    borderRadius: 16,
    padding: '28px 24px 32px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    position: 'relative',
  };

  return (
    <div style={{ minHeight: '100dvh', fontFamily: 'var(--font-body)', color: '#fff' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 56,
        background: 'rgba(10,15,25,0.9)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/workspace" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'rgba(255,255,255,0.55)', textDecoration: 'none',
            fontSize: 13, transition: 'color 0.15s',
          }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e)  => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
          >
            <ArrowLeft size={14} />
            {t('price_back')}
          </Link>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
            StudySync
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {userPlan && userPlan !== 'free' && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 9999,
              background: 'rgba(37,99,235,0.2)', color: '#60a5fa',
              border: '1px solid rgba(37,99,235,0.4)',
            }}>
              {userPlan === 'premium' ? '★ Premium' : '👑 Pro'}
            </span>
          )}
          <Link href="/workspace" style={{
            fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 6,
            background: '#2563eb', color: '#fff', textDecoration: 'none',
            transition: 'background 0.15s',
          }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = '#3b82f6')}
            onMouseOut={(e)  => ((e.currentTarget as HTMLElement).style.background = '#2563eb')}
          >
            {t('price_open_app')}
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ textAlign: 'center', padding: '64px 24px 48px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 14px', borderRadius: 9999, marginBottom: 20,
          background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)',
          fontSize: 12.5, fontWeight: 600, color: '#60a5fa',
          animation: 'badgePop 0.4s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          <Sparkles size={12} />
          {t('price_badge')}
        </div>

        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.04em',
          margin: '0 0 12px', lineHeight: 1.1,
          animation: 'slideUpFade 0.5s 0.05s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          {t('price_hero_title')}
        </h1>
        <p style={{
          fontSize: 17, color: 'rgba(255,255,255,0.55)', margin: '0 0 40px', fontWeight: 400,
          animation: 'slideUpFade 0.5s 0.1s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          {t('price_hero_sub')}
        </p>

        {/* ── Billing toggle ── */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 9999, padding: '4px 16px',
          animation: 'slideUpFade 0.5s 0.15s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          <span
            onClick={() => setYearly(false)}
            style={{
              fontSize: 13.5, fontWeight: !yearly ? 600 : 400,
              color: !yearly ? '#fff' : 'rgba(255,255,255,0.38)',
              transition: 'color 0.25s, font-weight 0.1s',
              cursor: 'pointer', userSelect: 'none',
              padding: '6px 4px',
            }}
          >
            {t('price_monthly')}
          </span>

          {/* Animated switch */}
          <button
            onClick={() => setYearly((y) => !y)}
            aria-label="Toggle billing period"
            style={{
              width: 44, height: 24, borderRadius: 9999, border: 'none',
              background: yearly ? '#2563eb' : 'rgba(255,255,255,0.18)',
              cursor: 'pointer', position: 'relative',
              transition: 'background 0.3s cubic-bezier(0.22,1,0.36,1)',
              flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: yearly ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.3s cubic-bezier(0.22,1,0.36,1)',
              boxShadow: '0 1px 6px rgba(0,0,0,0.35)',
            }} />
          </button>

          <span
            onClick={() => setYearly(true)}
            style={{
              fontSize: 13.5, fontWeight: yearly ? 600 : 400,
              color: yearly ? '#fff' : 'rgba(255,255,255,0.38)',
              transition: 'color 0.25s, font-weight 0.1s',
              display: 'flex', alignItems: 'center', gap: 7,
              cursor: 'pointer', userSelect: 'none',
              padding: '6px 4px',
            }}
          >
            {t('price_yearly')}
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
              background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.4)',
              color: '#4ade80',
              opacity: yearly ? 1 : 0,
              transform: yearly ? 'scale(1) translateX(0)' : 'scale(0.8) translateX(-4px)',
              transition: 'opacity 0.3s, transform 0.3s cubic-bezier(0.22,1,0.36,1)',
              display: 'inline-block',
            }}>
              {t('price_save_pct')}
            </span>
          </span>
        </div>
      </section>

      {/* ── Plan cards ── */}
      <section style={{
        maxWidth: 1040, margin: '0 auto', padding: '0 20px 80px',
        display: 'flex', gap: 16, alignItems: 'stretch',
      }}>

        {/* ── Free ── */}
        <div
          style={{
            ...cardBase,
            background: hoveredCard === 'free' ? 'rgba(16,24,48,0.97)' : 'rgba(10,15,25,0.85)',
            border: hoveredCard === 'free'
              ? '1px solid rgba(255,255,255,0.2)'
              : '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            boxShadow: hoveredCard === 'free'
              ? '0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.5), 0 0 60px rgba(37,99,235,0.14)'
              : '0 4px 24px rgba(0,0,0,0.25)',
            transform: hoveredCard === 'free' ? 'translateY(-12px) scale(1.02)' : 'translateY(0) scale(1)',
            transition: 'transform 0.35s ease-out, box-shadow 0.35s ease-out, background 0.35s ease-out, border-color 0.35s ease-out',
            animation: 'slideUpFade 0.55s 0.2s cubic-bezier(0.22,1,0.36,1) both',
          }}
          onMouseEnter={() => setHoveredCard('free')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, marginBottom: 16,
              background: hoveredCard === 'free' ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: hoveredCard === 'free' ? 'scale(1.12)' : 'scale(1)',
              transition: 'transform 0.35s ease-out, background 0.3s ease-out, box-shadow 0.3s ease-out',
              boxShadow: hoveredCard === 'free' ? '0 0 12px rgba(59,130,246,0.25)' : 'none',
            }}>
              <Zap size={20} style={{ color: hoveredCard === 'free' ? '#7dd3fc' : 'rgba(255,255,255,0.5)', transition: 'color 0.3s' }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{t('price_free_name')}</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{t('price_free_sub')}</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em' }}>$0</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{t('price_forever')}</span>
            </div>
          </div>

          <div style={{ flex: 1, marginBottom: 28 }}>
            {FREE_FEATURE_KEYS.map((k) => <Feature key={k} text={t(k)} />)}
          </div>

          {userPlan === 'free' || userPlan === null ? (
            <div style={{
              width: '100%', padding: '11px', borderRadius: 8, textAlign: 'center',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
              boxSizing: 'border-box',
            }}>
              {userPlan === 'free' ? t('price_current_plan') : t('price_get_started_free')}
            </div>
          ) : (
            <Link href="/workspace" style={{
              display: 'block', width: '100%', padding: '11px', borderRadius: 8,
              textAlign: 'center', textDecoration: 'none',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
              boxSizing: 'border-box',
            }}>
              {t('price_open_app')}
            </Link>
          )}
        </div>

        {/* ── Premium (Most Popular) ── */}
        <div
          style={{
            ...cardBase,
            background: hoveredCard === 'premium' ? 'rgba(14,20,42,0.98)' : 'rgba(10,15,25,0.92)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            animation: 'premiumGlow 3s 1s ease-in-out infinite, slideUpFade 0.55s 0.3s cubic-bezier(0.22,1,0.36,1) both',
            transform: hoveredCard === 'premium' ? 'scale(1.05) translateY(-12px)' : 'scale(1.03)',
            boxShadow: hoveredCard === 'premium'
              ? '0 0 0 1.5px rgba(59,130,246,0.55), 0 20px 50px rgba(0,0,0,0.55), 0 0 80px rgba(37,99,235,0.25)'
              : '0 0 50px rgba(37,99,235,0.1), 0 8px 32px rgba(0,0,0,0.35)',
            transition: 'transform 0.35s ease-out, box-shadow 0.35s ease-out, background 0.35s ease-out',
          }}
          onMouseEnter={() => setHoveredCard('premium')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          {/* Popular badge */}
          <div style={{
            position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
            padding: '4px 14px', borderRadius: 9999,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            fontSize: 11.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(37,99,235,0.5)',
            animation: 'badgePop 0.4s 0.5s cubic-bezier(0.22,1,0.36,1) both',
          }}>
            {t('price_popular')}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, marginBottom: 16,
              background: hoveredCard === 'premium' ? 'rgba(37,99,235,0.38)' : 'rgba(37,99,235,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: hoveredCard === 'premium' ? 'scale(1.12)' : 'scale(1)',
              transition: 'transform 0.35s ease-out, background 0.3s ease-out, box-shadow 0.3s ease-out',
              boxShadow: hoveredCard === 'premium' ? '0 0 14px rgba(37,99,235,0.4)' : 'none',
            }}>
              <Crown size={20} style={{ color: hoveredCard === 'premium' ? '#bfdbfe' : '#60a5fa', transition: 'color 0.3s' }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{t('price_premium_name')}</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{t('price_premium_sub')}</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em' }}>
                ${yearly ? premiumPrice.toFixed(0) : premiumPrice.toFixed(2)}
              </span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                {yearly ? t('price_per_year') : t('price_per_month')}
              </span>
            </div>
            {yearly && (
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
                ${premiumSub.toFixed(2)}{t('price_billed_mo')}
              </p>
            )}
          </div>

          <div style={{ flex: 1, marginBottom: 28 }}>
            {PREMIUM_FEATURE_KEYS.map((k) => <Feature key={k} text={t(k)} accent />)}
          </div>

          {userPlan === 'premium' ? (
            <div style={{
              width: '100%', padding: '12px', borderRadius: 8, textAlign: 'center',
              background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.4)',
              fontSize: 14, fontWeight: 600, color: '#60a5fa', boxSizing: 'border-box',
            }}>
              {t('price_current_plan_check')}
            </div>
          ) : (
            <button
              onClick={() => handleCheckout('premium')}
              disabled={!!loadingPlan}
              style={{
                width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                background: loadingPlan === 'premium'
                  ? 'rgba(37,99,235,0.6)'
                  : hoveredCard === 'premium'
                    ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                    : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loadingPlan ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', boxSizing: 'border-box',
                transition: 'background 0.35s ease-out, transform 0.35s ease-out, box-shadow 0.35s ease-out',
                boxShadow: hoveredCard === 'premium'
                  ? '0 6px 20px rgba(37,99,235,0.5)'
                  : '0 4px 14px rgba(37,99,235,0.3)',
                transform: hoveredCard === 'premium' ? 'translateY(-2px) scale(1.01)' : 'translateY(0) scale(1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loadingPlan === 'premium' ? (
                <>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                  {t('price_processing')}
                </>
              ) : (
                <>
                  {t('price_get_premium')}
                  <ArrowRight size={14} style={{ transform: hoveredCard === 'premium' ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.3s ease-out', flexShrink: 0 }} />
                </>
              )}
            </button>
          )}
        </div>

        {/* ── Pro ── */}
        <div
          style={{
            ...cardBase,
            background: hoveredCard === 'pro' ? 'rgba(18,14,44,0.97)' : 'rgba(10,15,25,0.85)',
            border: hoveredCard === 'pro'
              ? '1px solid rgba(139,92,246,0.3)'
              : '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            boxShadow: hoveredCard === 'pro'
              ? '0 0 0 1px rgba(139,92,246,0.4), 0 20px 50px rgba(0,0,0,0.5), 0 0 70px rgba(124,58,237,0.18)'
              : '0 4px 24px rgba(0,0,0,0.25)',
            transform: hoveredCard === 'pro' ? 'translateY(-12px) scale(1.02)' : 'translateY(0) scale(1)',
            transition: 'transform 0.35s ease-out, box-shadow 0.35s ease-out, background 0.35s ease-out, border-color 0.35s ease-out',
            animation: 'slideUpFade 0.55s 0.4s cubic-bezier(0.22,1,0.36,1) both',
          }}
          onMouseEnter={() => setHoveredCard('pro')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, marginBottom: 16,
              background: hoveredCard === 'pro' ? 'rgba(124,58,237,0.32)' : 'rgba(124,58,237,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: hoveredCard === 'pro' ? 'scale(1.12)' : 'scale(1)',
              transition: 'transform 0.35s ease-out, background 0.3s ease-out, box-shadow 0.3s ease-out',
              boxShadow: hoveredCard === 'pro' ? '0 0 14px rgba(124,58,237,0.38)' : 'none',
            }}>
              <Sparkles size={20} style={{ color: hoveredCard === 'pro' ? '#ddd6fe' : '#a78bfa', transition: 'color 0.3s' }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{t('price_pro_name')}</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{t('price_pro_sub')}</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em' }}>
                ${yearly ? proPrice.toFixed(0) : proPrice.toFixed(2)}
              </span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                {yearly ? t('price_per_year') : t('price_per_month')}
              </span>
            </div>
            {yearly && (
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
                ${proSub.toFixed(2)}{t('price_billed_mo')}
              </p>
            )}
          </div>

          <div style={{ flex: 1, marginBottom: 28 }}>
            {PRO_FEATURE_KEYS.map((k) => <Feature key={k} text={t(k)} />)}
          </div>

          {userPlan === 'pro' ? (
            <div style={{
              width: '100%', padding: '11px', borderRadius: 8, textAlign: 'center',
              background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.35)',
              fontSize: 14, fontWeight: 600, color: '#a78bfa', boxSizing: 'border-box',
            }}>
              {t('price_current_plan_check')}
            </div>
          ) : (
            <button
              onClick={() => handleCheckout('pro')}
              disabled={!!loadingPlan}
              style={{
                width: '100%', padding: '11px', borderRadius: 8,
                background: hoveredCard === 'pro' ? 'rgba(124,58,237,0.22)' : 'rgba(255,255,255,0.07)',
                border: hoveredCard === 'pro' ? '1px solid rgba(139,92,246,0.55)' : '1px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: loadingPlan ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', boxSizing: 'border-box',
                transition: 'background 0.35s ease-out, border-color 0.35s ease-out, transform 0.35s ease-out, box-shadow 0.35s ease-out',
                transform: hoveredCard === 'pro' ? 'translateY(-2px) scale(1.01)' : 'translateY(0) scale(1)',
                boxShadow: hoveredCard === 'pro' ? '0 6px 18px rgba(124,58,237,0.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loadingPlan === 'pro' ? (
                <>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                  {t('price_processing')}
                </>
              ) : (
                <>
                  {t('price_get_pro')}
                  <ArrowRight size={14} style={{ transform: hoveredCard === 'pro' ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.3s ease-out', flexShrink: 0 }} />
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* ── FAQ strip ── */}
      <section style={{
        maxWidth: 680, margin: '0 auto', padding: '0 24px 80px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
          {t('price_faq_strip')}
          {' '}
          <a href="mailto:support@studysync.app" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
            {t('price_faq_contact')}
          </a>
        </p>
      </section>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 20px', borderRadius: 10,
          background: toast.type === 'success' ? 'rgba(21,128,61,0.95)' : 'rgba(153,27,27,0.95)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(74,222,128,0.4)' : 'rgba(252,165,165,0.4)'}`,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: '#fff', fontSize: 14, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'toastSlide 0.3s cubic-bezier(0.22,1,0.36,1) both',
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
