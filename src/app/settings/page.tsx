'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Palette, Layout, Bell, Database,
  ChevronLeft, Sun, Moon, Check, Trash2, Download,
  Eye, EyeOff, AlertTriangle, LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import {
  getUserStorageStats,
  deleteAllVoiceNotesForUser,
  deleteAllDrawingsForUser,
  exportAllUserData,
  deleteUserAccount,
} from '@/lib/supabase/db';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT_MAP: Record<string, { label: string; base: string; hover: string; muted: string }> = {
  Blue:   { label: 'Blue',   base: '#2563eb', hover: '#3b82f6', muted: 'rgba(37,99,235,0.14)' },
  Purple: { label: 'Purple', base: '#7c3aed', hover: '#8b5cf6', muted: 'rgba(124,58,237,0.14)' },
  Green:  { label: 'Green',  base: '#059669', hover: '#10b981', muted: 'rgba(5,150,105,0.14)' },
  Orange: { label: 'Orange', base: '#d97706', hover: '#f59e0b', muted: 'rgba(217,119,6,0.14)' },
  Pink:   { label: 'Pink',   base: '#db2777', hover: '#ec4899', muted: 'rgba(219,39,119,0.14)' },
};

const NAV = [
  { id: 'account',    label: 'Account',        Icon: User },
  { id: 'appearance', label: 'Appearance',      Icon: Palette },
  { id: 'workspace',  label: 'Workspace',       Icon: Layout },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'data',       label: 'Data & Storage',  Icon: Database },
] as const;

type Section = typeof NAV[number]['id'];

// ─────────────────────────────────────────────────────────────────────────────
// Small shared UI pieces
// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '24px 0' }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
      {children}
    </h2>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function AppInput({
  value, onChange, type = 'text', placeholder, disabled, onMouseOver, onMouseOut,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  onMouseOver?: React.MouseEventHandler<HTMLInputElement>;
  onMouseOut?: React.MouseEventHandler<HTMLInputElement>;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="app-input"
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      style={{
        width: '100%', height: 38, padding: '0 12px',
        borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--bg-elevated)', color: 'var(--text-1)',
        fontSize: 13, fontFamily: 'inherit',
        boxSizing: 'border-box',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : undefined,
      }}
    />
  );
}

function PrimaryBtn({
  children, onClick, disabled, loading,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        height: 36, padding: '0 16px',
        background: disabled || loading ? 'var(--bg-elevated)' : 'var(--accent)',
        color: disabled || loading ? 'var(--text-3)' : '#fff',
        border: disabled || loading ? '1px solid var(--border)' : 'none',
        borderRadius: 8, fontSize: 12.5, fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 0.13s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
      onMouseOver={(e) => { if (!disabled && !loading) e.currentTarget.style.background = 'var(--accent-hover)'; }}
      onMouseOut={(e) => { if (!disabled && !loading) e.currentTarget.style.background = 'var(--accent)'; }}
    >
      {loading && (
        <span style={{
          width: 12, height: 12, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  );
}

function GhostBtn({
  children, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 36, padding: '0 16px',
        background: 'var(--bg-elevated)',
        color: danger ? '#ef4444' : 'var(--text-2)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
        borderRadius: 8, fontSize: 12.5, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 0.13s, color 0.13s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseOver={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)';
          e.currentTarget.style.color = danger ? '#ef4444' : 'var(--text-1)';
        }
      }}
      onMouseOut={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--bg-elevated)';
          e.currentTarget.style.color = danger ? '#ef4444' : 'var(--text-2)';
        }
      }}
    >
      {children}
    </button>
  );
}

