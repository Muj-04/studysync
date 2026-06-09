// Runs once per cold-start on the server. Logs missing vars so they surface
// immediately in Vercel Function logs rather than surfacing as cryptic runtime
// errors deep inside a request handler.

const REQUIRED: Array<[string, string]> = [
  ['NEXT_PUBLIC_SUPABASE_URL',       'Supabase client'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY',  'Supabase client'],
  ['ANTHROPIC_API_KEY',              '/api/ai'],
  ['STRIPE_SECRET_KEY',              '/api/stripe/checkout'],
  ['STRIPE_WEBHOOK_SECRET',          '/api/stripe/webhook'],
  ['SUPABASE_SERVICE_ROLE_KEY',      '/api/stripe/webhook'],
];

if (typeof window === 'undefined') {
  const missing = REQUIRED.filter(([key]) => !process.env[key]);
  if (missing.length > 0) {
    const lines = missing.map(([k, used]) => `  ${k}  (used by ${used})`).join('\n');
    console.error(`[env] Missing environment variables:\n${lines}`);
  }
}
