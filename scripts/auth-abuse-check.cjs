#!/usr/bin/env node
'use strict';

const { randomUUID, randomBytes } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const TARGET = 'https://xokiiepdpjvqnpzwmbtb.supabase.co';

async function runProbe(options = {}, dependencies = {}) {
  const allowed = new Set(['target', 'apiKey', 'stagingConfirmed', 'mode', 'count', 'intervalMs', 'timeoutMs', 'concurrency']);
  if (Object.keys(options).some(key => !allowed.has(key))) throw Error('Unsupported probe option.');
  const { target = TARGET, apiKey, stagingConfirmed, mode = 'captcha', count = mode === 'captcha' ? 2 : 6, intervalMs = 1000, timeoutMs = 10000, concurrency = 1 } = options;
  // Compare the input itself: URL normalization must not broaden the allowlist.
  if (target !== TARGET) throw Error('Only the exact allowlisted staging HTTPS origin is permitted.');
  if (stagingConfirmed !== true) throw Error('Confirm the staging target before probing.');
  if (typeof apiKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(apiKey)) throw Error('A staging publishable API key is required; secret and legacy JWT keys are refused.');
  if (!['captcha', 'rate-limit'].includes(mode) || !Number.isInteger(count) || count < 1 || count > 40 || (mode === 'captcha' && count !== 2)) throw Error('Use captcha (exactly 2 requests) or rate-limit (1–40 requests).');
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10000 || concurrency !== 1) throw Error('Use sequential requests, 1000–60000 ms spacing and 1000–10000 ms timeout.');
  const request = dependencies.fetch || globalThis.fetch;
  const wait = dependencies.sleep || sleep;
  const summary = { mode, attempted: 0, statusCounts: {}, stopReason: 'completed', captchaRejectionVerified: false, rateLimitObserved: false };
  let captchaRejections = 0;
  for (let index = 0; index < count; index++) {
    if (index > 0) await wait(intervalMs);
    const controller = new AbortController();
    let timer;
    let timedOut = false;
    const body = { email: `auth-probe-${randomUUID()}@example.invalid`, password: randomBytes(32).toString('hex') };
    if (mode === 'rate-limit' || index === 1) body.gotrue_meta_security = { captcha_token: 'deliberately-invalid-captcha-token' };
    summary.attempted++;
    try {
      const result = await Promise.race([
        (async () => {
          const response = await request(`${TARGET}/auth/v1/token?grant_type=password`, {
            method: 'POST', redirect: 'manual', signal: controller.signal,
            headers: { apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          const status = response.status;
          summary.statusCounts[status] = (summary.statusCounts[status] || 0) + 1;
          if (status >= 200 && status < 300) return { stop: 'unexpected-success' };
          if (status === 429) return { stop: 'rate-limited' };
          if (status >= 500) return { stop: 'server-error' };
          if (status >= 300 && status < 400) return { stop: 'redirect' };
          if (![400, 422].includes(status)) return { stop: 'unexpected-status' };
          // Read only a small error body; never log bodies, headers, keys or tokens.
          const reader = response.body?.getReader();
          if (!reader) return { stop: 'invalid-response' };
          const chunks = []; let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 8192) { await reader.cancel(); return { stop: 'invalid-response' }; }
            chunks.push(Buffer.from(value));
          }
          let data;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return { stop: 'invalid-response' }; }
          return { captchaRejected: data?.code === 'captcha_failed' || data?.error_code === 'captcha_failed' };
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(Error('timeout')); }, timeoutMs); }),
      ]);
      if (result.stop) {
        summary.stopReason = result.stop;
        summary.rateLimitObserved = result.stop === 'rate-limited';
        break;
      }
      if (result.captchaRejected) captchaRejections++;
    } catch {
      summary.stopReason = timedOut ? 'timeout' : 'network-error';
      break;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  summary.captchaRejectionVerified = mode === 'captcha' && summary.stopReason === 'completed' && captchaRejections === 2;
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/auth-abuse-check.cjs --confirm-staging [--mode captcha|rate-limit] [--count 1..40]\nRequires AUTH_ABUSE_STAGING_PUBLISHABLE_KEY (sb_publishable_ key).\nTarget is fixed to xokiiepdpjvqnpzwmbtb; no .env files are loaded.\nDefault: 2 CAPTCHA probes, 1 concurrent request, >=1s spacing, 10s timeout.\nRate-limit mode defaults to 6 requests, maximum 40. No 429 means inconclusive.');
    return;
  }
  const options = { apiKey: process.env.AUTH_ABUSE_STAGING_PUBLISHABLE_KEY };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw Error('Duplicate option.');
    seen.add(arg);
    if (arg === '--confirm-staging') options.stagingConfirmed = true;
    else if (arg === '--mode' && args[index + 1]) options.mode = args[++index];
    else if (arg === '--count' && args[index + 1]) options.count = Number(args[++index]);
    else throw Error('Unknown or incomplete option; use --help.');
  }
  const summary = await runProbe(options);
  console.log(JSON.stringify(summary, null, 2));
  // A rate probe without a 429 is inconclusive, not a successful verification.
  process.exitCode = (summary.mode === 'captcha' ? summary.captchaRejectionVerified : summary.rateLimitObserved) ? 0 : 2;
}

module.exports = { runProbe };
if (require.main === module) main().catch(() => { console.error('Probe refused or failed. Check --help, staging confirmation, and publishable-key configuration.'); process.exitCode = 1; });
