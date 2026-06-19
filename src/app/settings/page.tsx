'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  User, Palette, Layout, Bell, Database,
  ChevronLeft, Sun, Moon, Check, Trash2, Download,
  Eye, EyeOff, AlertTriangle, LogOut, RotateCcw,
  BookOpen, Shield, Flame, Globe2, Gift, Copy, Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import {
  getUserStorageStats,
  getLimitUsageStats,
  deleteAllVoiceNotesForUser,
  deleteAllDrawingsForUser,
  exportAllUserData,
  deleteUserAccount,
  loadUserPreferences,
  saveUserPreferences,
  getProfile,
  upsertProfile,
  uploadAvatar,
  getUserSettings,
  saveUserSettings,
  getStudyStreak,
  getTodayStudySeconds,
  getReferralStats,
  ensureReferralCode,
} from '@/lib/supabase/db';
import type { UserAppSettings } from '@/lib/supabase/db';
import { applyPreferences, ACCENT_PRESETS, FONT_STACKS } from '@/lib/preferences';
import { PLAN_LIMITS, PLAN_LABELS } from '@/lib/planLimits';

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
        borderRadius: 4, border: '1px solid var(--border)',
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
        background: disabled || loading ? 'rgba(255,255,255,0.12)' : '#ffffff',
        color: disabled || loading ? 'rgba(255,255,255,0.35)' : '#0f172a',
        border: disabled || loading ? '1px solid rgba(255,255,255,0.15)' : 'none',
        borderRadius: 4, fontSize: 12.5, fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 0.13s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
      onMouseOver={(e) => { if (!disabled && !loading) e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
      onMouseOut={(e) => { if (!disabled && !loading) e.currentTarget.style.background = '#ffffff'; }}
    >
      {loading && (
        <span className="spinner" style={{
          width: 12, height: 12, borderRadius: '50%',
          border: '2px solid rgba(15,23,42,0.2)',
          borderTopColor: '#0f172a', flexShrink: 0,
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
        borderRadius: 4, fontSize: 12.5, fontWeight: 500,
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
          borderRadius: 4, border: '1px solid var(--border)',
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
        width: 40, height: 22, borderRadius: 4, padding: 2,
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
        borderRadius: 4,
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
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, padding: 24,
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
              border: 'none', borderRadius: 4,
              fontSize: 12.5, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && <span className="spinner" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', flexShrink: 0 }} />}
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
  const { t } = useLanguage();
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
    if (newPwd !== cfmPwd) { setPwdErr(t('set_acc_pw_mismatch')); setPwdSt('err'); return; }
    if (newPwd.length < 8) { setPwdErr(t('set_acc_pw_short')); setPwdSt('err'); return; }
    setPwdSt('loading');
    const { error } = await sb.auth.signInWithPassword({ email: userEmail, password: curPwd });
    if (error) { setPwdErr(t('set_acc_current_pw_wrong')); setPwdSt('err'); return; }
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
    router.replace('/login');
  }, [router, sb]);

  return (
    <div>
      <SectionTitle>{t('set_acc_title')}</SectionTitle>

      {/* Profile picture */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_acc_photo')}</FieldLabel>
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
              {uploadSt === 'loading' ? t('set_acc_uploading') : t('set_acc_upload_photo')}
            </PrimaryBtn>
            {uploadSt === 'ok' && <StatusMsg type="ok">{t('set_acc_photo_updated')}</StatusMsg>}
            {uploadSt === 'err' && <StatusMsg type="err">{t('set_acc_upload_failed')}</StatusMsg>}
            <SubLabel>{t('set_acc_photo_hint')}</SubLabel>
          </div>
        </div>
      </div>

      <Divider />

      {/* Display Name */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_acc_name')}</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <AppInput value={name} onChange={setName} placeholder={t('set_acc_name_placeholder')} />
          <PrimaryBtn onClick={saveName} loading={nameSt === 'loading'} disabled={name.trim() === displayName}>
            {t('set_acc_save')}
          </PrimaryBtn>
        </div>
        {nameSt === 'ok' && <StatusMsg type="ok">{t('set_acc_name_updated')}</StatusMsg>}
        {nameSt === 'err' && <StatusMsg type="err">{nameErr}</StatusMsg>}
      </div>

      <Divider />

      {/* Email */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_acc_email')}</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <AppInput value={email} onChange={setEmail} type="email" placeholder={t('set_acc_email_placeholder')} />
          <PrimaryBtn onClick={saveEmail} loading={emailSt === 'loading'} disabled={email.trim() === userEmail}>
            {t('set_acc_save')}
          </PrimaryBtn>
        </div>
        {emailSt === 'ok' && <StatusMsg type="ok">{t('set_acc_email_sent')}</StatusMsg>}
        {emailSt === 'err' && <StatusMsg type="err">{emailErr}</StatusMsg>}
      </div>

      <Divider />

      {/* Password */}
      <div>
        <FieldLabel>{t('set_acc_change_pw')}</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
          <PasswordInput value={curPwd} onChange={setCurPwd} placeholder={t('set_acc_current_pw')} />
          <PasswordInput value={newPwd} onChange={setNewPwd} placeholder={t('set_acc_new_pw')} />
          <div>
            <div style={{ border: `1px solid ${cfmPwd && cfmPwd !== newPwd ? '#ef4444' : 'var(--border)'}`, borderRadius: 4 }}>
              <PasswordInput value={cfmPwd} onChange={setCfmPwd} placeholder={t('set_acc_confirm_pw')} />
            </div>
            {cfmPwd && cfmPwd !== newPwd && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#ef4444' }}>{t('set_acc_pw_mismatch')}</p>
            )}
          </div>
          <PrimaryBtn
            onClick={savePassword}
            loading={pwdSt === 'loading'}
            disabled={!curPwd || !newPwd || !cfmPwd || newPwd !== cfmPwd}
          >
            {t('set_acc_update_pw')}
          </PrimaryBtn>
          {pwdSt === 'ok' && <StatusMsg type="ok">{t('set_acc_pw_updated')}</StatusMsg>}
          {pwdSt === 'err' && <StatusMsg type="err">{pwdErr}</StatusMsg>}
        </div>
      </div>

      <Divider />

      {/* Sign out */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_acc_session')}</FieldLabel>
        <GhostBtn
          onClick={async () => {
            await sb.auth.signOut();
            router.replace('/login');
          }}
        >
          <LogOut size={13} />
          {t('set_acc_signout')}
        </GhostBtn>
        <SubLabel>{t('set_acc_signout_hint')}</SubLabel>
      </div>

      <Divider />

      {/* Delete account */}
      <div>
        <FieldLabel>{t('set_acc_danger')}</FieldLabel>
        <GhostBtn danger onClick={() => setDeleteConfirm(true)}>
          <Trash2 size={13} />
          {t('set_acc_delete')}
        </GhostBtn>
        <SubLabel>{t('set_acc_delete_hint')}</SubLabel>
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title={t('set_acc_delete_title')}
          body={t('set_acc_delete_body')}
          confirmLabel={t('set_acc_delete_btn')}
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
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginBottom: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Swatch / trigger */}
        <button
          onClick={() => inputRef.current?.click()}
          title={t('set_app_pick_color')}
          style={{
            width: 38, height: 38, borderRadius: 4,
            background: value,
            border: '2px solid var(--border-strong)',
            cursor: 'pointer', flexShrink: 0,
            
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
          title={t('set_app_reset_default')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-3)', fontSize: 11.5, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'color 0.12s, background 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-1)', background: 'var(--bg-hover)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', background: 'var(--bg-elevated)' })}
        >
          <RotateCcw size={10} />
          {t('set_app_reset')}
        </button>
      </div>
      {sub && <SubLabel>{sub}</SubLabel>}
    </div>
  );
}

function AppearanceSection() {
  const { lang: language, setLang, t } = useLanguage();
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
    getUserSettings().then((s) => {
      setLang(s.language as 'en' | 'ar');
    });
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

  const handleLanguage = useCallback((lang: 'en' | 'ar') => {
    setLang(lang);
    saveUserSettings({ language: lang });
  }, [setLang]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <span className="spinner" style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', display: 'block' }} />
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>{t('set_app_title')}</SectionTitle>

      {/* ── Language ── */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_app_language')}</FieldLabel>
        <ChipRow>
          <Chip active={language === 'en'} onClick={() => handleLanguage('en')}>
            <Globe2 size={13} /> {t('set_app_lang_en')}
          </Chip>
          <Chip active={language === 'ar'} onClick={() => handleLanguage('ar')}>
            <Globe2 size={13} /> {t('set_app_lang_ar')}
          </Chip>
        </ChipRow>
        <SubLabel>{t('set_app_lang_hint')}</SubLabel>
      </div>

      <Divider />

      {/* ── Theme ── */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_app_theme')}</FieldLabel>
        <ChipRow>
          <Chip active={!isDark} onClick={() => handleTheme(false)}>
            <Sun size={13} /> {t('set_app_light')}
          </Chip>
          <Chip active={isDark} onClick={() => handleTheme(true)}>
            <Moon size={13} /> {t('set_app_dark')}
          </Chip>
        </ChipRow>
      </div>

      {/* ── Background color ── */}
      <div style={{ marginBottom: 24 }}>
        <ColorPickerField
          label={t('set_app_bg_color')}
          value={bgColor}
          onChange={handleBgColor}
          onReset={handleBgReset}
          sub={t('set_app_bg_hint')}
        />
      </div>

      {/* ── Sidebar color ── */}
      <div style={{ marginBottom: 24 }}>
        <ColorPickerField
          label={t('set_app_panel_color')}
          value={sidebarColor}
          onChange={handleSidebarColor}
          onReset={handleSidebarReset}
          sub={t('set_app_panel_hint')}
        />
      </div>

      <Divider />

      {/* ── Font size ── */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_app_font_size')}</FieldLabel>
        <ChipRow>
          <Chip active={fontSize === 'small'} onClick={() => handleFontSize('small')}>{t('set_app_small')}</Chip>
          <Chip active={fontSize === 'medium'} onClick={() => handleFontSize('medium')}>{t('set_app_medium')}</Chip>
          <Chip active={fontSize === 'large'} onClick={() => handleFontSize('large')}>{t('set_app_large')}</Chip>
        </ChipRow>
        <SubLabel>{t('set_app_font_size_hint')}</SubLabel>
      </div>

      {/* ── Font family ── */}
      <div style={{ marginBottom: 0 }}>
        <FieldLabel>{t('set_app_font_family')}</FieldLabel>
        <ChipRow>
          {(Object.keys(FONT_STACKS) as ('default' | 'serif' | 'mono')[]).map((ff) => (
            <Chip key={ff} active={fontFamily === ff} onClick={() => handleFontFamily(ff)}>
              <span style={{ fontFamily: FONT_STACKS[ff], fontSize: ff === 'mono' ? 11 : 13 }}>
                {ff === 'default' ? t('set_app_font_default') : ff === 'serif' ? t('set_app_font_serif') : t('set_app_font_mono')}
              </span>
            </Chip>
          ))}
        </ChipRow>
        <SubLabel>{t('set_app_font_hint')}</SubLabel>
      </div>

      <Divider />

      {/* ── Accent color ── */}
      <div>
        <FieldLabel>{t('set_app_accent')}</FieldLabel>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{t('set_app_custom')}</span>
          <ColorPickerField
            label=""
            value={customAccent}
            onChange={handleCustomAccent}
            onReset={() => { handleAccentPreset('Blue'); setCustomAccent('#2563eb'); }}
          />
        </div>
        <SubLabel>{t('set_app_accent_hint')}</SubLabel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Study & Goals
// ─────────────────────────────────────────────────────────────────────────────

function StudySection() {
  const { t } = useLanguage();
  const [streak, setStreak] = useState(0);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [goal, setGoal] = useState(2);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getStudyStreak(), getTodayStudySeconds(), getUserSettings()]).then(([s, secs, settings]) => {
      setStreak(s);
      setTodaySeconds(secs);
      setGoal(settings.dailyStudyGoalHours);
    });
  }, []);

  const todayHours = todaySeconds / 3600;
  const goalProgress = Math.min(1, todayHours / goal);

  const handleSaveGoal = async () => {
    await saveUserSettings({ dailyStudyGoalHours: goal });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <SectionTitle>{t('set_study_title')}</SectionTitle>

      {/* Streak */}
      <div style={{ marginBottom: 28 }}>
        <FieldLabel>{t('set_study_streak')}</FieldLabel>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'var(--bg-elevated)', borderRadius: 4,
          padding: '16px 20px', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 36 }}>🔥</div>
          <div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{streak}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {streak === 1 ? t('set_study_day') : t('set_study_days')}
            </p>
          </div>
          {streak >= 7 && (
            <span style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
              🎯 {streak}+ {t('set_study_days')}!
            </span>
          )}
        </div>
        <SubLabel>{t('set_study_streak_hint')}</SubLabel>
      </div>

      {/* Today's progress */}
      <div style={{ marginBottom: 28 }}>
        <FieldLabel>{t('set_study_today')}</FieldLabel>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {todaySeconds < 60
              ? `${todaySeconds}s`
              : todaySeconds < 3600
                ? `${Math.floor(todaySeconds / 60)}m`
                : `${(todaySeconds / 3600).toFixed(1)}h`} {t('set_study_studied')}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('set_study_goal_label')}: {goal}h</span>
        </div>
        <div style={{ height: 10, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${goalProgress * 100}%`, background: goalProgress >= 1 ? '#22c55e' : 'var(--accent)', borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
        {goalProgress >= 1 && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#22c55e', fontWeight: 500 }}>
            {t('set_study_goal_achieved')}
          </p>
        )}
      </div>

      {/* Daily goal setting */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_study_daily_goal')}</FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[1, 2, 3, 4].map((h) => (
            <button
              key={h}
              onClick={() => setGoal(h)}
              style={{
                height: 36, padding: '0 16px', borderRadius: 4,
                background: goal === h ? 'var(--accent)' : 'var(--bg-elevated)',
                color: goal === h ? '#fff' : 'var(--text-2)',
                border: `1px solid ${goal === h ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 13, fontWeight: goal === h ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.12s',
              }}
            >{h}h</button>
          ))}
          <button
            onClick={() => setGoal(5)}
            style={{
              height: 36, padding: '0 16px', borderRadius: 4,
              background: goal >= 5 ? 'var(--accent)' : 'var(--bg-elevated)',
              color: goal >= 5 ? '#fff' : 'var(--text-2)',
              border: `1px solid ${goal >= 5 ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 13, fontWeight: goal >= 5 ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.12s',
            }}
          >4h+</button>
        </div>
        <PrimaryBtn onClick={handleSaveGoal} loading={false} disabled={false}>
          {saved ? <><Check size={13} /> {t('common_done')}</> : t('set_study_save_goal')}
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Privacy
// ─────────────────────────────────────────────────────────────────────────────

function PrivacySection() {
  const { t } = useLanguage();
  const [visibility, setVisibility] = useState<'everyone' | 'friends' | 'only_me'>('everyone');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserSettings().then((s) => {
      setVisibility(s.communityVisibility);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await saveUserSettings({ communityVisibility: visibility });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const options = [
    { value: 'everyone' as const, label: t('set_priv_everyone'), desc: t('set_priv_everyone_hint') },
    { value: 'friends' as const,  label: t('set_priv_friends'),  desc: t('set_priv_friends_hint') },
    { value: 'only_me' as const,  label: t('set_priv_only_me'),  desc: t('set_priv_only_me_hint') },
  ];

  return (
    <div>
      <SectionTitle>{t('set_priv_title')}</SectionTitle>

      <div style={{ marginBottom: 28 }}>
        <FieldLabel>{t('set_priv_who_sees')}</FieldLabel>
        <SubLabel>{t('set_priv_hint')}</SubLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {options.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setVisibility(value)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 4, textAlign: 'left',
                background: visibility === value ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                border: `1.5px solid ${visibility === value ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${visibility === value ? 'var(--accent)' : 'var(--border)'}`,
                background: visibility === value ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {visibility === value && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <PrimaryBtn onClick={handleSave} disabled={loading}>
            {saved ? <><Check size={13} /> {t('common_done')}</> : t('set_priv_save')}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Workspace
// ─────────────────────────────────────────────────────────────────────────────

function WorkspaceSection() {
  const { t } = useLanguage();
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
      <SectionTitle>{t('set_ws_title')}</SectionTitle>

      {/* Default blank page */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_ws_blank_style')}</FieldLabel>
        <ChipRow>
          <Chip active={bgTheme === 'white'} onClick={() => setBg('white')}>
            <span style={{ width: 14, height: 11, borderRadius: 2, background: '#ffffff', border: '1px solid rgba(0,0,0,0.18)', flexShrink: 0 }} />
            {t('set_ws_white_dots')}
          </Chip>
          <Chip active={bgTheme === 'dark'} onClick={() => setBg('dark')}>
            <span style={{ width: 14, height: 11, borderRadius: 2, background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }} />
            {t('set_ws_dark_dots')}
          </Chip>
        </ChipRow>
        <SubLabel>{t('set_ws_blank_hint')}</SubLabel>
      </div>

      {/* Default view mode */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_ws_view_mode')}</FieldLabel>
        <ChipRow>
          <Chip active={viewMode === 'page'} onClick={() => setVm('page')}>{t('set_ws_page_by_page')}</Chip>
          <Chip active={viewMode === 'scroll'} onClick={() => setVm('scroll')}>{t('set_ws_scroll')}</Chip>
        </ChipRow>
        <SubLabel>{t('set_ws_view_hint')}</SubLabel>
      </div>

      {/* Default zoom */}
      <div>
        <FieldLabel>{t('set_ws_zoom')}</FieldLabel>
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
        <SubLabel>{t('set_ws_zoom_hint')}</SubLabel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Notifications
// ─────────────────────────────────────────────────────────────────────────────

function NotificationsSection() {
  const { t } = useLanguage();
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
      <SectionTitle>{t('set_notif_title')}</SectionTitle>
      <SettingRow
        label={t('set_notif_room')}
        sub={t('set_notif_room_hint')}
      >
        <Toggle on={roomJoin} onToggle={toggle} />
      </SettingRow>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Data & Storage
// ─────────────────────────────────────────────────────────────────────────────

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = Math.min(100, max > 0 ? (used / max) * 100 : 0);
  const nearLimit = pct >= 80;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: nearLimit ? 'var(--red, #ef4444)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {used} / {max}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${pct}%`,
          background: nearLimit ? 'var(--red, #ef4444)' : 'var(--accent)',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

function ReferralSection() {
  const [stats, setStats] = useState<{
    referralCode: string | null;
    referralLink: string | null;
    referralCount: number;
    rewardActive: boolean;
    rewardExpiresAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      await ensureReferralCode();
      const s = await getReferralStats();
      setStats(s);
      setLoading(false);
    };
    load();
  }, []);

  const copyLink = useCallback(() => {
    if (!stats?.referralLink) return;
    navigator.clipboard.writeText(stats.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [stats?.referralLink]);

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <SectionTitle>Referrals</SectionTitle>

      {/* Headline card */}
      <div style={{
        padding: '20px 20px', borderRadius: 8, marginBottom: 24,
        background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Gift size={18} style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
            Invite friends, get 1 week Premium free
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
            For each friend who signs up with your link, you both get 7 days of Premium — automatically.
          </p>
        </div>
      </div>

      {/* Your referral link */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Your referral link</FieldLabel>
        {loading ? (
          <div style={{
            height: 38, borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', paddingLeft: 12,
          }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, height: 38, borderRadius: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', padding: '0 12px',
              overflow: 'hidden',
            }}>
              <span style={{
                fontSize: 12.5, color: 'var(--text-2)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: 'monospace',
              }}>
                {stats?.referralLink ?? '—'}
              </span>
            </div>
            <button
              onClick={copyLink}
              disabled={!stats?.referralLink}
              style={{
                height: 38, padding: '0 14px',
                borderRadius: 4, border: '1px solid var(--border)',
                background: copied ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)',
                color: copied ? '#4ade80' : 'var(--text-2)',
                cursor: stats?.referralLink ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                flexShrink: 0,
                borderColor: copied ? 'rgba(34,197,94,0.35)' : undefined,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        <SubLabel>Share this link — anyone who registers gets you both 7 days Premium free.</SubLabel>
      </div>

      <Divider />

      {/* Stats row */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Your referrals</FieldLabel>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            flex: 1, padding: '16px 18px', borderRadius: 6,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Users size={15} style={{ color: 'var(--text-2)' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '—' : (stats?.referralCount ?? 0)}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>Friends referred</p>
            </div>
          </div>

          <div style={{
            flex: 1, padding: '16px 18px', borderRadius: 6,
            background: stats?.rewardActive ? 'rgba(124,58,237,0.08)' : 'var(--bg-elevated)',
            border: `1px solid ${stats?.rewardActive ? 'rgba(124,58,237,0.3)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: stats?.rewardActive ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Gift size={15} style={{ color: stats?.rewardActive ? '#a78bfa' : 'var(--text-2)' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: stats?.rewardActive ? '#a78bfa' : 'var(--text-2)' }}>
                {loading ? '—' : stats?.rewardActive ? 'Active reward' : 'No active reward'}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
                {!loading && stats?.rewardActive && stats.rewardExpiresAt
                  ? `Premium until ${formatExpiry(stats.rewardExpiresAt)}`
                  : 'Refer a friend to earn Premium'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Your code */}
      <div>
        <FieldLabel>Your referral code</FieldLabel>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '6px 14px', borderRadius: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-1)', fontFamily: 'monospace' }}>
            {loading ? '…' : (stats?.referralCode ?? '—')}
          </span>
        </div>
        <SubLabel>Your code is automatically applied when someone uses your referral link.</SubLabel>
      </div>
    </div>
  );
}

function DataSection() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<{ documents: number; voiceNotes: number; drawings: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [limitStats, setLimitStats] = useState<{
    documents: number;
    voiceStorageBytes: number;
    aiRequestsThisMonth: number;
    plan: 'free' | 'premium' | 'pro';
    isVip: boolean;
  } | null>(null);

  const [clearDrawState, setClearDrawState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [clearNotesState, setClearNotesState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    getUserStorageStats().then((s) => { setStats(s); setStatsLoading(false); });
    getLimitUsageStats().then(setLimitStats);
  }, []);

  const refreshStats = useCallback(() => {
    setStatsLoading(true);
    getUserStorageStats().then((s) => { setStats(s); setStatsLoading(false); });
    getLimitUsageStats().then(setLimitStats);
  }, []);

  const doClearDrawings = useCallback(async () => {
    setClearDrawState('loading');
    await deleteAllDrawingsForUser();
    storageSet(KEYS.DRAWINGS, {});
    storageSet(KEYS.PAGE_IMAGES, {});
    setClearDrawState('idle');
    refreshStats();
  }, [refreshStats]);

  const doClearNotes = useCallback(async () => {
    setClearNotesState('loading');
    await deleteAllVoiceNotesForUser();
    storageSet(KEYS.VOICE_NOTES, []);
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
      <SectionTitle>{t('set_data_title')}</SectionTitle>

      {/* Usage stats */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_data_usage')}</FieldLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
        }}>
          {([
            { label: t('set_data_documents'), key: 'documents' },
            { label: t('set_data_voice'),     key: 'voiceNotes' },
            { label: t('set_data_drawings'),  key: 'drawings' },
          ] as const).map(({ label, key }) => (
            <div key={key} style={{
              padding: '12px 14px', borderRadius: 4,
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

        {/* Per-plan usage bars */}
        {limitStats && !limitStats.isVip && (
          <div style={{
            padding: '14px 16px', borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              {PLAN_LABELS[limitStats.plan]} {t('set_data_plan_limits')}
            </p>
            {PLAN_LIMITS[limitStats.plan].documents !== Infinity && (
              <UsageBar
                used={limitStats.documents}
                max={PLAN_LIMITS[limitStats.plan].documents}
                label={t('set_data_documents')}
              />
            )}
            <UsageBar
              used={Math.round(limitStats.voiceStorageBytes / (1024 * 1024))}
              max={Math.round(PLAN_LIMITS[limitStats.plan].voiceStorageBytes / (1024 * 1024))}
              label={t('set_data_voice_storage')}
            />
            <UsageBar
              used={limitStats.aiRequestsThisMonth}
              max={PLAN_LIMITS[limitStats.plan].aiRequestsPerMonth}
              label={t('set_data_ai_requests')}
            />
            {limitStats.plan !== 'pro' && (
              <a href="/pricing" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                {t('set_data_upgrade_limits')}
              </a>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Clear drawings */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_data_drawings')}</FieldLabel>
        <GhostBtn danger onClick={() => setClearDrawState('confirm')} disabled={clearDrawState === 'loading'}>
          <Trash2 size={13} />
          {t('set_data_clear_drawings')}
        </GhostBtn>
        <SubLabel>{t('set_data_clear_drawings_hint')}</SubLabel>
      </div>

      {/* Clear voice notes */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_data_voice')}</FieldLabel>
        <GhostBtn danger onClick={() => setClearNotesState('confirm')} disabled={clearNotesState === 'loading'}>
          <Trash2 size={13} />
          {t('set_data_delete_voice')}
        </GhostBtn>
        <SubLabel>{t('set_data_delete_voice_hint')}</SubLabel>
      </div>

      <Divider />

      {/* Export */}
      <div>
        <FieldLabel>{t('set_data_export')}</FieldLabel>
        <GhostBtn onClick={doExport} disabled={exportLoading}>
          <Download size={13} />
          {exportLoading ? t('set_data_exporting') : t('set_data_export_json')}
        </GhostBtn>
        <SubLabel>{t('set_data_export_hint')}</SubLabel>
      </div>

      {/* Confirm modals */}
      {(clearDrawState === 'confirm' || clearDrawState === 'loading') && (
        <ConfirmModal
          title={t('set_data_clear_title')}
          body={t('set_data_clear_body')}
          confirmLabel={t('set_data_clear_btn')}
          onConfirm={doClearDrawings}
          onCancel={() => setClearDrawState('idle')}
          loading={clearDrawState === 'loading'}
        />
      )}
      {(clearNotesState === 'confirm' || clearNotesState === 'loading') && (
        <ConfirmModal
          title={t('set_data_del_voice_title')}
          body={t('set_data_del_voice_body')}
          confirmLabel={t('set_data_del_voice_btn')}
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
  useAuthGuard();
  const { t } = useLanguage();
  const [active, setActive] = useState<Section>('account');
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();
  const sb = createClient();

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return; }
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
          {active === 'account'       && <AccountSection userEmail={userEmail} displayName={displayName} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />}
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
