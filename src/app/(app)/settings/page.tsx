'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { User, Palette, Layout, Bell, Database, ChevronLeft, BookOpen, Shield, Gift } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { loadUserPreferences, getProfile } from '@/lib/supabase/db';
import { applyPreferences } from '@/lib/preferences';
import { AccountSection } from '@/features/settings/AccountSection';
import { AppearanceSection } from '@/features/settings/AppearanceSection';
import { StudySection } from '@/features/settings/StudySection';
import { PrivacySection } from '@/features/settings/PrivacySection';
import { WorkspaceSection } from '@/features/settings/WorkspaceSection';
import { NotificationsSection } from '@/features/settings/NotificationsSection';
import { ReferralSection } from '@/features/settings/ReferralSection';
import { DataSection } from '@/features/settings/DataSection';

const NAV = [
  { id: 'account',       tKey: 'set_nav_account',       Icon: User },
  { id: 'appearance',    tKey: 'set_nav_appearance',    Icon: Palette },
  { id: 'workspace',     tKey: 'set_nav_workspace',     Icon: Layout },
  { id: 'study',         tKey: 'set_nav_study',         Icon: BookOpen },
  { id: 'privacy',       tKey: 'set_nav_privacy',       Icon: Shield },
  { id: 'notifications', tKey: 'set_nav_notifications', Icon: Bell },
  { id: 'data',          tKey: 'set_nav_data',          Icon: Database },
  { id: 'referral',      tKey: 'set_nav_referral',      Icon: Gift },
] as const;

type Section = typeof NAV[number]['id'];

export default function SettingsPage() {
  useAuthGuard();
  const { t } = useLanguage();
  const [active, setActive] = useState<Section>('account');
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileHandle, setProfileHandle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return; }
      setUserEmail(user.email ?? '');
      const profile = await getProfile();
      setDisplayName(profile?.username ?? user.email?.split('@')[0] ?? '');
      setProfileHandle(profile?.handle ?? '');
      setAvatarUrl(profile?.avatarUrl ?? null);
      setAuthReady(true);
    });
  }, [router, sb]);

  // Apply all appearance prefs from Supabase on mount
  useEffect(() => {
    loadUserPreferences().then((prefs) => {
      if (!prefs) return;
      applyPreferences({
        theme:        (prefs.theme as 'dark' | 'light') ?? undefined,
        fontSize:     (prefs.font_size as 'small' | 'medium' | 'large') ?? undefined,
        accentColor:  prefs.accent_color ?? undefined,
        bgColor:      prefs.bg_color,
        sidebarColor: prefs.sidebar_color,
        fontFamily:   (prefs.font_family as 'default' | 'serif' | 'mono') ?? undefined,
      });
    });
  }, []);

  if (!authReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg-app)' }}>
        <span className="spinner" style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', display: 'block' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit' }}>
      {/* ── Top bar ── */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14,
        background: 'var(--bg-panel)',
      }}>
        <a
          href="/workspace"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)',
            textDecoration: 'none', transition: 'color 0.13s',
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-3)'; }}
        >
          <ChevronLeft size={14} />
          {t('set_back')}
        </a>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          {t('set_title')}
        </span>
      </div>

      <div style={{ display: 'flex', height: 'calc(100dvh - 52px)' }}>
        {/* ── Sidebar ── */}
        <nav style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          padding: '20px 12px',
          display: 'flex', flexDirection: 'column', gap: 2,
          background: 'var(--bg-panel)',
          overflowY: 'auto',
        }}>
          {NAV.map(({ id, tKey, Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              style={{
                width: '100%', height: 34,
                display: 'flex', alignItems: 'center', gap: 9,
                borderRadius: 4, padding: '0 10px',
                background: active === id ? 'var(--bg-active)' : 'transparent',
                border: `1px solid ${active === id ? 'var(--border-strong)' : 'transparent'}`,
                color: active === id ? 'var(--text-1)' : 'var(--text-2)',
                fontSize: 13, fontWeight: active === id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'background 0.13s, color 0.13s',
              }}
              onMouseOver={(e) => { if (active !== id) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' }); }}
              onMouseOut={(e) => { if (active !== id) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' }); }}
            >
              <Icon size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
              {t(tKey)}
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <main style={{
          flex: 1, overflowY: 'auto',
          padding: '36px 48px',
          maxWidth: 640,
        }}>
          {active === 'account'       && <AccountSection
            userEmail={userEmail}
            displayName={displayName}
            profileHandle={profileHandle}
            avatarUrl={avatarUrl}
            onDisplayNameChange={setDisplayName}
            onHandleChange={setProfileHandle}
            onAvatarChange={setAvatarUrl}
          />}
          {active === 'appearance'    && <AppearanceSection />}
          {active === 'workspace'     && <WorkspaceSection />}
          {active === 'study'         && <StudySection />}
          {active === 'privacy'       && <PrivacySection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'data'          && <DataSection />}
          {active === 'referral'      && <ReferralSection />}
        </main>
      </div>
    </div>
  );
}
