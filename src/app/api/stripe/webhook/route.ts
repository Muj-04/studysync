import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia',
  });
}

// Service-role client bypasses RLS for webhook writes
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Next.js App Router — disable body parsing so we get the raw buffer for Stripe signature verification
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = getAdmin();

  try {
    switch (event.type) {
      // ── Payment succeeded → upgrade plan ──────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, plan } = session.metadata ?? {};
        if (!userId || !plan) break;

        await Promise.all([
          admin.from('profiles').update({ plan }).eq('id', userId),
          admin.from('subscriptions').upsert(
            {
              user_id:                userId,
              plan,
              status:                 'active',
              stripe_customer_id:     session.customer as string ?? null,
              stripe_subscription_id: session.subscription as string ?? null,
              updated_at:             new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          ),
        ]);
        console.log(`[stripe/webhook] upgraded ${userId} → ${plan}`);
        break;
      }

      // ── Subscription renewed — update period end ──────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const { data } = await admin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();
        if (data?.user_id) {
          await admin.from('subscriptions').update({
            status:     sub.status,
            updated_at: new Date().toISOString(),
          }).eq('user_id', data.user_id);
        }
        break;
      }

      // ── Subscription canceled → downgrade to free ──────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data } = await admin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();
        if (data?.user_id) {
          await Promise.all([
            admin.from('profiles').update({ plan: 'free' }).eq('id', data.user_id),
            admin.from('subscriptions').update({
              plan: 'free', status: 'canceled', updated_at: new Date().toISOString(),
            }).eq('user_id', data.user_id),
          ]);
          console.log(`[stripe/webhook] downgraded ${data.user_id} → free`);
        }
        break;
      }

      default:
        console.log(`[stripe/webhook] unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error('[stripe/webhook] handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
