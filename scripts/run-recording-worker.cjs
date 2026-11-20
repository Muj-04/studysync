#!/usr/bin/env node
// Explicit one-shot operation. Nothing schedules or deploys this worker.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const args = process.argv.slice(2);
if (!args.includes('--run')) {
  console.log('Usage: node scripts/run-recording-worker.cjs --run [--limit=20]\nRequires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. One bounded pass; no automatic schedule.');
  process.exit(args.includes('--help') ? 0 : 1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Worker server configuration is missing.'); process.exit(1); }
const requested = Number(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? 20);
if (!Number.isInteger(requested) || requested < 1 || requested > 20) { console.error('Limit must be between 1 and 20.'); process.exit(1); }
const file = path.join(__dirname, '../src/lib/server/recordingWorker.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(require, loaded, loaded.exports);
const passDeadline = AbortSignal.timeout(60_000);
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.any([passDeadline, AbortSignal.timeout(10_000), ...(init.signal ? [init.signal] : [])]) }),
} });
loaded.exports.runRecordingRecoveryWorker(client, { limit: requested }).then(result => console.log(JSON.stringify(result))).catch(() => { console.error('Worker pass failed; unfinished leases remain recoverable.'); process.exitCode = 1; });
