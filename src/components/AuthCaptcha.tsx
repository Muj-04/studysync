'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import type { AuthCaptchaControl } from '@/hooks/useAuthCaptcha';

export default function AuthCaptcha({ control }: { control: AuthCaptchaControl }) {
  const { enabled, misconfigured, attachWidget, siteKey, onVerify, onExpire, onError, error } = control;
  if (!enabled) return null;
  return (
    <div aria-label="Security verification" style={{ margin: '12px 0' }}>
      {!misconfigured && (
        <Turnstile
          ref={attachWidget}
          siteKey={siteKey}
          options={{ size: 'compact' }}
          onSuccess={onVerify}
          onExpire={onExpire}
          onTimeout={onExpire}
          onError={onError}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
