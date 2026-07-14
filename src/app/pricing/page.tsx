'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Crown, Loader2, Search, Sparkles, X, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import LeftRail from '@/components/LeftRail';
import NotificationBell from '@/components/NotificationBell';
import { useLanguage } from '@/contexts/LanguageContext';

type Plan = 'free' | 'premium' | 'pro';

const FREE_FEATURE_KEYS = ['price_free_f1','price_free_f2','price_free_f3','price_free_f4','price_free_f5','price_free_f6','price_free_f7'] as const;
const PREMIUM_FEATURE_KEYS = ['price_prem_f1','price_prem_f2','price_prem_f3','price_prem_f4','price_prem_f5','price_prem_f6','price_prem_f7','price_prem_f8'] as const;
const PRO_FEATURE_KEYS = ['price_pro_f1','price_pro_f2','price_pro_f3','price_pro_f4','price_pro_f5','price_pro_f6','price_pro_f7'] as const;

function useAnimatedPrice(target: number, duration = 380) {
  const [display, setDisplay] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    const from = previous.current;
    if (Math.abs(from - target) < .01) return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { previous.current = target; setDisplay(target); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return display;
}

function Feature({ text, included = true }: { text: string; included?: boolean }) {
  return (
    <li className={included ? 'pricing-feature' : 'pricing-feature unavailable'}>
      {included ? <Check size={16} strokeWidth={2.2} /> : <X size={16} strokeWidth={2} />}
      <span>{text}</span>
    </li>
  );
}

function PlanCard({
  plan, label, subtitle, price, yearly, features, unavailable = [], popular = false,
  current, loading, onChoose,
}: {
  plan: Plan;
  label: string;
  subtitle: string;
  price: number;
  yearly: boolean;
  features: string[];
  unavailable?: number[];
  popular?: boolean;
  current: boolean;
  loading: boolean;
  onChoose: () => void;
}) {
  const Icon = plan === 'free' ? Zap : plan === 'premium' ? Crown : Sparkles;
  const formatted = plan === 'free' ? '0' : yearly ? price.toFixed(0) : price.toFixed(2);
  const buttonLabel = current ? 'Current plan' : plan === 'free' ? 'Get Started Free' : `Get ${label}`;
  return (
    <article className={`pricing-card ${popular ? 'popular' : ''} ${plan}`}>
      {popular && <div className="popular-label"><Sparkles size={12} /> Most Popular</div>}
      <div className="plan-badge"><Icon size={13} /> {label}</div>
      <p className="plan-subtitle">{subtitle}</p>
      <div className="plan-price"><strong>${formatted}</strong><span>/ {plan === 'free' ? 'forever' : yearly ? 'year' : 'month'}</span></div>
      {yearly && plan !== 'free' && <p className="monthly-equivalent">${plan === 'premium' ? '3.25' : '9.08'}/mo — billed annually</p>}
      <ul className="feature-list">
        {features.map((feature, index) => <Feature key={`${plan}-${index}`} text={feature} included={!unavailable.includes(index)} />)}
      </ul>
      <button
        className={`plan-button ${plan}`}
        disabled={current || loading}
        onClick={onChoose}
      >
        {loading ? <><Loader2 size={15} className="pricing-spin" /> Opening checkout…</> : <>{buttonLabel}{!current && plan !== 'free' && <ArrowRight size={14} />}</>}
      </button>
    </article>
  );
}

export default function PricingPage() {
  const { t } = useLanguage();
  const [yearly, setYearly] = useState(false);
  const [userPlan, setUserPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const premiumPrice = useAnimatedPrice(yearly ? 39 : 4.99);
  const proPrice = useAnimatedPrice(yearly ? 109 : 13.99);

  const loadPlan = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUserPlan(null); return; }
    const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
    setUserPlan((data?.plan as Plan) ?? 'free');
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setToast({ type: 'success', message: 'Payment successful! Your plan has been upgraded.' });
      window.history.replaceState({}, '', '/pricing');
      setTimeout(loadPlan, 1500);
    } else if (params.get('canceled') === 'true') {
      setToast({ type: 'error', message: 'Payment canceled. No charges were made.' });
      window.history.replaceState({}, '', '/pricing');
    }
  }, [loadPlan]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleCheckout = useCallback(async (plan: 'premium' | 'pro') => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session?.user || !session.access_token) {
      window.location.href = '/login?redirect=/pricing';
      return;
    }
    setLoadingPlan(plan);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan, billing: yearly ? 'yearly' : 'monthly' }),
      });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Could not open checkout.');
      if (payload.url) window.location.href = payload.url;
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Something went wrong. Try again.' });
    } finally { setLoadingPlan(null); }
  }, [yearly]);

  const freeFeatures = FREE_FEATURE_KEYS.map((key) => t(key));
  const premiumFeatures = PREMIUM_FEATURE_KEYS.map((key) => t(key));
  const proFeatures = PRO_FEATURE_KEYS.map((key) => key === 'price_pro_f5' ? 'AI-generated flashcards & quizzes (coming soon)' : t(key));

  return (
    <div className="pricing-shell">
      <LeftRail />
      <div className="pricing-content">
        <div className="pricing-ambient ambient-one" aria-hidden="true" />
        <div className="pricing-ambient ambient-two" aria-hidden="true" />
        <header className="pricing-topbar">
          <button className="pricing-search" onClick={() => { window.location.href = '/workspace'; }}><Search size={15} />Search anything…<kbd>Ctrl K</kbd></button>
          <NotificationBell />
        </header>

        <main className="pricing-main">
          <section className="pricing-hero">
            <div className="hero-badge"><Sparkles size={13} />Simple, transparent pricing</div>
            <h1>Invest in your studies.</h1>
            <p>Start free, no credit card required. Upgrade when you&apos;re ready.</p>
            <div className="billing-toggle" aria-label="Billing frequency">
              <span className={`billing-slider ${yearly ? 'yearly' : ''}`} aria-hidden="true" />
              <button className={!yearly ? 'active' : ''} onClick={() => setYearly(false)}>Monthly</button>
              <button className={yearly ? 'active' : ''} onClick={() => setYearly(true)}>Yearly <span>Save 35%</span></button>
            </div>
          </section>

          <section className="pricing-grid">
            <PlanCard
              plan="free" label="Free" subtitle={t('price_free_sub')} price={0} yearly={yearly}
              features={freeFeatures} unavailable={[5, 6]} current={userPlan === 'free'} loading={false}
              onChoose={() => { window.location.href = userPlan ? '/workspace' : '/register'; }}
            />
            <PlanCard
              plan="premium" label="Premium" subtitle={t('price_premium_sub')} price={premiumPrice} yearly={yearly}
              features={premiumFeatures} popular current={userPlan === 'premium'} loading={loadingPlan === 'premium'}
              onChoose={() => handleCheckout('premium')}
            />
            <PlanCard
              plan="pro" label="Pro" subtitle={t('price_pro_sub')} price={proPrice} yearly={yearly}
              features={proFeatures} current={userPlan === 'pro'} loading={loadingPlan === 'pro'}
              onChoose={() => handleCheckout('pro')}
            />
          </section>

          <div className="pricing-footnote">
            <p>Prices shown in USD. Payments are processed securely through Stripe.</p>
            <a href="mailto:support@studysync.app">Questions? Contact support <ArrowRight size={13} /></a>
          </div>
        </main>
      </div>

      {toast && <div className={`pricing-toast ${toast.type}`}>{toast.message}</div>}

      <style>{`
        .pricing-shell { min-height: 100dvh; display: flex; background: var(--bg-app); color: var(--text-1); font-family: var(--font-body); }
        .pricing-content { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; overflow: hidden; isolation: isolate; background: linear-gradient(120deg, var(--bg-app) 0%, color-mix(in srgb, var(--accent) 3%, var(--bg-app)) 48%, var(--bg-app) 100%); background-size: 180% 180%; animation: pricing-bg-flow 14s ease-in-out infinite; }
        .pricing-ambient { position: absolute; z-index: -1; border-radius: 50%; pointer-events: none; filter: blur(12px); opacity: .34; will-change: transform; }.ambient-one { width: 520px; height: 520px; top: 80px; left: 18%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 68%); animation: ambient-drift-one 13s ease-in-out infinite alternate; }.ambient-two { width: 460px; height: 460px; right: -100px; top: 320px; background: radial-gradient(circle, rgba(59,130,246,.15), rgba(168,85,247,.07) 42%, transparent 70%); animation: ambient-drift-two 16s ease-in-out infinite alternate; }
        .pricing-topbar { height: 58px; flex-shrink: 0; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; gap: 22px; padding: 0 24px; background: color-mix(in srgb, var(--bg-app) 88%, transparent); backdrop-filter: blur(18px); position: sticky; top: 0; z-index: 30; }
        .pricing-search { width: min(545px, 58vw); height: 34px; border: 1px solid transparent; border-radius: 10px; background: var(--bg-elevated); color: var(--text-3); display: flex; align-items: center; gap: 8px; padding: 0 13px; font: inherit; font-size: 12px; cursor: pointer; text-align: left; transition: border-color .2s, box-shadow .2s, transform .2s; }.pricing-search:hover { border-color: color-mix(in srgb, var(--accent) 28%, transparent); box-shadow: 0 5px 18px color-mix(in srgb, var(--accent) 9%, transparent); transform: translateY(-1px); }.pricing-search kbd { margin-left: auto; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-panel); color: var(--text-3); font-size: 9px; }
        .pricing-main { flex: 1; padding: 34px clamp(20px, 4vw, 62px) 46px; position: relative; z-index: 1; }
        .pricing-hero { text-align: center; animation: pricing-hero-in .6s cubic-bezier(.2,.8,.2,1) both; }.hero-badge { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; background: linear-gradient(110deg, var(--accent-muted), color-mix(in srgb, #3b82f6 14%, var(--accent-muted)), var(--accent-muted)); background-size: 220% 100%; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 23%, transparent); font-size: 11.5px; font-weight: 750; animation: badge-flow 5s linear infinite; }.pricing-hero h1 { margin: 14px 0 8px; color: var(--text-1); font-size: clamp(31px, 3.6vw, 44px); line-height: 1.1; letter-spacing: -.045em; background: linear-gradient(100deg, var(--text-1) 15%, var(--accent) 50%, var(--text-1) 85%); background-size: 220% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: title-shimmer 8s ease-in-out infinite; }.pricing-hero > p { margin: 0; color: var(--text-2); font-size: 14px; }
        .billing-toggle { position: relative; width: 276px; margin: 24px auto 30px; padding: 4px; border-radius: 13px; background: color-mix(in srgb, var(--bg-elevated) 88%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--border-subtle)); display: grid; grid-template-columns: 1fr 1fr; gap: 0; box-shadow: inset 0 1px 3px rgba(15,23,42,.06), 0 8px 22px rgba(15,23,42,.06); }.billing-slider { position: absolute; z-index: 0; top: 4px; left: 4px; bottom: 4px; width: calc(50% - 4px); border-radius: 9px; background: linear-gradient(135deg, var(--accent), #6366f1 55%, #3b82f6); box-shadow: 0 5px 13px color-mix(in srgb, var(--accent) 25%, transparent); transform: translateX(0); transition: transform .38s cubic-bezier(.22,1,.36,1), box-shadow .3s; }.billing-slider.yearly { transform: translateX(100%); }.billing-toggle button { position: relative; z-index: 1; height: 34px; padding: 0 9px; border: 0; border-radius: 9px; background: transparent; color: var(--text-3); font: inherit; font-size: 11.5px; font-weight: 650; cursor: pointer; transition: color .25s, transform .2s; }.billing-toggle button:hover { transform: translateY(-1px); }.billing-toggle button.active { color: #fff; }.billing-toggle button span { margin-left: 4px; padding: 2px 5px; border-radius: 999px; background: rgba(255,255,255,.18); color: inherit; font-size: 8.5px; }
        .pricing-grid { max-width: 1050px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 22px; align-items: stretch; }
        .pricing-card { position: relative; min-height: 610px; padding: 31px 31px 30px; border-radius: 20px; border: 1px solid var(--border); background: color-mix(in srgb, var(--bg-panel) 94%, transparent); backdrop-filter: blur(18px); box-shadow: 0 8px 28px rgba(15,23,42,.08); display: flex; flex-direction: column; transition: transform .36s cubic-bezier(.22,1,.36,1), box-shadow .36s, border-color .3s; animation: card-rise .62s cubic-bezier(.22,1,.36,1) both; }.pricing-card:nth-child(2) { animation-delay: .08s; }.pricing-card:nth-child(3) { animation-delay: .16s; }.pricing-card.free:hover { transform: translateY(-8px); border-color: rgba(100,116,139,.35); box-shadow: 0 22px 50px rgba(71,85,105,.16); }.pricing-card.premium:hover { transform: translateY(-10px) scale(1.008); box-shadow: 0 25px 58px color-mix(in srgb, var(--accent) 22%, transparent); }.pricing-card.pro:hover { transform: translateY(-8px); border-color: rgba(124,58,237,.42); box-shadow: 0 24px 54px rgba(76,29,149,.2); }.pricing-card.popular { border: 2px solid var(--accent); padding: 30px 30px 29px; animation: card-rise .62s .08s cubic-bezier(.22,1,.36,1) both, popular-glow 3.5s 1s ease-in-out infinite; }.popular-label { position: absolute; top: -15px; left: 50%; transform: translateX(-50%); height: 28px; padding: 0 16px; border-radius: 999px; display: flex; align-items: center; gap: 6px; background: linear-gradient(100deg, var(--accent), #7c3aed, #3b82f6, var(--accent)); background-size: 240% 100%; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 30%, transparent); animation: popular-label-flow 4s linear infinite; }
        .plan-badge { width: fit-content; height: 31px; padding: 0 12px; border: 1px solid var(--border); border-radius: 999px; display: flex; align-items: center; gap: 6px; color: #64748b; background: linear-gradient(135deg, var(--bg-elevated), color-mix(in srgb, #94a3b8 8%, var(--bg-elevated))); font-size: 10.5px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; transition: transform .38s cubic-bezier(.22,1,.36,1), color .3s, background .3s, border-color .3s, box-shadow .3s; }.pricing-card:hover .plan-badge { transform: translateY(-3px); }.pricing-card.free:hover .plan-badge { color: #fff; border-color: #4f46e5; background: linear-gradient(135deg, #4f46e5, #6366f1); box-shadow: 0 7px 16px rgba(79,70,229,.22); }.pricing-card.premium .plan-badge { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); background: linear-gradient(135deg, var(--accent-muted), color-mix(in srgb, #3b82f6 12%, var(--accent-muted))); }.pricing-card.premium:hover .plan-badge { color: #fff; border-color: transparent; background: linear-gradient(110deg, var(--accent), #7c3aed, #3b82f6); box-shadow: 0 7px 16px color-mix(in srgb, var(--accent) 24%, transparent); }.pricing-card.pro .plan-badge { color: #7c3aed; border-color: rgba(124,58,237,.22); background: linear-gradient(135deg, rgba(124,58,237,.10), rgba(245,158,11,.07)); }.pricing-card.pro:hover .plan-badge { color: #fff; border-color: transparent; background: linear-gradient(110deg, #0f172a, #312e81 62%, #4c1d95); box-shadow: 0 7px 16px rgba(49,46,129,.2); }
        .plan-subtitle { min-height: 20px; margin: 17px 0 27px; color: var(--text-2); font-size: 12px; transition: color .25s; }.pricing-card:hover .plan-subtitle { color: var(--text-1); }.plan-price { display: flex; align-items: baseline; gap: 5px; color: var(--text-1); transform-origin: left center; transition: transform .38s cubic-bezier(.22,1,.36,1); }.pricing-card:hover .plan-price { transform: scale(1.045); }.plan-price strong { font-size: 38px; line-height: 1; letter-spacing: -.04em; }.plan-price span { color: var(--text-2); font-size: 13px; }.monthly-equivalent { height: 16px; margin: 8px 0 0; color: var(--text-3); font-size: 10.5px; }
        .feature-list { list-style: none; padding: 0; margin: 25px 0 28px; display: flex; flex-direction: column; gap: 16px; }.pricing-feature { display: flex; align-items: flex-start; gap: 11px; color: var(--text-1); font-size: 12px; line-height: 1.45; opacity: 1; animation: feature-in .4s cubic-bezier(.2,.8,.2,1) backwards; }.pricing-feature:nth-child(1) { animation-delay: .22s; }.pricing-feature:nth-child(2) { animation-delay: .27s; }.pricing-feature:nth-child(3) { animation-delay: .32s; }.pricing-feature:nth-child(4) { animation-delay: .37s; }.pricing-feature:nth-child(5) { animation-delay: .42s; }.pricing-feature:nth-child(6) { animation-delay: .47s; }.pricing-feature:nth-child(7) { animation-delay: .52s; }.pricing-feature:nth-child(8) { animation-delay: .57s; }.pricing-feature svg { flex-shrink: 0; color: var(--accent); margin-top: 1px; filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--accent) 22%, transparent)); }.pricing-card.pro .pricing-feature svg { color: #7c3aed; }.pricing-feature.unavailable { color: var(--text-3); text-decoration: line-through; }.pricing-feature.unavailable svg { color: var(--text-3); filter: none; }
        .plan-button { position: relative; overflow: hidden; width: 100%; min-height: 48px; margin-top: auto; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border)); background: linear-gradient(120deg, var(--accent-muted), color-mix(in srgb, #3b82f6 10%, var(--accent-muted))); color: var(--accent); display: flex; align-items: center; justify-content: center; gap: 9px; font: inherit; font-size: 12.5px; font-weight: 750; cursor: pointer; transition: transform .2s, box-shadow .25s; }.plan-button::after { content: ''; position: absolute; top: -40%; bottom: -40%; width: 36%; left: -55%; transform: skewX(-20deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent); transition: left .65s ease; }.plan-button:hover:not(:disabled)::after { left: 125%; }.plan-button:hover:not(:disabled) { transform: translateY(-2px); }.plan-button.premium { border: 0; background: linear-gradient(110deg, var(--accent), #7c3aed 48%, #3b82f6); background-size: 180% 100%; color: #fff; box-shadow: 0 8px 19px color-mix(in srgb, var(--accent) 27%, transparent); animation: premium-button-flow 5s ease-in-out infinite alternate; }.plan-button.pro { border: 0; background: linear-gradient(110deg, #0f172a, #312e81 62%, #4c1d95); color: #fff; box-shadow: 0 8px 19px rgba(49,46,129,.2); }.plan-button:disabled { cursor: default; opacity: .58; box-shadow: none; animation: none; }
        .pricing-footnote { margin: 30px 0 0; text-align: center; color: var(--text-3); font-size: 11px; display: flex; flex-direction: column; align-items: center; gap: 7px; }.pricing-footnote p { margin: 0; }.pricing-footnote a { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); text-decoration: none; font-weight: 650; }.pricing-footnote a svg { transition: transform .2s; }.pricing-footnote a:hover svg { transform: translateX(3px); }.pricing-toast { position: fixed; right: 24px; bottom: 24px; z-index: 100; max-width: 360px; padding: 12px 16px; border-radius: 9px; color: #fff; font-size: 12.5px; box-shadow: 0 12px 35px rgba(0,0,0,.25); animation: toast-in .35s cubic-bezier(.22,1,.36,1) both; }.pricing-toast.success { background: #15803d; }.pricing-toast.error { background: #b91c1c; }.pricing-spin { animation: pricing-spin .8s linear infinite; }
        @keyframes pricing-spin { to { transform: rotate(360deg); } }
        @keyframes pricing-bg-flow { 0%,100% { background-position: 0% 40%; } 50% { background-position: 100% 60%; } }
        @keyframes ambient-drift-one { from { transform: translate3d(-7%, -4%, 0) scale(.94); } to { transform: translate3d(18%, 11%, 0) scale(1.12); } }
        @keyframes ambient-drift-two { from { transform: translate3d(5%, 8%, 0) scale(1); } to { transform: translate3d(-24%, -10%, 0) scale(1.14); } }
        @keyframes pricing-hero-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes badge-flow { to { background-position: -220% 0; } }
        @keyframes title-shimmer { 0%,100% { background-position: 120% center; } 50% { background-position: -20% center; } }
        @keyframes card-rise { from { opacity: 0; transform: translateY(24px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes popular-glow { 0%,100% { box-shadow: 0 10px 32px color-mix(in srgb, var(--accent) 13%, transparent); } 50% { box-shadow: 0 18px 48px color-mix(in srgb, var(--accent) 28%, transparent); } }
        @keyframes popular-label-flow { to { background-position: -240% 0; } }
        @keyframes feature-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes premium-button-flow { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
        @keyframes toast-in { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 1050px) { .pricing-grid { grid-template-columns: 1fr; max-width: 610px; }.pricing-card { min-height: auto; }.pricing-card.popular { order: -1; }.feature-list { display: grid; grid-template-columns: 1fr 1fr; } }
        @media (max-width: 760px) { .pricing-shell > .left-rail { display: none !important; }.pricing-main { padding: 28px 16px 38px; }.pricing-topbar { justify-content: space-between; padding: 0 14px; }.pricing-search { width: calc(100% - 50px); }.pricing-grid { gap: 18px; }.pricing-card { padding: 27px 23px 24px; }.pricing-card.popular { padding: 26px 22px 23px; }.feature-list { grid-template-columns: 1fr; }.pricing-hero h1 { font-size: 32px; } }
        @media (prefers-reduced-motion: reduce) { .pricing-content, .pricing-ambient, .pricing-hero, .hero-badge, .pricing-hero h1, .pricing-card, .pricing-card.popular, .popular-label, .pricing-feature, .plan-button.premium, .pricing-toast { animation: none !important; }.pricing-feature { opacity: 1 !important; transform: none !important; }.billing-slider, .pricing-card, .plan-button, .pricing-search { transition-duration: .01ms !important; } }
      `}</style>
    </div>
  );
}
