# Authentication abuse protection operations

Prepared 2026-10-26. This is an activation runbook and a proposed firewall rule, not evidence of live enforcement. Available Supabase SQL access does not inspect or configure hosted Auth settings; Vercel provider access was unavailable (plugin discovery reported not installed). No Auth settings, Vercel rules, alert subscriptions, or production configuration were changed by this work. Exactly two authorized staging diagnostic password-sign-in probes ran on 2026-10-26: both returned HTTP 400, and the pair did not verify `captcha_failed` rejection (`captchaRejectionVerified: false`). No rate probe ran and no 429 was observed. The tool discarded other response details; generic HTTP 400 cannot establish CAPTCHA enforcement. Current production CAPTCHA enforcement and actual Auth rate-limit values remain unknown; no provider Auth configuration has been inspected or verified.

## Enable hCaptcha at the enforcement point

Public variables are compiled into the Next.js client bundle. After setting or
changing them, rebuild and redeploy the frontend; changing runtime variables
alone is insufficient. A public-only template is in `auth-protection.env.example`.

Deploy the compatible password-auth frontend to isolated staging first. Set `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` to its public hCaptcha site key (presence enables the widget) and `NEXT_PUBLIC_AUTH_CAPTCHA_REQUIRED=true` to fail closed when that key is missing. The well-known always-pass public test site key is rejected in production builds; reserve them for local/development testing. Restrict the hCaptcha site to the intended deployment hostnames. Keep the matching secret only in Supabase, never in `NEXT_PUBLIC_*`, repository files, logs, or CLI arguments. Test keys are suitable only for isolated testing; they provide no production bot protection.

