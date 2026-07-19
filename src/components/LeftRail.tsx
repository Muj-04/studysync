'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, Files, Layers, Video, Users, MessageCircle, Settings, CreditCard, Sparkles, Clock,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { effectivePlanLimits, type Plan } from '@/lib/planLimits';

/**
 * Shared left navigation rail used by the (app) route group. Replaces
 * the horizontal nav links each protected page used to render in its
 * own header. Two sections (STUDY / COLLABORATE), Settings, and two
 * usage widgets at the bottom (AI usage this month, Study time this
 * week). Active state is matched on pathname.
 *
 * Token-only styling — uses --bg-sidebar / --border-subtle / --text-*
 * / --accent / --accent-muted / --green so it adapts to both themes.
 */

const STUDY_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
  { href: '/workspace',  label: 'Workspace',  Icon: Files },
  { href: '/library',    label: 'Library',    Icon: BookOpen },
  { href: '/flashcards', label: 'Flashcards', Icon: Layers },
] as const;

const COLLABORATE_ITEMS = [
  { href: '/study-rooms', label: 'Study Rooms', Icon: Video },
  { href: '/friends',     label: 'Friends',     Icon: Users },
  { href: '/community',   label: 'Community',   Icon: MessageCircle },
] as const;

const COLLAPSED_STORAGE_KEY = 'studysync_main_sidebar_collapsed';

export default function LeftRail() {
  const pathname = usePathname() ?? '';
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true');
      } catch {
        // Keep the sidebar expanded when browser storage is unavailable.
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // The interaction should still work even if persistence is unavailable.
      }
      return next;
    });
  };

  return (
    <aside
      className="left-rail"
      style={{
        width: collapsed ? 64 : 220,
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        fontFamily: 'var(--font-body)',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
          padding: collapsed ? '14px 10px 10px' : '18px 12px 22px 18px',
          flexShrink: 0,
        }}
      >
        <a
          href="/dashboard"
          aria-label="StudySync dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              flexShrink: 0,
            }}
          >
            S
          </div>
          {!collapsed && (
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
              StudySync
            </span>
          )}
        </a>

        {!collapsed && (
          <CollapseButton collapsed={collapsed} onClick={toggleCollapsed} />
        )}
      </div>

      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 10, flexShrink: 0 }}>
          <CollapseButton collapsed={collapsed} onClick={toggleCollapsed} />
        </div>
      )}

      {/* Scrollable nav */}
      <nav
        aria-label="Main navigation"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '0 10px' : '0 12px', minHeight: 0 }}
      >
        <RailSection label="Study"        items={STUDY_ITEMS}        pathname={pathname} collapsed={collapsed} />
        <RailSection label="Collaborate"  items={COLLABORATE_ITEMS}  pathname={pathname} collapsed={collapsed} />

        <div style={{ height: collapsed ? 8 : 14 }} />
        <RailItem href="/settings" label="Settings" Icon={Settings} pathname={pathname} collapsed={collapsed} />
        <RailItem href="/pricing" label="Pricing" Icon={CreditCard} pathname={pathname} collapsed={collapsed} />
      </nav>

      {/* Bottom usage widgets */}
      <div style={{
        padding: collapsed ? '12px 10px 16px' : '12px 14px 16px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flexShrink: 0,
      }}>
        <UsageWidget kind="ai" collapsed={collapsed} />
        <UsageWidget kind="study" collapsed={collapsed} />
      </div>
    </aside>
  );
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? 'Expand main sidebar' : 'Collapse main sidebar';
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-hover)',
        color: 'var(--text-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Icon size={16} />
    </button>
  );
}

