'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { type Lang, type TranslationKey, translate, LANG_KEY } from '@/lib/i18n';

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

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY) as Lang | null;
      if (stored === 'ar' || stored === 'en') {
        setLangState(stored);
        applyLangToDom(stored);
      }
    } catch {}
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
  document.documentElement.classList.toggle('lang-ar', lang === 'ar');
  document.documentElement.setAttribute('lang', lang);
}
