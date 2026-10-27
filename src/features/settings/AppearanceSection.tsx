'use client';
import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sun, Moon, Check, Globe2 } from 'lucide-react';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import { loadUserPreferences, saveUserPreferences, getUserSettings, saveUserSettings } from '@/lib/supabase/db';
import { applyPreferences, ACCENT_PRESETS, FONT_STACKS } from '@/lib/preferences';
import { Divider, FieldLabel, SectionTitle, SubLabel, ChipRow, Chip } from './controls';
import { ColorPickerField } from './ColorPickerField';

export function AppearanceSection() {
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
      const ac = prefs?.accent_color ?? storageGet<string>(KEYS.ACCENT_COLOR) ?? 'Purple';
      setAccent(ac);
      if (ac.startsWith('#')) setCustomAccent(ac);
      setBgColor(prefs?.bg_color ?? storageGet<string>(KEYS.BG_COLOR) ?? (dark ? '#000000' : '#fafaf9'));
      setSidebarColor(prefs?.sidebar_color ?? storageGet<string>(KEYS.SIDEBAR_COLOR) ?? (dark ? '#0a0a0a' : '#f3f4f6'));
      setLoading(false);
    });
  }, [setLang]);

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
