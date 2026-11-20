import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function prepareCheckout(admin: SupabaseClient, stripe: Stripe, user: { id: string; email: string }, plan: string, billing: string, origin: string) {
  const { data: subscription, error } = await admin.from('subscriptions')
    .select('stripe_subscription_id,stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (subscription?.stripe_subscription_id) {
    const existing = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    if (!['canceled', 'incomplete_expired'].includes(existing.status)) {
      const customer = typeof existing.customer === 'string' ? existing.customer : existing.customer.id;
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/pricing` });
      return { url: portal.url };
    }
  }
  // A completed attempt may precede its webhook: never open a second checkout then.
  const { data: previous, error: previousError } = await admin.from('billing_checkout_attempts')
    .select('stripe_session_id').eq('user_id', user.id).maybeSingle();
  if (previousError) throw previousError;
  if (previous?.stripe_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(previous.stripe_session_id);
    if (existing.status === 'complete' && existing.subscription) {
      const id = typeof existing.subscription === 'string' ? existing.subscription : existing.subscription.id;
      const sub = await stripe.subscriptions.retrieve(id);
      if (!['canceled', 'incomplete_expired'].includes(sub.status)) {
        const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        return { url: (await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/pricing` })).url };
      }
    }
  }
  const { data, error: reservationError } = await admin.rpc('reserve_checkout_attempt', {
    p_user_id: user.id, p_plan: plan, p_billing: billing, p_email: user.email, p_origin: origin,
  });
  if (reservationError) throw new Error(reservationError.message);
  const attempt = data?.[0] as { attempt_id: string; email: string; return_origin: string; expires_at: number; stripe_session_id: string | null } | undefined;
  if (!attempt) throw new Error('Could not reserve checkout');
  if (attempt.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
    if (session.status === 'open' && session.url) return { url: session.url };
    throw new Error('Checkout is being processed or has expired. Please try again later.');
  }
  return { attempt, customerId: subscription?.stripe_customer_id as string | undefined };
}
