'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import { loadUserPreferences, saveUserPreferences } from '@/lib/supabase/db';
import { SectionTitle, Toggle, SettingRow } from './controls';

export function NotificationsSection() {
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
