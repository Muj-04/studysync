# Authentication abuse protection implementation plan

**Goal:** Implement the user's requested CAPTCHA, provider rate-limit/firewall checks,
and bounded staging verification, without falsely claiming unconfigured services
are enforcing protection.

**Architecture:** Password authentication continues directly through Supabase Auth.
Use the official hCaptcha React component and pass one-use tokens to Supabase,
where CAPTCHA enforcement must be enabled. Vercel protects site traffic separately.
No in-memory login limiter or client-only CAPTCHA is represented as a security boundary.

**Authorization:** User explicitly requested the previously proposed protections.
hCaptcha follows the user's preference to remove Cloudflare. Implement on the
existing reviewed branch; production rollout remains gated by the release plan.

## Implementation

- [ ] Add a shared CAPTCHA lifecycle hook and widget. Use a public site key only;
  keep the provider secret exclusively in Supabase Auth settings. When explicitly
  enabled but misconfigured, fail closed with a useful user-facing error.
- [ ] Integrate password login, signup, password-reset requests and Settings
  password confirmation. Clear consumed tokens on every attempt; handle expiry,
  challenge/network errors and retries without stuck loading states.
- [ ] Test token requirement, consumption, expiry and disabled/missing-key modes,
  then verify actual forms forward tokens to the SDK. Use hCaptcha test keys only
  for local/staging tests, never as production protection.
- [ ] Inspect available provider configuration access; document exact missing
  configuration without reading or printing credential values.
- [ ] Add bounded staging-only Auth probes that cannot send emails or create
  users; stop on unexpected success, 5xx, timeouts or throttling. No 20,000-request
  attack simulation against production or shared infrastructure.
- [ ] Prepare Vercel auth-page rate-limit and alert instructions from official
  docs, excluding webhooks and static assets. Apply only with actual provider access.
- [ ] Run focused tests, full tests, TypeScript/build, independent review; update
  PR and report code readiness separately from live enforcement.

## Activation order

Deploy compatible frontend/config to an isolated staging deployment first. Enable
the matching hCaptcha secret and provider switch in staging Supabase, verify direct
Auth requests with missing/invalid tokens are rejected and a solved challenge works.
Then schedule coordinated production frontend/provider activation; do not enable
Supabase CAPTCHA before every deployed password-based client supports it.

## Constraints

Existing clients without configured CAPTCHA retain current behavior until explicit
activation. This is migration compatibility, not a promise of protection. Provider
rate limits remain essential and must be independently verified. Existing sessions,
refresh tokens and OAuth flows must not be wrapped in password CAPTCHA accidentally.

## Execution result

Implementation, form integration, bounded probe tooling and activation instructions
are complete. 77 tests, TypeScript, production build and browser fail-closed checks
passed; independent review found no high/medium issue. Existing touched-page lint
findings are unchanged. Two synthetic staging probes returned HTTP 400 but did
not verify CAPTCHA rejection. No provider settings, firewall rules, alerts or
production deployment were changed: real hCaptcha keys and provider configuration
access are still missing. See `docs/auth-abuse-operations.md` for activation.
