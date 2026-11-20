const STAGING_HOST = 'xokiiepdpjvqnpzwmbtb.supabase.co';

function validatePreviewEnvironment(env) {
  if (env.VERCEL_ENV !== 'preview') return;
  let host;
  try { host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname; } catch { /* fail below */ }
  if (host !== STAGING_HOST) {
    throw new Error('Preview builds require the StudySync staging Supabase URL. Configure Preview variables before deploying.');
  }
  for (const [name, prefix] of [['STRIPE_SECRET_KEY', 'sk_test_'], ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_']]) {
    if (env[name] && !env[name].startsWith(prefix)) throw new Error(`${name} must use Stripe test mode in Preview.`);
  }
  // Legacy service-role JWTs include the project ref. Opaque keys must be
  // configured from staging by the operator; their ownership cannot be decoded.
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (key?.split('.').length === 3) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { /* fail below */ }
    if (payload?.ref !== STAGING_HOST.split('.')[0]) throw new Error('Preview service-role key belongs to a different Supabase project.');
  }
}
module.exports = { validatePreviewEnvironment };
if (require.main === module) {
  try { validatePreviewEnvironment(process.env); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
