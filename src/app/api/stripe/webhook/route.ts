import { apiErrorResponse, readBody } from '@/lib/api/request';
import { applyBillingEvent } from '@/lib/billing/webhook';
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
  try { return await handlePost(req); } catch (error) { return apiErrorResponse(error); }
}

async function handlePost(req: NextRequest) {
  const sig  = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const body = await readBody(req, 1024 * 1024);
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = getAdmin();

  try {
    await applyBillingEvent(admin, event, getStripe());
  } catch (err) {
    console.error('[stripe/webhook] handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
