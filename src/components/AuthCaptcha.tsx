'use client';

import HCaptcha from '@hcaptcha/react-hcaptcha';
import type { AuthCaptchaControl } from '@/hooks/useAuthCaptcha';

export default function AuthCaptcha({ control }: { control: AuthCaptchaControl }) {
  const { enabled, misconfigured, attachWidget, siteKey, onVerify, onExpire, onError, error } = control;
  if (!enabled) return null;
  return (
    <div aria-label="Security verification" style={{ margin: '12px 0' }}>
      {!misconfigured && (
        <HCaptcha
          ref={attachWidget}
          sitekey={siteKey}
          size="compact"
          reCaptchaCompat={false}
          sentry={false}
          onVerify={onVerify}
          onExpire={onExpire}
          onChalExpired={onExpire}
          onError={onError}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