function StatusMsg({ type, children }: { type: 'ok' | 'err'; children: React.ReactNode }) {
  return (
    <p style={{
      margin: '8px 0 0', fontSize: 12,
      color: type === 'ok' ? '#22c55e' : '#ef4444',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {type === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />}
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Password field with show/hide toggle
// ─────────────────────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="app-input"
        style={{
          width: '100%', height: 38, padding: '0 38px 0 12px',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-elevated)', color: 'var(--text-1)',
          fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: 'var(--text-3)',
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
        }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle switch
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-checked={on}
      role="switch"
      style={{
        width: 40, height: 22, borderRadius: 11, padding: 2,
        background: on ? 'var(--accent)' : 'var(--border-strong)',
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        display: 'block', width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transform: on ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Option chips (two-up layout)
// ─────────────────────────────────────────────────────────────────────────────

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 6 }}>{children}</div>;
}

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 8,
        background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
        border: `1.5px solid ${active ? 'rgba(37,99,235,0.35)' : 'var(--border)'}`,
        color: active ? 'var(--accent-hover)' : 'var(--text-2)',
        fontSize: 12, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' }); }}
      onMouseOut={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' }); }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row layout for settings entries (label + control side by side)
// ─────────────────────────────────────────────────────────────────────────────

function SettingRow({ label, sub, children }: {
  label: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{label}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>{sub}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Danger confirmation modal
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, loading }: {
  title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h3>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{body}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <GhostBtn onClick={onCancel} disabled={loading}>Cancel</GhostBtn>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              height: 36, padding: '0 16px',
              background: '#ef4444', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Account
// ─────────────────────────────────────────────────────────────────────────────

function AccountSection({ userEmail, displayName }: { userEmail: string; displayName: string }) {
  const sb = createClient();

  const [name, setName] = useState(displayName);
  const [nameSt, setNameSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [nameErr, setNameErr] = useState('');

  const [email, setEmail] = useState(userEmail);
  const [emailSt, setEmailSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [emailErr, setEmailErr] = useState('');

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [cfmPwd, setCfmPwd] = useState('');
  const [pwdSt, setPwdSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [pwdErr, setPwdErr] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [delLoading, setDelLoading] = useState(false);
  const router = useRouter();

  const saveName = useCallback(async () => {
    setNameSt('loading');
    const { error } = await sb.auth.updateUser({ data: { display_name: name.trim() } });
    if (error) { setNameErr(error.message); setNameSt('err'); }
    else { setNameSt('ok'); setTimeout(() => setNameSt('idle'), 3000); }
  }, [name, sb]);

  const saveEmail = useCallback(async () => {
    setEmailSt('loading');
    const { error } = await sb.auth.updateUser({ email: email.trim() });
    if (error) { setEmailErr(error.message); setEmailSt('err'); }
    else { setEmailSt('ok'); setTimeout(() => setEmailSt('idle'), 3000); }
  }, [email, sb]);

  const savePassword = useCallback(async () => {
    if (newPwd !== cfmPwd) { setPwdErr("Passwords don't match"); setPwdSt('err'); return; }
    if (newPwd.length < 8) { setPwdErr('Password must be at least 8 characters'); setPwdSt('err'); return; }
    setPwdSt('loading');
    const { error } = await sb.auth.signInWithPassword({ email: userEmail, password: curPwd });
    if (error) { setPwdErr('Current password is incorrect'); setPwdSt('err'); return; }
    const { error: updErr } = await sb.auth.updateUser({ password: newPwd });
    if (updErr) { setPwdErr(updErr.message); setPwdSt('err'); }
    else {
      setPwdSt('ok'); setCurPwd(''); setNewPwd(''); setCfmPwd('');
      setTimeout(() => setPwdSt('idle'), 3000);
    }
  }, [curPwd, newPwd, cfmPwd, userEmail, sb]);

  const handleDelete = useCallback(async () => {
    setDelLoading(true);
    const { error } = await deleteUserAccount();
    if (error) { setDelLoading(false); alert('Failed to delete account: ' + error); return; }
    await sb.auth.signOut();
    router.push('/login');
  }, [router, sb]);

  return (
    <div>
      <SectionTitle>Account</SectionTitle>

      {/* Display Name */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Display name</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <AppInput value={name} onChange={setName} placeholder="Your name" />
          <PrimaryBtn onClick={saveName} loading={nameSt === 'loading'} disabled={name.trim() === displayName}>
            Save
          </PrimaryBtn>
        </div>
        {nameSt === 'ok' && <StatusMsg type="ok">Name updated</StatusMsg>}
        {nameSt === 'err' && <StatusMsg type="err">{nameErr}</StatusMsg>}
      </div>

      <Divider />

      {/* Email */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Email address</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <AppInput value={email} onChange={setEmail} type="email" placeholder="your@email.com" />
          <PrimaryBtn onClick={saveEmail} loading={emailSt === 'loading'} disabled={email.trim() === userEmail}>
            Save
          </PrimaryBtn>
        </div>
        {emailSt === 'ok' && <StatusMsg type="ok">Confirmation sent to new address</StatusMsg>}
        {emailSt === 'err' && <StatusMsg type="err">{emailErr}</StatusMsg>}
      </div>

      <Divider />

      {/* Password */}
      <div>
        <FieldLabel>Change password</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
          <PasswordInput value={curPwd} onChange={setCurPwd} placeholder="Current password" />
          <PasswordInput value={newPwd} onChange={setNewPwd} placeholder="New password (min 8 chars)" />
          <div>
            <div style={{ border: `1px solid ${cfmPwd && cfmPwd !== newPwd ? '#ef4444' : 'var(--border)'}`, borderRadius: 8 }}>
              <PasswordInput value={cfmPwd} onChange={setCfmPwd} placeholder="Confirm new password" />
            </div>
            {cfmPwd && cfmPwd !== newPwd && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#ef4444' }}>Passwords don't match</p>
            )}
          </div>
          <PrimaryBtn
            onClick={savePassword}
            loading={pwdSt === 'loading'}
            disabled={!curPwd || !newPwd || !cfmPwd || newPwd !== cfmPwd}
          >
            Update password
          </PrimaryBtn>
          {pwdSt === 'ok' && <StatusMsg type="ok">Password updated</StatusMsg>}
          {pwdSt === 'err' && <StatusMsg type="err">{pwdErr}</StatusMsg>}
        </div>
      </div>

      <Divider />

      {/* Sign out */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Session</FieldLabel>
        <GhostBtn
          onClick={async () => {
            await sb.auth.signOut();
            router.push('/login');
          }}
        >
          <LogOut size={13} />
          Sign out
        </GhostBtn>
        <SubLabel>You'll be redirected to the login page.</SubLabel>
      </div>

      <Divider />

      {/* Delete account */}
      <div>
        <FieldLabel>Danger zone</FieldLabel>
        <GhostBtn danger onClick={() => setDeleteConfirm(true)}>
          <Trash2 size={13} />
          Delete account
        </GhostBtn>
        <SubLabel>Permanently deletes your account and all associated data.</SubLabel>
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete your account?"
          body="This will permanently delete your account, all documents, voice notes, drawings, and annotations. This action cannot be undone."
          confirmLabel="Delete my account"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(false)}
          loading={delLoading}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Appearance
// ─────────────────────────────────────────────────────────────────────────────

function AppearanceSection() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return document.documentElement.getAttribute('data-theme') !== 'light';
  });

  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>(() =>
    (storageGet<string>(KEYS.FONT_SIZE) as 'small' | 'medium' | 'large') ?? 'medium'
  );

  const [accent, setAccent] = useState<string>(() =>
    storageGet<string>(KEYS.ACCENT_COLOR) ?? 'Blue'
  );

  const applyTheme = useCallback((dark: boolean) => {
    const r = document.documentElement;
    if (dark) r.removeAttribute('data-theme');
    else r.setAttribute('data-theme', 'light');
    storageSet(KEYS.THEME, dark ? 'dark' : 'light');
    setIsDark(dark);
  }, []);

  const applyFontSize = useCallback((size: 'small' | 'medium' | 'large') => {
    if (size === 'small') document.body.style.fontSize = '11px';
    else if (size === 'large') document.body.style.fontSize = '16px';
    else document.body.style.fontSize = '';
    storageSet(KEYS.FONT_SIZE, size);
    setFontSize(size);
  }, []);

  const applyAccent = useCallback((color: string) => {
    const c = ACCENT_MAP[color];
    if (!c) return;
    const r = document.documentElement;
    r.style.setProperty('--accent', c.base);
    r.style.setProperty('--accent-hover', c.hover);
    r.style.setProperty('--accent-muted', c.muted);
    r.style.setProperty('--violet', c.base);
    r.style.setProperty('--violet-muted', c.muted);
    storageSet(KEYS.ACCENT_COLOR, color);
    setAccent(color);
  }, []);

  return (
    <div>
      <SectionTitle>Appearance</SectionTitle>

      {/* Theme */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Theme</FieldLabel>
        <ChipRow>
          <Chip active={!isDark} onClick={() => applyTheme(false)}>
            <Sun size={13} /> Light
          </Chip>
          <Chip active={isDark} onClick={() => applyTheme(true)}>
            <Moon size={13} /> Dark
          </Chip>
        </ChipRow>
      </div>

      {/* Font size */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Font size</FieldLabel>
        <ChipRow>
          {(['small', 'medium', 'large'] as const).map((s) => (
            <Chip key={s} active={fontSize === s} onClick={() => applyFontSize(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </ChipRow>
        <SubLabel>Adjusts text size across the app where possible.</SubLabel>
      </div>

      {/* Accent color */}
      <div>
        <FieldLabel>Accent color</FieldLabel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(ACCENT_MAP).map(([key, c]) => (
            <button
              key={key}
              title={c.label}
              onClick={() => applyAccent(key)}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: c.base, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: accent === key ? `0 0 0 3px var(--bg-app), 0 0 0 5px ${c.base}` : 'none',
                transition: 'box-shadow 0.15s',
              }}
            >
              {accent === key && <Check size={14} color="#fff" strokeWidth={3} />}
            </button>
          ))}
        </div>
        <SubLabel>Changes button and highlight colors throughout the app.</SubLabel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Workspace
// ─────────────────────────────────────────────────────────────────────────────

function WorkspaceSection() {
  const [bgTheme, setBgTheme] = useState<'white' | 'dark'>(() =>
    (storageGet<'white' | 'dark'>(KEYS.DEFAULT_BG)) ?? 'dark'
  );

  const [defaultZoom, setDefaultZoom] = useState<number>(() =>
    storageGet<number>(KEYS.DEFAULT_ZOOM) ?? 100
  );

  const [viewMode, setViewMode] = useState<'page' | 'scroll'>(() =>
    (storageGet<'page' | 'scroll'>(KEYS.VIEW_MODE)) ?? 'page'
  );

  const handleZoom = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(300, Math.max(25, n));
    setDefaultZoom(clamped);
    storageSet(KEYS.DEFAULT_ZOOM, clamped);
  }, []);

  return (
    <div>
      <SectionTitle>Workspace</SectionTitle>

      {/* Default blank page */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Default blank page style</FieldLabel>
        <ChipRow>
          <Chip active={bgTheme === 'white'} onClick={() => { setBgTheme('white'); storageSet(KEYS.DEFAULT_BG, 'white'); }}>
            <span style={{ width: 14, height: 11, borderRadius: 2, background: '#ffffff', border: '1px solid rgba(0,0,0,0.18)', flexShrink: 0 }} />
            White dots
          </Chip>
          <Chip active={bgTheme === 'dark'} onClick={() => { setBgTheme('dark'); storageSet(KEYS.DEFAULT_BG, 'dark'); }}>
            <span style={{ width: 14, height: 11, borderRadius: 2, background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }} />
            Dark dots
          </Chip>
        </ChipRow>
        <SubLabel>Used when a blank page is added in the workspace.</SubLabel>
      </div>

      {/* Default view mode */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Default view mode</FieldLabel>
        <ChipRow>
          <Chip active={viewMode === 'page'} onClick={() => { setViewMode('page'); storageSet(KEYS.VIEW_MODE, 'page'); }}>
            Page by page
          </Chip>
          <Chip active={viewMode === 'scroll'} onClick={() => { setViewMode('scroll'); storageSet(KEYS.VIEW_MODE, 'scroll'); }}>
            Scroll
          </Chip>
        </ChipRow>
        <SubLabel>Applied when you open a new document.</SubLabel>
      </div>

      {/* Default zoom */}
      <div>
        <FieldLabel>Default zoom level</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="range" min={25} max={200} step={5}
            value={defaultZoom}
            onChange={(e) => handleZoom(e.target.value)}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{
            minWidth: 42, fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
            fontVariantNumeric: 'tabular-nums', textAlign: 'right',
          }}>
            {defaultZoom}%
          </span>
        </div>
        <SubLabel>The zoom level used when you first open a document.</SubLabel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Notifications
// ─────────────────────────────────────────────────────────────────────────────

function NotificationsSection() {
  const [roomJoin, setRoomJoin] = useState(() =>
    storageGet<boolean>(KEYS.NOTIF_ROOM_JOIN) ?? true
  );

  const toggle = () => {
    const next = !roomJoin;
    setRoomJoin(next);
    storageSet(KEYS.NOTIF_ROOM_JOIN, next);
  };

  return (
    <div>
      <SectionTitle>Notifications</SectionTitle>
      <SettingRow
        label="Study room member joined"
        sub="Show a notification when someone joins your study room."
      >
        <Toggle on={roomJoin} onToggle={toggle} />
      </SettingRow>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Data & Storage
// ─────────────────────────────────────────────────────────────────────────────

function DataSection() {
  const [stats, setStats] = useState<{ documents: number; voiceNotes: number; drawings: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [clearDrawState, setClearDrawState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [clearNotesState, setClearNotesState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    getUserStorageStats().then((s) => { setStats(s); setStatsLoading(false); });
  }, []);

  const refreshStats = useCallback(() => {
    setStatsLoading(true);
    getUserStorageStats().then((s) => { setStats(s); setStatsLoading(false); });
  }, []);

  const doClearDrawings = useCallback(async () => {
    setClearDrawState('loading');
    await deleteAllDrawingsForUser();
    setClearDrawState('idle');
    refreshStats();
  }, [refreshStats]);

  const doClearNotes = useCallback(async () => {
    setClearNotesState('loading');
    await deleteAllVoiceNotesForUser();
    setClearNotesState('idle');
    refreshStats();
  }, [refreshStats]);

  const doExport = useCallback(async () => {
    setExportLoading(true);
    const data = await exportAllUserData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studysync-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportLoading(false);
  }, []);

  return (
    <div>
      <SectionTitle>Data & Storage</SectionTitle>

      {/* Usage stats */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Usage overview</FieldLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {([
            { label: 'Documents', key: 'documents' },
            { label: 'Voice notes', key: 'voiceNotes' },
            { label: 'Drawings', key: 'drawings' },
          ] as const).map(({ label, key }) => (
            <div key={key} style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {statsLoading ? '—' : stats?.[key] ?? 0}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* Clear drawings */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Drawings</FieldLabel>
        <GhostBtn danger onClick={() => setClearDrawState('confirm')} disabled={clearDrawState === 'loading'}>
          <Trash2 size={13} />
          Clear all drawings
        </GhostBtn>
        <SubLabel>Removes all annotation drawings across every document.</SubLabel>
      </div>

      {/* Clear voice notes */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Voice notes</FieldLabel>
        <GhostBtn danger onClick={() => setClearNotesState('confirm')} disabled={clearNotesState === 'loading'}>
          <Trash2 size={13} />
          Delete all voice notes
        </GhostBtn>
        <SubLabel>Permanently deletes all your recorded voice notes.</SubLabel>
      </div>

      <Divider />

      {/* Export */}
      <div>
        <FieldLabel>Export data</FieldLabel>
        <GhostBtn onClick={doExport} disabled={exportLoading}>
          <Download size={13} />
          {exportLoading ? 'Exporting…' : 'Export as JSON'}
        </GhostBtn>
        <SubLabel>Downloads all your documents, notes, bookmarks, and key terms as a JSON file.</SubLabel>
      </div>

      {/* Confirm modals */}
      {(clearDrawState === 'confirm' || clearDrawState === 'loading') && (
        <ConfirmModal
          title="Clear all drawings?"
          body="This will permanently delete every annotation drawing across all your documents. This cannot be undone."
          confirmLabel="Clear drawings"
          onConfirm={doClearDrawings}
          onCancel={() => setClearDrawState('idle')}
          loading={clearDrawState === 'loading'}
        />
      )}
      {(clearNotesState === 'confirm' || clearNotesState === 'loading') && (
        <ConfirmModal
          title="Delete all voice notes?"
          body="This will permanently delete all your recorded voice notes. This cannot be undone."
          confirmLabel="Delete voice notes"
          onConfirm={doClearNotes}
          onCancel={() => setClearNotesState('idle')}
          loading={clearNotesState === 'loading'}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('account');
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();
  const sb = createClient();

  useEffect(() => {
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      setUserEmail(user.email ?? '');
      setDisplayName(user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? '');
      setAuthReady(true);
    });
  }, [router, sb]);

  // Apply accent + font size on mount (same as workspace page)
  useEffect(() => {
    const ac = storageGet<string>(KEYS.ACCENT_COLOR);
    if (ac && ACCENT_MAP[ac]) {
      const c = ACCENT_MAP[ac];
      const r = document.documentElement;
      r.style.setProperty('--accent', c.base);
      r.style.setProperty('--accent-hover', c.hover);
      r.style.setProperty('--accent-muted', c.muted);
      r.style.setProperty('--violet', c.base);
      r.style.setProperty('--violet-muted', c.muted);
    }
    const fs = storageGet<string>(KEYS.FONT_SIZE);
    if (fs === 'small') document.body.style.fontSize = '11px';
    else if (fs === 'large') document.body.style.fontSize = '16px';
    else document.body.style.fontSize = '';
  }, []);

  if (!authReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg-app)' }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite', display: 'block' }} />
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
          Back
        </a>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          Settings
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
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              style={{
                width: '100%', height: 34,
                display: 'flex', alignItems: 'center', gap: 9,
                borderRadius: 7, padding: '0 10px',
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
              {label}
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <main style={{
          flex: 1, overflowY: 'auto',
          padding: '36px 48px',
          maxWidth: 640,
        }}>
          {active === 'account'       && <AccountSection userEmail={userEmail} displayName={displayName} />}
          {active === 'appearance'    && <AppearanceSection />}
          {active === 'workspace'     && <WorkspaceSection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'data'          && <DataSection />}
        </main>
      </div>
    </div>
  );
}
