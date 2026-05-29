import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Lazy initialize Stripe to avoid build-time errors
let stripe: Stripe;
function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-02-24.acacia',
    });
  }
  return stripe;
}

const PRICE_IDS = {
  GOLD_MONTHLY: process.env.STRIPE_GOLD_MONTHLY_PRICE_ID || 'price_gold_monthly',
  GOLD_ANNUAL: process.env.STRIPE_GOLD_ANNUAL_PRICE_ID || 'price_gold_annual',
  DIAMOND_MONTHLY: process.env.STRIPE_DIAMOND_MONTHLY_PRICE_ID || 'price_diamond_monthly',
  DIAMOND_ANNUAL: process.env.STRIPE_DIAMOND_ANNUAL_PRICE_ID || 'price_diamond_annual',
};

/**
 * POST /api/stripe/checkout
 * Create a Stripe Checkout session for subscription
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tier, billingPeriod, userId, userEmail } = body;

    // Validate inputs
    if (!tier || !billingPeriod || !userId || !userEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the appropriate price ID
    let priceId: string;
    if (tier === 'gold' && billingPeriod === 'monthly') {
      priceId = PRICE_IDS.GOLD_MONTHLY;
    } else if (tier === 'gold' && billingPeriod === 'annual') {
      priceId = PRICE_IDS.GOLD_ANNUAL;
    } else if (tier === 'diamond' && billingPeriod === 'monthly') {
      priceId = PRICE_IDS.DIAMOND_MONTHLY;
    } else if (tier === 'diamond' && billingPeriod === 'annual') {
      priceId = PRICE_IDS.DIAMOND_ANNUAL;
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid tier or billing period' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    // Create Checkout Session
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: {
        userId,
        tier,
        billingPeriod,
      },
      subscription_data: {
        metadata: {
          userId,
          tier,
        },
        trial_period_days: tier === 'gold' ? 7 : 14, // Gold: 7 days, Diamond: 14 days
      },
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create checkout session' 
      },
      { status: 500 }
    );
  }
}
