'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { type Lang, type TranslationKey, translate, LANG_KEY } from '@/lib/i18n';
import { getUserSettings } from '@/lib/supabase/db';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    // Apply from localStorage immediately (no flash)
    try {
      const stored = localStorage.getItem(LANG_KEY) as Lang | null;
      if (stored === 'ar' || stored === 'en') {
        setLangState(stored);
        applyLangToDom(stored);
      }
    } catch {}

    // Sync from Supabase asynchronously (cross-device preference)
    getUserSettings().then((settings) => {
      const serverLang = settings.language;
      if (serverLang === 'ar' || serverLang === 'en') {
        setLangState(serverLang);
        applyLangToDom(serverLang);
        try { localStorage.setItem(LANG_KEY, serverLang); } catch {}
      }
    }).catch(() => {});
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    try { localStorage.setItem(LANG_KEY, newLang); } catch {}
    applyLangToDom(newLang);
  }, []);

  const t = useCallback((key: TranslationKey) => translate(key, lang), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

function applyLangToDom(lang: Lang) {
  const isAr = lang === 'ar';
  document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.classList.toggle('lang-ar', isAr);
}
