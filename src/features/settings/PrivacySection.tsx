'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Check } from 'lucide-react';
import { getUserSettings, saveUserSettings } from '@/lib/supabase/db';
import { FieldLabel, SectionTitle, SubLabel, PrimaryBtn } from './controls';

export function PrivacySection() {
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
