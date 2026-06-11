import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia',
  });
}

const PLAN_CONFIG = {
  premium: {
    monthly: { amount: 499,  label: 'StudySync Premium (Monthly)' },
    yearly:  { amount: 3900, label: 'StudySync Premium (Yearly)'  },
  },
  pro: {
    monthly: { amount: 1399,  label: 'StudySync Pro (Monthly)' },
    yearly:  { amount: 10900, label: 'StudySync Pro (Yearly)'  },
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const { plan, billing, email, userId } = await req.json() as {
      plan: 'premium' | 'pro';
      billing: 'monthly' | 'yearly';
      email: string;
      userId: string;
    };

    if (!plan || !billing || !email || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const config = PLAN_CONFIG[plan]?.[billing];
    if (!config) {
      return NextResponse.json({ error: 'Invalid plan or billing cycle' }, { status: 400 });
    }

    const origin = req.headers.get('origin')
      ?? process.env.NEXT_PUBLIC_APP_URL
      ?? 'http://localhost:3000';

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: config.label,
              description: `StudySync ${plan} plan — billed ${billing}`,
            },
            unit_amount: config.amount,
            recurring: { interval: billing === 'yearly' ? 'year' : 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/pricing?canceled=true`,
      metadata: { userId, plan, billing },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
