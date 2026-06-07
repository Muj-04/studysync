'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Palette, Layout, Bell, Database,
  ChevronLeft, Sun, Moon, Check, Trash2, Download,
  Eye, EyeOff, AlertTriangle, LogOut, RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import {
  getUserStorageStats,
  deleteAllVoiceNotesForUser,
  deleteAllDrawingsForUser,
  exportAllUserData,
  deleteUserAccount,
  loadUserPreferences,
  saveUserPreferences,
  getProfile,
  upsertProfile,
  uploadAvatar,
} from '@/lib/supabase/db';
import { applyPreferences, ACCENT_PRESETS, FONT_STACKS } from '@/lib/preferences';

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

function AccountSection({ userEmail, displayName, avatarUrl, onAvatarChange }: {
  userEmail: string;
  displayName: string;
  avatarUrl?: string | null;
  onAvatarChange?: (url: string) => void;
}) {
  const sb = createClient();

  const [name, setName] = useState(displayName);
  const [nameSt, setNameSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [nameErr, setNameErr] = useState('');

  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(avatarUrl ?? null);
  const [uploadSt, setUploadSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadSt('loading');
    const url = await uploadAvatar(file);
    if (url) {
      await upsertProfile({ avatarUrl: url });
      setLocalAvatarUrl(url);
      onAvatarChange?.(url);
      setUploadSt('ok');
      setTimeout(() => setUploadSt('idle'), 3000);
    } else {
      setUploadSt('err');
      setTimeout(() => setUploadSt('idle'), 3000);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onAvatarChange]);

  const saveName = useCallback(async () => {
    setNameSt('loading');
    try {
      await upsertProfile({ username: name.trim() });
      setNameSt('ok');
      setTimeout(() => setNameSt('idle'), 3000);
    } catch (e) {
      setNameErr(String(e));
      setNameSt('err');
    }
  }, [name]);

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

      {/* Profile picture */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Profile picture</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: localAvatarUrl ? 'transparent' : 'var(--accent)',
            color: '#fff', fontSize: 18, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, overflow: 'hidden', border: '2px solid var(--border)',
          }}>
            {localAvatarUrl
              ? <img src={localAvatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (displayName?.[0]?.toUpperCase() ?? userEmail[0]?.toUpperCase())}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
            <PrimaryBtn onClick={() => fileInputRef.current?.click()} loading={uploadSt === 'loading'}>
              {uploadSt === 'loading' ? 'Uploading…' : 'Upload photo'}
            </PrimaryBtn>
            {uploadSt === 'ok' && <StatusMsg type="ok">Photo updated</StatusMsg>}
            {uploadSt === 'err' && <StatusMsg type="err">Upload failed — try again</StatusMsg>}
            <SubLabel>JPG, PNG, WebP, or GIF · Max 5 MB</SubLabel>
          </div>
        </div>
      </div>

      <Divider />

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

// ── Inline color picker swatch ────────────────────────────────────────────────

function ColorPickerField({ label, value, onChange, onReset, sub }: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onReset: () => void;
  sub?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginBottom: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Swatch / trigger */}
        <button
          onClick={() => inputRef.current?.click()}
          title="Pick color"
          style={{
            width: 38, height: 38, borderRadius: 9,
            background: value,
            border: '2px solid var(--border-strong)',
            cursor: 'pointer', flexShrink: 0,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
            transition: 'box-shadow 0.15s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.15), 0 0 0 3px var(--accent-muted)'; }}
          onMouseOut={(e)  => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.15)'; }}
        />
        {/* Hidden native color input */}
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          tabIndex={-1}
        />
        {/* Hex text */}
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-2)', letterSpacing: '0.04em' }}>
          {value.toUpperCase()}
        </span>
        {/* Reset */}
        <button
          onClick={onReset}
          title="Reset to default"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 7,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'color 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-1)', background: 'var(--bg-hover)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'var(--bg-elevated)' })}
        >
          <RotateCcw size={10} />
          Reset
        </button>
      </div>
      {sub && <SubLabel>{sub}</SubLabel>}
    </div>
  );
}

