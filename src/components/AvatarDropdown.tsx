'use client';
import { useEffect, useRef, useState } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getInitials } from '@/lib/preferences';

interface Props {
  email: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export default function AvatarDropdown({ email, displayName, avatarUrl }: Props) {
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
    window.location.href = '/login';
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* ── Avatar button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={displayName || email}
        aria-label="Account menu"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: avatarUrl ? 'transparent' : (open ? 'var(--accent-hover)' : 'var(--accent)'),
          border: open ? '2px solid var(--accent-hover)' : '2px solid transparent',
          color: '#fff',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s, box-shadow 0.15s',
          boxShadow: open ? '0 0 0 3px var(--accent-muted)' : 'none',
          flexShrink: 0, overflow: 'hidden', padding: 0,
        }}
        onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-muted)'; }}
        onMouseOut={(e) => { if (!open) e.currentTarget.style.boxShadow = 'none'; }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={displayName || email} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          : initials}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 200,
            transformOrigin: 'top right',
            background: 'var(--bg-panel)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.04)',
            zIndex: 300,
            overflow: 'hidden',
          }}
        >
          {/* User info */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: avatarUrl ? 'transparent' : 'var(--accent)', color: '#fff',
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
              }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt={displayName || email} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
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
            <a
              href="/settings"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 7,
                fontSize: 13, fontWeight: 500, color: 'var(--text-2)',
                textDecoration: 'none', cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
              onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' })}
            >
              <Settings size={13} style={{ flexShrink: 0 }} />
              Settings
            </a>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 7,
                fontSize: 13, fontWeight: 500, color: '#ef4444',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <LogOut size={13} style={{ flexShrink: 0 }} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
