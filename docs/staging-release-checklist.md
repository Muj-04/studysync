# Staging verification and release checklist

Updated 28 October 2026 after reconciliation with owner acceptance and the overnight audit handoff. This supersedes the pre-integration status in the audit/readiness reports; it does not authorize a production release.

## Verified baseline

- PRs #15–#20 are merged into `dev` at `179d789031c9fa4410197fc90a2c85cd63629e0c`.
- The merged tree exactly matches the locally tested integration: 136 tests passed, TypeScript and production build passed, ESLint zero errors / 28 warnings. Local Chromium confirmed protected navigation preserves the destination and login renders without page errors.
- [GitHub CI](https://github.com/Muj-04/studysync/actions/runs/40597418865) passed on that exact commit.
- [Combined Vercel Preview](https://pdf-study-workspace-ixc8e9ba2-muj-04s-projects.vercel.app) deployed successfully. Requests from this session redirect to Vercel SSO, so hosted authenticated browser acceptance is not claimed.
- Production `main` remains `0b28bd297b4b05e1b7f1878bda5667c413f76f81`.
- Operator CLI output confirms separate Production and Preview entries for Supabase URL, anon key and service-role key. Values were entered by the owner; listing assignments alone does not verify every stored value. Preview build guards passed.
- Owner reported successful sign-in, password reset, and PDF persistence across refresh/logout on the earlier PR20 Preview. Those are useful acceptance results, not proof of every combined-release path. Fresh signup confirmation and PDF deletion/reappearance were not separately confirmed.

## Auth checks performed now

Only the staging project `xokiiepdpjvqnpzwmbtb` was contacted, using its public publishable key. No accounts, email messages, production requests or configuration changes were made.

### CAPTCHA: backend rejection and owner challenge/login verified

Update after the owner enabled Turnstile in staging Supabase Auth: the bounded two-request probe now passes (`captchaRejectionVerified: true`, two HTTP 400 responses with CAPTCHA rejection, completed normally). Missing and deliberately invalid tokens are rejected. No account was created or accessed. The owner subsequently verified successful legitimate sign-in with CAPTCHA enforcement enabled. This is owner acceptance, not a new automated provider test.

Earlier diagnostic evidence: the existing bounded `scripts/auth-abuse-check.cjs` probe made two sequential password-grant requests: one without a token and one with a deliberately invalid token. Both returned HTTP 400; `captchaRejectionVerified` was false. A repeated pair and two diagnostic requests (six password-grant requests total) established that both cases return `error_code: invalid_credentials`, not `captcha_failed`. Random nonexistent `example.invalid` addresses were used. No valid password/session was obtained, and no load/rate-limit test was attempted.

The frontend passes `captchaToken` to signup, password login and password reset. The earlier invalid-credentials responses below predate the corrected staging configuration and are superseded by the passing rejection probes and owner login acceptance.

Configuration completed by owner (not directly inspected): in **StudySync-Staging → Authentication → Bot and Abuse Protection**, verify CAPTCHA protection is enabled, provider is **Cloudflare Turnstile**, and the secret belongs to the widget whose site key is used in Preview. The secret belongs in Supabase Auth, never a browser/public variable. The connected Supabase tool returned `Unknown tool`, and available tools expose no working Auth configuration editor; this setting was not inspected or modified.

Completion evidence: the existing two-request probe now returns CAPTCHA rejection for both cases. The owner also completed a successful legitimate challenge/login after enabling enforcement. A failed probe is not proof that a real account was accessed; conversely, invalid-credential rejection is not proof CAPTCHA is enforced.

### Redirect allowlist: verified for the combined Preview

After the owner saved the combined Preview Site URL and added both redirects, three non-following fabricated-token checks passed: `/auth/callback` retained its requested destination, `/reset-password` retained its requested destination, and an untrusted `example.invalid` destination fell back to the combined Preview root. This verifies redirect selection, not successful confirmation/recovery or session establishment.

Earlier diagnostic results (now superseded): three non-following verification requests with a fabricated 64-character token tested redirect selection without sending mail or authenticating a user:

| Requested destination | Observed HTTP 303 Location origin/path |
| --- | --- |
| Earlier Preview `/auth/callback` | Earlier Preview `/auth/callback` |
| Combined Preview `/auth/callback` | Earlier Preview root |
| Untrusted `https://example.invalid/auth/callback` control | Earlier Preview root |

Earlier Preview: `pdf-study-workspace-atzrj11qp-muj-04s-projects.vercel.app`.
Combined Preview: `pdf-study-workspace-ixc8e9ba2-muj-04s-projects.vercel.app`.

Those historical requests showed the older callback accepted, the then-new callback falling back to the older Site URL, and the untrusted destination rejected; the later allowlist verification above supersedes that mismatch. They do not validate a real confirmation token or session exchange.

Required staging URL configuration:

- Site URL: `https://pdf-study-workspace-ixc8e9ba2-muj-04s-projects.vercel.app`
- Add redirect: `https://pdf-study-workspace-ixc8e9ba2-muj-04s-projects.vercel.app/auth/callback`
- Add redirect: `https://pdf-study-workspace-ixc8e9ba2-muj-04s-projects.vercel.app/reset-password`
- Check that the combined hostname is authorized on the Turnstile widget. Its current dashboard allowlist cannot be read from this session.

Prefer a verified stable dev hostname for ongoing acceptance, then use that same origin in Supabase and Turnstile. Do not broadly allow arbitrary Vercel tenant domains. Preserve Production configuration. For a future hostname change, repeat the redirect probe after configuration; a fresh email flow is separate evidence.

## Release gates versus follow-up work

| Priority | Item | Required evidence / decision |
| --- | --- | --- |
| Verified prior acceptance | Backend CAPTCHA and combined Preview redirects | Backend negative CAPTCHA probes and combined Preview redirect selection pass; owner legitimate challenge/login after enforcement also passed. This Auth gate is satisfied for the previously verified Preview; a new hostname requires applicable allowlist verification. |
| Block release | Backup/restore and migration rollout | Verify production backup plus a restore exercise; reconcile migration contents/history and coordinate billing lease migration with application rollout. No production migration is authorized by this checklist. |
| Block release | Entitlement policy | Reconcile staging free-launch limits with plan-based UI and server enforcement before claiming supported plans. |
| Block affected features | Stripe | Deferred at owner request. Real checkout/webhook/portal acceptance is outstanding; passing builds are not provider acceptance. Do not enable paid launch without it. |
| Block affected features | LiveKit and recording | Verify test-project isolation, two-user room lifecycle, microphone permissions, recording lifecycle and cleanup before enabling those release features. |
| Before public scale | Distributed abuse controls | Process-local AI throttling is not a global cap. Verify trusted ingress headers and shared/edge limits before claiming resistance to sustained distributed requests. |
| Follow-up engineering | Large components and warnings | Continue cohesive extraction of workspace/room/PDF/community components and address 28 lint warnings; these counts alone do not block staging. |
| Follow-up risk review | Referral collisions and room token revocation | Decide collision recovery and whether four-hour room tokens meet the access-revocation policy; block affected features if immediate revocation is required. |
| Separate release track | Android | Emulator HTTP/debug configuration and unverified native build pipeline mean Android is not release-ready. This does not independently block web staging. |

## Minimal next actions

1. Staging Auth CAPTCHA was enabled by the owner and backend rejection verified. The combined Preview Site URL and callback/recovery redirects are also configured and verified; no repeat manual test tour is needed.
2. Backend CAPTCHA and redirect checks passed and are recorded above. The owner verified legitimate challenge/login after enforcement; current Turnstile hostname authorization has not been independently inspected.
3. Keep Stripe acceptance deferred, document which provider features are excluded from any release, and resolve backup/migration/entitlement gates before proposing a `main` merge.

References: [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls), [Turnstile hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/).

## Subsequent audit evidence

The 179-test report covered the first six audit fixes; the later 225-test integration added the overnight fixes and five additional #27 regressions. These are successive suites, not conflicting results or counts to add. See [the current QA handoff](qa-handoff-2026-10-28.md) for the final review/integration status and limitations. Live peer voice-note title updates are fixed by #31; missed events during reconnect remain a separate issue.
