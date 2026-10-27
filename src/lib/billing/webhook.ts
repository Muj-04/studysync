import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

const paidPlan = (value: unknown) => value === 'premium' || value === 'pro' ? value : null;
const stripeId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id ?? null;

/** Only acknowledge an event after the entitlement transaction commits. */
export async function applyBillingEvent(admin: SupabaseClient, event: Stripe.Event) {
  let userId: string | null = null;
  let plan: string | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let status: string;
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.metadata?.userId) return;
      if (!['paid', 'no_payment_required'].includes(session.payment_status)) return;
      userId = session.metadata.userId;
      plan = paidPlan(session.metadata.plan);
      if (!plan) throw new Error('Invalid subscription plan');
      customerId = stripeId(session.customer);
      subscriptionId = stripeId(session.subscription);
      status = 'active';
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      subscriptionId = sub.id;
      customerId = stripeId(sub.customer);
      plan = paidPlan(sub.metadata.plan);
      status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
      break;
    }
    default: return;
  }
  if (!subscriptionId) throw new Error('Subscription ID missing');
  const { error } = await admin.rpc('apply_billing_event', {
    p_event_id: event.id, p_created: event.created, p_user_id: userId,
    p_plan: plan, p_customer_id: customerId, p_subscription_id: subscriptionId, p_status: status,
  });
  if (error) throw new Error(`Billing transaction failed: ${error.message}`);
}