For staging project `xokiiepdpjvqnpzwmbtb`, open Supabase Dashboard → Settings → Authentication → Bot and Abuse Protection → Enable CAPTCHA protection. Select **hCaptcha**, enter the matching secret, save, and confirm the switch remains enabled. The frontend must pass each fresh solved token as `options.captchaToken` and reset it after each request. [Supabase CAPTCHA documentation](https://supabase.com/docs/guides/auth/auth-captcha).

Record confirmation of the provider, enabled state, site-key/environment association and operator/time without copying secret values. Verify missing/invalid token rejection with the two-request check below. Separately verify a solved challenge through the staging UI with a designated disposable test account: login, signup, password-reset request, and Settings password confirmation. Such manual lifecycle tests are separate from this script and may send mail; use only designated test inboxes. Check expiry, retry, and network failure as well. Never reuse challenge tokens.

Coordinate production frontend/provider activation only after all deployed password-based clients support CAPTCHA, including Settings confirmation. Existing sessions, refresh and OAuth flows should continue normally. Do not claim frontend rendering alone protects direct Auth requests. If deployment recovery requires removing enforcement, record that exposure explicitly; prefer fixing or restoring a compatible frontend while retaining provider protection.

## Bounded staging checks

The script needs Node 22+ and an operator-provided **staging publishable key** in `AUTH_ABUSE_STAGING_PUBLISHABLE_KEY`. It does not load `.env` files. It rejects secret keys and legacy JWT/anon keys. Provide the public key through your normal environment injection; do not paste credentials into transcripts. Confirm the staging project identity before running. These diagnostic rejection probes can also establish whether CAPTCHA enforcement is missing:

```sh
node scripts/auth-abuse-check.cjs --help
node scripts/auth-abuse-check.cjs --confirm-staging
```

The default sends exactly two sequential password-sign-in requests: missing CAPTCHA, then a deliberately invalid token. It only accepts the exact HTTPS origin `https://xokiiepdpjvqnpzwmbtb.supabase.co`; there is no target override. Redirects stop the run. Each request uses a newly generated synthetic `@example.invalid` address and random password. No real account input is accepted, and no signup, reset, email, OTP, refresh or account-creation endpoints are called.

`captchaRejectionVerified: true` requires both responses to report `captcha_failed`. Generic invalid-credential errors do not prove CAPTCHA enforcement. This verifies rejection only, not that valid human challenges work. Status counts and fixed outcome labels are emitted; bodies, identities, keys, passwords and tokens are never printed.

An optional separate rate observation uses the same synthetic password requests:

```sh
node scripts/auth-abuse-check.cjs --confirm-staging --mode rate-limit --count 6
```

The rate mode defaults to six requests and allows at most forty per invocation. Concurrency is fixed at one, spacing is at least one second after the previous response, and each request has a ten-second deadline including response-body reading. There are no retries. Success, redirects, 429, 5xx, unexpected statuses, malformed responses, network failures and timeouts stop immediately. Do not loop invocations to evade the request budget or run simultaneous copies.

Exit `0` means the selected observation succeeded: both CAPTCHA errors for CAPTCHA mode, or an observed 429 for rate mode. Exit `2` means inconclusive or stopped; exit `1` means invalid invocation/configuration. A 429 during CAPTCHA verification stops the run and does not verify CAPTCHA. Any 2xx is unexpected and needs investigation.

**No 429 means inconclusive, never “rate limiting is active” or “disabled.”** CAPTCHA rejection can occur before a relevant limiter. Even an observed 429 does not identify its source or prove specific configured quotas; correlate provider logs. Check the actual staging Auth rate-limit settings and record them without assuming defaults. Supabase documents IP-based token-bucket limits and 429 responses, with `/auth/v1/token` covering password and other token grants; a short slow probe may not exhaust its bucket. [Supabase rate-limit documentation](https://supabase.com/docs/guides/auth/rate-limits).

## Proposed Vercel auth-page rule

This limits page traffic reaching Vercel; browser password requests go directly to Supabase and require the separate protections above. Do not describe this rule as a Supabase login-attempt limiter.

In the intended Vercel project, open **Firewall → Configure → New Rule**. Proposed configuration:

| Field | Value |
| --- | --- |
| Name | `auth-pages-per-ip` |
| Match | Request Path exactly equals any of `/login`, `/register`, `/forgot-password`, `/reset-password` (OR group) |
| Action | Rate Limit |
| Strategy | Fixed Window |
| Time window | 60 seconds |
| Request limit | 60 |
| Counting key | IP address only, shared across the four paths |
| Follow-up action, initial | Log |
| Follow-up action, after review | Default (429) |

Do not combine the four equalities with AND. Do not use prefix/contains matching or a sitewide wildcard. No method filter is proposed, so navigation and prefetch requests count. Exact paths exclude API/webhook endpoints, auth callbacks, static assets and `/_next/*`. Do not enable persistent IP actions that affect other paths. Review canonical/trailing-slash behavior and real traffic before extending path coverage.

Save the draft and inspect **Review Changes**. **Publish applies live firewall changes**; use the project's release gate. First publish Log mode, inspect rule traffic in Firewall, and collect representative normal traffic before switching to 429. Confirm current plan allowances and billing in the dashboard. These are proposed values, not provider defaults or applied settings. [Vercel rate-limit setup](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [custom-rule guidance](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules).

Shared school, campus, office and mobile-network IPs can represent many legitimate users. Assess peak page loads/prefetches under those networks; tune the threshold or retain Log mode if false positives are likely. Inspect both the live ten-minute and longer traffic views. On false positives after enforcement, switch the follow-up action back to Log and review the threshold. Record rule ID, actual settings, activation time and observed counts separately from this proposal.

## Alerts and evidence

Review **Firewall → Overview → Alerts** and **Traffic**, filtering by this rule, action, path and client IP. Subscribe to **Attack Detected Firewall Event** through a Vercel webhook or existing approved Slack integration. Vercel's documented DDoS alert threshold is large-volume traffic; it is not an alert for every authentication spike or 429. [Firewall observability and alerts](https://vercel.com/docs/vercel-firewall/firewall-observability).

Where the account's plan supports it, open **Observability → Alerts → Subscribe to Alerts** for usage/error anomaly notifications; select the project's existing operator channel. Availability depends on the account plan. No integration subscriptions or outgoing notifications have been created here. [Vercel alerts](https://vercel.com/docs/alerts).

Operationally review sustained Auth 429 rates, CAPTCHA failure changes, auth 5xx/timeouts, unexpected sign-in success and legitimate-user failures alongside Vercel traffic. Configure additional monitoring in an approved existing telemetry destination when available; do not pretend platform DDoS notifications cover Supabase Auth. Keep only aggregate counts and redacted error codes. Record actual provider configuration and staging observations before marking either control enforced.

Local verification (no hosted requests):

```sh
node --test tests/auth-abuse-check.test.cjs
npm test
```

## Implementation verification

- Full application suite: 77 passed, zero failed, including CAPTCHA lifecycle,
  actual login/register/reset handlers and bounded probe failure cases.
- Chromium checked all three public password forms with required CAPTCHA and a
  missing key: each displayed the unavailable message and disabled submission,
  with no page errors. This is a configuration-failure test, not a solved live
  challenge or server-enforcement test.
- Independent code review found no high/medium issue. Settings token forwarding
  was reviewed and typechecked, but not exercised with a live signed-in account.
- Production build with required-CAPTCHA configuration passed. New hook/widget,
  probe and tests pass scoped lint. The touched pages retain their existing lint
  baseline (one login effect error and four Settings warnings); no new findings.
- The pinned hCaptcha dependency installation reported zero audit vulnerabilities.
