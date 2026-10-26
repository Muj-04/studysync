'use client';

import { useCallback, useRef, useState } from 'react';
import type HCaptcha from '@hcaptcha/react-hcaptcha';

const defaultConfig = {
  siteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() ?? '',
  required: process.env.NEXT_PUBLIC_AUTH_CAPTCHA_REQUIRED === 'true',
};
const unavailable = 'Security verification is temporarily unavailable. Please refresh the page and try again.';

// Supabase must also enforce CAPTCHA. This hook manages one-use tokens and UX;
// it is not a server-side rate limiter or an authorization boundary.
export function useAuthCaptcha(config = defaultConfig) {
  const enabled = config.required || Boolean(config.siteKey);
  const misconfigured = enabled && (!config.siteKey || (
    process.env.NODE_ENV === 'production' && config.siteKey === '10000000-ffff-ffff-ffff-000000000001'
  ));
  const widgetRef = useRef<HCaptcha | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const [verified, setVerified] = useState(false);
  const [problem, setProblem] = useState('');
  const attachWidget = useCallback((widget: HCaptcha | null) => { widgetRef.current = widget; }, []);

  const clear = useCallback(() => {
    tokenRef.current = undefined;
    setVerified(false);
  }, []);
  const onVerify = useCallback((token: string) => {
    if (busy.current) return;
    tokenRef.current = token || undefined;
    setVerified(Boolean(token));
    setProblem('');
  }, []);
  const onExpire = useCallback(() => { clear(); }, [clear]);
  const onError = useCallback(() => { clear(); setProblem(unavailable); }, [clear]);

  const run = useCallback(async <T,>(request: (captchaToken: string | undefined) => Promise<T>): Promise<T> => {
    if (busy.current) throw new Error('A request is already in progress.');
    if (misconfigured) throw new Error(unavailable);
    const token = tokenRef.current;
    if (enabled && !token) throw new Error('Please complete the security verification.');
    busy.current = true;
    clear();
    try {
      return await request(enabled ? token : undefined);
    } finally {
      busy.current = false;
      if (enabled) {
        try { widgetRef.current?.resetCaptcha(); }
        catch { setProblem(unavailable); }
      }
    }
  }, [enabled, misconfigured, clear]);

  return { enabled, siteKey: config.siteKey, attachWidget, onVerify, onExpire, onError, run,
    ready: !enabled || (!misconfigured && verified),
    error: misconfigured ? unavailable : problem, misconfigured };
}

export type AuthCaptchaControl = ReturnType<typeof useAuthCaptcha>;
