'use client';
import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getInitials } from '@/lib/preferences';
import { clearLocalUserData } from '@/lib/clearLocalUserData';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  email: string;
  displayName?: string;
  avatarUrl?: string | null;
  isVip?: boolean;
}

const VIP_RING: React.CSSProperties = {
  position: 'absolute', top: -2, left: -2,
  width: 38, height: 38, borderRadius: '50%',
  background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700, #FFA500)',
  backgroundSize: '200% 200%',
  animation: 'vip-shimmer 2.5s ease-in-out infinite',
  pointerEvents: 'none', zIndex: 0,
};

const VIP_BADGE: React.CSSProperties = {
  position: 'absolute', bottom: -3, right: -3, zIndex: 2,
  background: '#FFD700', color: '#000', fontWeight: 800,
  fontSize: 7, padding: '1.5px 3.5px', borderRadius: 3,
  lineHeight: 1.3, letterSpacing: '0.03em',
  boxShadow: '0 1px 2px rgba(0,0,0,0.25)', pointerEvents: 'none',
};

export default function AvatarDropdown({ email, displayName, avatarUrl, isVip }: Props) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const initials = getInitials(displayName || email);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    await clearLocalUserData();
    // Use replace (not assign) so the protected page is dropped from history —
    // pressing back after logout must not reveal the cached view.
    window.location.replace('/login');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* ── Avatar button ── */}
      <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
        {isVip && <div style={VIP_RING} />}
        <button
          onClick={() => setOpen((o) => !o)}
          title={displayName || email}
          aria-label="Account menu"
          style={{
            position: 'relative', zIndex: 1,
            width: 34, height: 34, borderRadius: '50%',
            background: avatarUrl ? 'transparent' : (open ? 'var(--accent-hover)' : 'var(--accent)'),
            border: isVip ? '2px solid transparent' : (open ? '2px solid var(--accent-hover)' : '2px solid transparent'),
            color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, box-shadow 0.15s',
            boxShadow: open && !isVip ? '0 0 0 3px var(--accent-muted)' : 'none',
            flexShrink: 0, overflow: 'hidden', padding: 0,
          }}
          onMouseOver={(e) => { if (!isVip) e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-muted)'; }}
          onMouseOut={(e) => { if (!open && !isVip) e.currentTarget.style.boxShadow = 'none'; }}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName || email} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : initials}
        </button>
        {isVip && <span style={VIP_BADGE}>VIP</span>}
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            ...(lang === 'ar' ? { left: 0 } : { right: 0 }),
            width: 200,
            transformOrigin: lang === 'ar' ? 'top left' : 'top right',
            background: 'var(--bg-float)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--bg-float-border)',
            boxShadow: 'var(--shadow-float)',
            borderRadius: 4,
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* User info */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                {isVip && <div style={{ ...VIP_RING, width: 36, height: 36, top: -2, left: -2 }} />}
                <div style={{
                  position: 'relative', zIndex: 1,
                  width: 32, height: 32, borderRadius: '50%',
                  background: avatarUrl ? 'transparent' : 'var(--accent)', color: '#fff',
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={displayName || email} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials}
                </div>
                {isVip && <span style={{ ...VIP_BADGE, fontSize: 6.5 }}>VIP</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                {displayName && (
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: '6px' }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 4,
                fontSize: 13, fontWeight: 500, color: '#ef4444',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <LogOut size={13} style={{ flexShrink: 0 }} />
              {t('avatar_logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