function AppearanceSection() {
  const [loading, setLoading] = useState(true);

  const [isDark, setIsDark] = useState(true);
  const [fontSize, setFontSize]     = useState<'small' | 'medium' | 'large'>('medium');
  const [fontFamily, setFontFamily] = useState<'default' | 'serif' | 'mono'>('default');
  const [accent, setAccent]         = useState<string>('Blue');
  const [customAccent, setCustomAccent] = useState('#2563eb');
  const [bgColor, setBgColor]       = useState('#000000');
  const [sidebarColor, setSidebarColor] = useState('#0a0a0a');

  // Defaults depend on theme
  const defaultBg      = isDark ? '#000000' : '#f5f5f5';
  const defaultSidebar = isDark ? '#0a0a0a' : '#ffffff';

  // Load from Supabase on mount
  useEffect(() => {
    loadUserPreferences().then((prefs) => {
      const dark = (prefs?.theme ?? storageGet<string>(KEYS.THEME) ?? 'dark') !== 'light';
      setIsDark(dark);
      setFontSize((prefs?.font_size ?? storageGet<string>(KEYS.FONT_SIZE) ?? 'medium') as 'small' | 'medium' | 'large');
      setFontFamily((prefs?.font_family ?? storageGet<string>(KEYS.FONT_FAMILY) ?? 'default') as 'default' | 'serif' | 'mono');
      const ac = prefs?.accent_color ?? storageGet<string>(KEYS.ACCENT_COLOR) ?? 'Blue';
      setAccent(ac);
      if (ac.startsWith('#')) setCustomAccent(ac);
      setBgColor(prefs?.bg_color ?? storageGet<string>(KEYS.BG_COLOR) ?? (dark ? '#000000' : '#f5f5f5'));
      setSidebarColor(prefs?.sidebar_color ?? storageGet<string>(KEYS.SIDEBAR_COLOR) ?? (dark ? '#0a0a0a' : '#ffffff'));
      setLoading(false);
    });
  }, []);

  const save = useCallback((partial: Parameters<typeof saveUserPreferences>[0]) => {
    saveUserPreferences(partial);
  }, []);

  const handleTheme = useCallback((dark: boolean) => {
    setIsDark(dark);
    storageSet(KEYS.THEME, dark ? 'dark' : 'light');
    applyPreferences({ theme: dark ? 'dark' : 'light' });
    save({ theme: dark ? 'dark' : 'light' });
  }, [save]);

  const handleFontSize = useCallback((size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
    storageSet(KEYS.FONT_SIZE, size);
    applyPreferences({ fontSize: size });
    save({ font_size: size });
  }, [save]);

  const handleFontFamily = useCallback((ff: 'default' | 'serif' | 'mono') => {
    setFontFamily(ff);
    storageSet(KEYS.FONT_FAMILY, ff);
    applyPreferences({ fontFamily: ff });
    save({ font_family: ff });
  }, [save]);

  const handleAccentPreset = useCallback((key: string) => {
    setAccent(key);
    storageSet(KEYS.ACCENT_COLOR, key);
    applyPreferences({ accentColor: key });
    save({ accent_color: key });
  }, [save]);

  const handleCustomAccent = useCallback((hex: string) => {
    setCustomAccent(hex);
    setAccent(hex);
    storageSet(KEYS.ACCENT_COLOR, hex);
    applyPreferences({ accentColor: hex });
    save({ accent_color: hex });
  }, [save]);

  const handleBgColor = useCallback((hex: string) => {
    setBgColor(hex);
    storageSet(KEYS.BG_COLOR, hex);
    applyPreferences({ bgColor: hex });
    save({ bg_color: hex });
  }, [save]);

  const handleBgReset = useCallback(() => {
    setBgColor(defaultBg);
    storageSet(KEYS.BG_COLOR, null);
    document.documentElement.style.removeProperty('--bg-app');
    save({ bg_color: null });
  }, [defaultBg, save]);

  const handleSidebarColor = useCallback((hex: string) => {
    setSidebarColor(hex);
    storageSet(KEYS.SIDEBAR_COLOR, hex);
    applyPreferences({ sidebarColor: hex });
    save({ sidebar_color: hex });
  }, [save]);

  const handleSidebarReset = useCallback(() => {
    setSidebarColor(defaultSidebar);
    storageSet(KEYS.SIDEBAR_COLOR, null);
    document.documentElement.style.removeProperty('--bg-panel');
    document.documentElement.style.removeProperty('--bg-sidebar');
    save({ sidebar_color: null });
  }, [defaultSidebar, save]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite', display: 'block' }} />
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>Appearance</SectionTitle>

      {/* ── Theme ── */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Theme</FieldLabel>
        <ChipRow>
          <Chip active={!isDark} onClick={() => handleTheme(false)}>
            <Sun size={13} /> Light
          </Chip>
          <Chip active={isDark} onClick={() => handleTheme(true)}>
            <Moon size={13} /> Dark
          </Chip>
        </ChipRow>
      </div>

      {/* ── Background color ── */}
      <div style={{ marginBottom: 24 }}>
        <ColorPickerField
          label="Background color"
          value={bgColor}
          onChange={handleBgColor}
          onReset={handleBgReset}
          sub="The main app background. Click the swatch to open the color picker."
        />
      </div>

      {/* ── Sidebar color ── */}
      <div style={{ marginBottom: 24 }}>
        <ColorPickerField
          label="Panel / sidebar color"
          value={sidebarColor}
          onChange={handleSidebarColor}
          onReset={handleSidebarReset}
          sub="Used for sidebars, headers, and floating panels."
        />
      </div>

      <Divider />

      {/* ── Font size ── */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Font size</FieldLabel>
        <ChipRow>
          {(['small', 'medium', 'large'] as const).map((s) => (
            <Chip key={s} active={fontSize === s} onClick={() => handleFontSize(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </ChipRow>
        <SubLabel>Adjusts text size across the app where possible.</SubLabel>
      </div>

      {/* ── Font family ── */}
      <div style={{ marginBottom: 0 }}>
        <FieldLabel>Font family</FieldLabel>
        <ChipRow>
          {(Object.keys(FONT_STACKS) as ('default' | 'serif' | 'mono')[]).map((ff) => (
            <Chip key={ff} active={fontFamily === ff} onClick={() => handleFontFamily(ff)}>
              <span style={{
                fontFamily: FONT_STACKS[ff],
                fontSize: ff === 'mono' ? 11 : 13,
              }}>
                {ff === 'default' ? 'Default' : ff === 'serif' ? 'Serif' : 'Mono'}
              </span>
            </Chip>
          ))}
        </ChipRow>
        <SubLabel>
          Default (Geist) · Serif (Georgia) · Mono (JetBrains Mono)
        </SubLabel>
      </div>

      <Divider />

      {/* ── Accent color ── */}
      <div>
        <FieldLabel>Accent color</FieldLabel>
        {/* Preset swatches */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {Object.entries(ACCENT_PRESETS).map(([key, c]) => {
            const isActive = accent === key;
            return (
              <button
                key={key}
                title={key}
                onClick={() => handleAccentPreset(key)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: c.base, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isActive ? `0 0 0 3px var(--bg-app), 0 0 0 5px ${c.base}` : 'none',
                  transition: 'box-shadow 0.15s',
                }}
              >
                {isActive && <Check size={14} color="#fff" strokeWidth={3} />}
              </button>
            );
          })}
        </div>

        {/* Custom color picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Custom:</span>
          <ColorPickerField
            label=""
            value={customAccent}
            onChange={handleCustomAccent}
            onReset={() => { handleAccentPreset('Blue'); setCustomAccent('#2563eb'); }}
          />
        </div>
        <SubLabel>Changes buttons, links, and highlights throughout the app. Synced across devices.</SubLabel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Workspace
// ─────────────────────────────────────────────────────────────────────────────

function WorkspaceSection() {
  const [bgTheme, setBgTheme]     = useState<'white' | 'dark'>('dark');
  const [defaultZoom, setDefaultZoom] = useState<number>(100);
  const [viewMode, setViewMode]   = useState<'page' | 'scroll'>('page');

  useEffect(() => {
    loadUserPreferences().then((prefs) => {
      setBgTheme((prefs?.default_bg as 'white' | 'dark') ?? storageGet<'white' | 'dark'>(KEYS.DEFAULT_BG) ?? 'dark');
      setDefaultZoom(prefs?.default_zoom ?? storageGet<number>(KEYS.DEFAULT_ZOOM) ?? 100);
      setViewMode((prefs?.view_mode as 'page' | 'scroll') ?? storageGet<'page' | 'scroll'>(KEYS.VIEW_MODE) ?? 'page');
    });
  }, []);

  const setBg = (val: 'white' | 'dark') => {
    setBgTheme(val); storageSet(KEYS.DEFAULT_BG, val);
    saveUserPreferences({ default_bg: val });
  };
  const setVm = (val: 'page' | 'scroll') => {
    setViewMode(val); storageSet(KEYS.VIEW_MODE, val);
    saveUserPreferences({ view_mode: val });
  };
  const handleZoom = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(300, Math.max(25, n));
    setDefaultZoom(clamped);
    storageSet(KEYS.DEFAULT_ZOOM, clamped);
    saveUserPreferences({ default_zoom: clamped });
  }, []);

  return (
    <div>
      <SectionTitle>Workspace</SectionTitle>

      {/* Default blank page */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Default blank page style</FieldLabel>
        <ChipRow>
          <Chip active={bgTheme === 'white'} onClick={() => setBg('white')}>
            <span style={{ width: 14, height: 11, borderRadius: 2, background: '#ffffff', border: '1px solid rgba(0,0,0,0.18)', flexShrink: 0 }} />
            White dots
          </Chip>
          <Chip active={bgTheme === 'dark'} onClick={() => setBg('dark')}>
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
          <Chip active={viewMode === 'page'} onClick={() => setVm('page')}>Page by page</Chip>
          <Chip active={viewMode === 'scroll'} onClick={() => setVm('scroll')}>Scroll</Chip>
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
          <span style={{ minWidth: 42, fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
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
  const [roomJoin, setRoomJoin] = useState(true);

  useEffect(() => {
    loadUserPreferences().then((prefs) => {
      setRoomJoin(prefs?.notif_room_join ?? storageGet<boolean>(KEYS.NOTIF_ROOM_JOIN) ?? true);
    });
  }, []);

  const toggle = () => {
    const next = !roomJoin;
    setRoomJoin(next);
    storageSet(KEYS.NOTIF_ROOM_JOIN, next);
    saveUserPreferences({ notif_room_join: next });
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();
  const sb = createClient();

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      setUserEmail(user.email ?? '');
      const profile = await getProfile();
      setDisplayName(profile?.username ?? user.email?.split('@')[0] ?? '');
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
          {active === 'account'       && <AccountSection userEmail={userEmail} displayName={displayName} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />}
          {active === 'appearance'    && <AppearanceSection />}
          {active === 'workspace'     && <WorkspaceSection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'data'          && <DataSection />}
        </main>
      </div>
    </div>
  );
}