function RailSection({
  label, items, pathname, collapsed,
}: {
  label: string;
  items: ReadonlyArray<{ href: string; label: string; Icon: React.ElementType }>;
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <div style={{ marginBottom: collapsed ? 10 : 8 }}>
      {!collapsed && (
        <div style={{
          padding: '14px 10px 6px',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
        }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((it) => (
          <RailItem key={it.href} {...it} pathname={pathname} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

function RailItem({
  href, label, Icon, pathname, collapsed,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  pathname: string;
  collapsed: boolean;
}) {
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <a
      href={href}
      aria-label={label}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 11,
        padding: collapsed ? '9px 0' : '8px 10px',
        borderRadius: 7,
        textDecoration: 'none',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        background: active ? 'var(--accent-muted)' : 'transparent',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
        }
      }}
      onMouseOut={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
        }
      }}
    >
      <Icon size={collapsed ? 18 : 16} strokeWidth={active ? 2.25 : 2} />
      {!collapsed && <span>{label}</span>}
    </a>
  );
}

// ── Usage widgets ────────────────────────────────────────────────────────────
//
// AI Usage  — counts ai_usage.count for this month against the plan limit.
// Study Time — sums study_sessions.duration_seconds for this calendar week.
// Both queries are RLS-scoped to the caller; we don't need plan/billing here.

function UsageWidget({ kind, collapsed }: { kind: 'ai' | 'study'; collapsed: boolean }) {
  const [data, setData] = useState<{ value: number; max: number } | null>(null);

  useEffect(() => {
    const sb = createClient();
    let cancelled = false;

    const load = async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      if (kind === 'ai') {
        const month = new Date().toISOString().slice(0, 7);
        const [usageRes, profileRes] = await Promise.all([
          sb.from('ai_usage').select('count').eq('user_id', user.id).eq('month', month).maybeSingle(),
          sb.from('profiles').select('plan, is_vip').eq('id', user.id).maybeSingle(),
        ]);
        if (cancelled) return;
        const plan = (profileRes.data?.plan ?? 'free') as Plan;
        const isVip = !!profileRes.data?.is_vip;
        const max = effectivePlanLimits(plan, isVip).aiRequestsPerMonth;
        setData({ value: (usageRes.data?.count as number | undefined) ?? 0, max });
      } else {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        weekStart.setHours(0, 0, 0, 0);
        const { data: sessions } = await sb.from('study_sessions')
          .select('duration_seconds')
          .eq('user_id', user.id)
          .gte('started_at', weekStart.toISOString());
        if (cancelled) return;
        const totalSec = (sessions ?? []).reduce(
          (a, s) => a + ((s.duration_seconds as number | null) ?? 0), 0,
        );
        setData({ value: Math.round(totalSec / 60), max: 7 * 60 }); // weekly cap = 7h baseline
      }
    };

    load().catch(() => {});
    const refreshAiUsage = () => { if (kind === 'ai') load().catch(() => {}); };
    window.addEventListener('studysync:ai-usage', refreshAiUsage);

    return () => {
      cancelled = true;
      window.removeEventListener('studysync:ai-usage', refreshAiUsage);
    };
  }, [kind]);

  if (kind === 'ai') {
    const value = data?.value ?? 0;
    const max   = data?.max   ?? 0;
    const display = max === Infinity ? `${value}` : `${value}/${max}`;
    const ratio = max === Infinity || max === 0 ? 0 : Math.min(1, value / max);
    return (
      <Widget
        Icon={Sparkles}
        label="AI Usage"
        right={display}
        sub="This month"
        ratio={ratio}
        barColor="var(--accent)"
        collapsed={collapsed}
      />
    );
  }

  // study
  const minutes = data?.value ?? 0;
  const ratio   = data?.max ? Math.min(1, minutes / data.max) : 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const display = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <Widget
      Icon={Clock}
      label="Study Time"
      right={display}
      sub="This week"
      ratio={ratio}
      barColor="var(--green)"
      collapsed={collapsed}
    />
  );
}

function Widget({
  Icon, label, right, sub, ratio, barColor, collapsed,
}: {
  Icon: React.ElementType;
  label: string;
  right: string;
  sub: string;
  ratio: number;
  barColor: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div
        title={`${label}: ${right} (${sub})`}
        aria-label={`${label}: ${right}, ${sub}`}
        style={{
          height: 36,
          borderRadius: 7,
          background: 'var(--bg-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Icon size={16} style={{ color: barColor }} />
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'var(--border-subtle)',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
            background: barColor,
          }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={14} style={{ color: barColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>
          {label}
        </span>
        <span style={{
          fontSize: 11, color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        }}>
          {right}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
        {sub}
      </div>
      <div style={{
        height: 4,
        borderRadius: 999,
        background: 'var(--border-subtle)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
          background: barColor,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}
