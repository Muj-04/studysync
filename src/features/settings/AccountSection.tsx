'use client';
import { useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trash2, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AuthCaptcha from '@/components/AuthCaptcha';
import { useAuthCaptcha } from '@/hooks/useAuthCaptcha';
import { clearLocalUserData } from '@/lib/clearLocalUserData';
import { deleteUserAccount, isProfileHandleAvailable, upsertProfile, uploadAvatar } from '@/lib/supabase/db';
import { PROFILE_HANDLE_MAX_LENGTH, normalizeProfileHandle, validateProfileHandle } from '@/lib/profileHandle';
import { Divider, FieldLabel, SectionTitle, SubLabel, AppInput, PrimaryBtn, GhostBtn, StatusMsg, PasswordInput } from './controls';
import { ConfirmModal } from './ConfirmModal';

export function AccountSection({
  userEmail,
  displayName,
  profileHandle,
  avatarUrl,
  onDisplayNameChange,
  onHandleChange,
  onAvatarChange,
}: {
  userEmail: string;
  displayName: string;
  profileHandle: string;
  avatarUrl?: string | null;
  onDisplayNameChange?: (name: string) => void;
  onHandleChange?: (handle: string) => void;
  onAvatarChange?: (url: string) => void;
}) {
  const { t } = useLanguage();
  const sb = useMemo(() => createClient(), []);

  const [name, setName] = useState(displayName);
  const [nameSt, setNameSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [nameErr, setNameErr] = useState('');

  const [handle, setHandle] = useState(profileHandle);
  const [handleSt, setHandleSt] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [handleErr, setHandleErr] = useState('');

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
  const captcha = useAuthCaptcha();

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [delLoading, setDelLoading] = useState(false);
  const router = useRouter();

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadSt('loading');
    try {
      const url = await uploadAvatar(file);
      if (!url) throw new Error(t('set_acc_upload_failed'));
      await upsertProfile({ avatarUrl: url });
      setLocalAvatarUrl(url);
      onAvatarChange?.(url);
      setUploadSt('ok');
      setTimeout(() => setUploadSt('idle'), 3000);
    } catch {
      setUploadSt('err');
      setTimeout(() => setUploadSt('idle'), 3000);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onAvatarChange, t]);

  const saveName = useCallback(async () => {
    const nextName = name.trim();
    if (!nextName) {
      setNameErr('Display name cannot be empty.');
      setNameSt('err');
      return;
    }
    setNameSt('loading');
    setNameErr('');
    try {
      await upsertProfile({ username: nextName });
      setName(nextName);
      onDisplayNameChange?.(nextName);
      setNameSt('ok');
      setTimeout(() => setNameSt('idle'), 3000);
    } catch (e) {
      setNameErr(e instanceof Error ? e.message : 'Could not update display name.');
      setNameSt('err');
    }
  }, [name, onDisplayNameChange]);

  const saveHandle = useCallback(async () => {
    const nextHandle = normalizeProfileHandle(handle);
    const validationError = validateProfileHandle(nextHandle);
    if (validationError) {
      setHandleErr(validationError);
      setHandleSt('err');
      return;
    }
    setHandleSt('loading');
    setHandleErr('');
    try {
      const available = await isProfileHandleAvailable(nextHandle);
      if (!available) throw new Error('This handle is already taken.');
      await upsertProfile({ handle: nextHandle });
      setHandle(nextHandle);
      onHandleChange?.(nextHandle);
      setHandleSt('ok');
      setTimeout(() => setHandleSt('idle'), 3000);
    } catch (e) {
      setHandleErr(e instanceof Error ? e.message : 'Could not update handle.');
      setHandleSt('err');
    }
  }, [handle, onHandleChange]);

  const saveEmail = useCallback(async () => {
    if (emailSt === 'loading') return;
    setEmailSt('loading');
    setEmailErr('');
    try {
      const { error } = await sb.auth.updateUser({ email: email.trim() });
      if (error) throw new Error(error.message);
      setEmailSt('ok');
    } catch (error) {
      setEmailErr(error instanceof Error ? error.message : 'Could not update email. Please try again.');
      setEmailSt('err');
    }
  }, [email, emailSt, sb]);

  const savePassword = useCallback(async () => {
    if (pwdSt === 'loading') return;
    if (newPwd !== cfmPwd) { setPwdErr(t('set_acc_pw_mismatch')); setPwdSt('err'); return; }
    if (newPwd.length < 8) { setPwdErr(t('set_acc_pw_short')); setPwdSt('err'); return; }
    setPwdSt('loading');
    setPwdErr('');
    try {
      const { error } = await captcha.run(captchaToken => sb.auth.signInWithPassword({
        email: userEmail, password: curPwd, options: { captchaToken },
      }));
      if (error) { setPwdErr(error.code === 'invalid_credentials' ? t('set_acc_current_pw_wrong') : error.message); setPwdSt('err'); return; }
      const { error: updErr } = await sb.auth.updateUser({ password: newPwd });
      if (updErr) { setPwdErr(updErr.message); setPwdSt('err'); }
      else {
        setPwdSt('ok'); setCurPwd(''); setNewPwd(''); setCfmPwd('');
        setTimeout(() => setPwdSt('idle'), 3000);
      }
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Could not update your password. Please try again.');
      setPwdSt('err');
    }
  }, [curPwd, newPwd, cfmPwd, userEmail, sb, t, captcha, pwdSt]);

  const handleDelete = useCallback(async () => {
    setDelLoading(true);
    const { error } = await deleteUserAccount();
    if (error) { setDelLoading(false); alert('Failed to delete account: ' + error); return; }
    await sb.auth.signOut();
    await clearLocalUserData();
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
          <AppInput value={name} onChange={setName} placeholder={t('set_acc_name_placeholder')} maxLength={50} />
          <PrimaryBtn onClick={saveName} loading={nameSt === 'loading'} disabled={name.trim() === displayName}>
            {t('set_acc_save')}
          </PrimaryBtn>
        </div>
        {nameSt === 'ok' && <StatusMsg type="ok">{t('set_acc_name_updated')}</StatusMsg>}
        {nameSt === 'err' && <StatusMsg type="err">{nameErr}</StatusMsg>}
      </div>

      <Divider />

      {/* Unique handle */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_acc_handle')}</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <AppInput
            value={handle}
            onChange={(value) => setHandle(value.toLowerCase())}
            placeholder={t('set_acc_handle_placeholder')}
            maxLength={PROFILE_HANDLE_MAX_LENGTH}
            autoCapitalize="none"
            spellCheck={false}
          />
          <PrimaryBtn
            onClick={saveHandle}
            loading={handleSt === 'loading'}
            disabled={normalizeProfileHandle(handle) === profileHandle}
          >
            {t('set_acc_save')}
          </PrimaryBtn>
        </div>
        <SubLabel>{t('set_acc_handle_hint')}</SubLabel>
        {handleSt === 'ok' && <StatusMsg type="ok">{t('set_acc_handle_updated')}</StatusMsg>}
        {handleSt === 'err' && <StatusMsg type="err">{handleErr}</StatusMsg>}
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
          <AuthCaptcha control={captcha} />
          <PrimaryBtn
            onClick={savePassword}
            loading={pwdSt === 'loading'}
            disabled={!curPwd || !newPwd || !cfmPwd || newPwd !== cfmPwd || !captcha.ready}
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
            await clearLocalUserData();
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
