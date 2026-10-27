'use client';
import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import { loadUserPreferences, saveUserPreferences } from '@/lib/supabase/db';
import { FieldLabel, SectionTitle, SubLabel, ChipRow, Chip } from './controls';

export function WorkspaceSection() {
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
