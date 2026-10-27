import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

const paidPlan = (value: unknown) => value === 'premium' || value === 'pro' ? value : null;
const stripeId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id ?? null;

/** A database lease fences the provider read, not just the eventual SQL write. */
export async function applyBillingEvent(admin: SupabaseClient, event: Stripe.Event, stripe: Stripe) {
  return reconcileBillingEvent(admin, event, stripe, true);
}

async function reconcileBillingEvent(admin: SupabaseClient, event: Stripe.Event, stripe: Stripe, repairLegacy: boolean): Promise<void> {
  let subscriptionId: string | null;
  let checkoutMetadata: Stripe.Metadata | null = null;
  let checkoutCustomer: string | null = null;
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') return;
      subscriptionId = stripeId(session.subscription);
      checkoutMetadata = session.metadata;
      checkoutCustomer = stripeId(session.customer);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      subscriptionId = event.data.object.id;
      break;
    default: return;
  }
  if (!subscriptionId) throw new Error('Subscription ID missing');
  const { data: lease, error: claimError } = await admin.rpc('claim_billing_reconciliation', {
    p_subscription_id: subscriptionId, p_event_id: event.id,
  });
  if (claimError) throw new Error(`Billing reconciliation failed: ${claimError.message}`);
  if (lease?.processed) return;
  if (!lease?.token) throw new Error('Billing reconciliation lease missing');
  let legacySubscriptionId: string | null = null;
  try {
    // Never fall back to the event snapshot, including on 404, timeout or deletion.
    // Stripe normally retains canceled subscriptions for retrieval. Missing resources
    // need retry/operator investigation, not an invented entitlement decision.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = stripeId(sub.customer);
    if (sub.id !== subscriptionId || (checkoutCustomer && checkoutCustomer !== customerId)) {
      throw new Error('Subscription identity mismatch');
    }
    if (checkoutMetadata?.userId && sub.metadata.userId && checkoutMetadata.userId !== sub.metadata.userId) {
      throw new Error('Subscription owner mismatch');
    }
    if (sub.metadata.plan && !paidPlan(sub.metadata.plan)) throw new Error('Invalid subscription plan');
    const { error } = await admin.rpc('commit_billing_reconciliation', {
      p_event_id: event.id, p_created: event.created,
      p_user_id: sub.metadata.userId || checkoutMetadata?.userId || null,
      p_plan: paidPlan(sub.metadata.plan) ?? paidPlan(checkoutMetadata?.plan),
      p_customer_id: customerId, p_subscription_id: subscriptionId, p_status: sub.status,
      p_token: lease.token, p_subscription_created: sub.created,
    });
    if (error) {
      const userId = sub.metadata.userId || checkoutMetadata?.userId;
      if (!repairLegacy || !userId || error.message !== 'Reconcile existing subscription before replacement') {
        throw new Error(`Billing transaction failed: ${error.message}`);
      }
      const { data: existing, error: lookupError } = await admin.from('subscriptions')
        .select('stripe_subscription_id').eq('user_id', userId).maybeSingle();
      if (lookupError || !existing?.stripe_subscription_id || existing.stripe_subscription_id === subscriptionId) {
        throw new Error(`Billing transaction failed: ${lookupError?.message ?? error.message}`);
      }
      legacySubscriptionId = existing.stripe_subscription_id;
    }
  } finally {
    // If cleanup fails, expiry permits recovery; never hide the original failure.
    try {
      await admin.rpc('release_billing_reconciliation', { p_subscription_id: subscriptionId, p_token: lease.token });
    } catch { /* durable lease expires */ }
  }
  if (legacySubscriptionId) {
    // Release the new subscription before acquiring the old one's lease. Populate
    // legacy creation time from Stripe, then reacquire AND reread the replacement.
    const repairEvent = {
      ...event,
      id: `reconcile:${event.id}:${legacySubscriptionId}`,
      type: 'customer.subscription.updated',
      data: { object: { id: legacySubscriptionId } },
    } as Stripe.Event;
    await reconcileBillingEvent(admin, repairEvent, stripe, false);
    await reconcileBillingEvent(admin, event, stripe, false);
  }
}
