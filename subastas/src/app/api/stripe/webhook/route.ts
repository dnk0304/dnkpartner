import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { queryOne, execute } from '@/lib/db';

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

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  const tier = session.metadata?.tier;

  if (!userId || !tier) {
    console.error('Missing userId or tier in session metadata');
    return;
  }

  const subscription = await getStripe().subscriptions.retrieve(
    session.subscription as string
  );

  // Check if subscription exists
  const existing = await queryOne<{ id: string }>(`
    SELECT id FROM Subscription WHERE userId = ?
  `, [userId]);

  const currentPeriodStart = new Date(subscription.current_period_start * 1000).toISOString();
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  if (existing) {
    // Update existing subscription
    await execute(`
      UPDATE Subscription SET
        stripeCustomerId = ?,
        stripeSubscriptionId = ?,
        stripePriceId = ?,
        status = ?,
        tier = ?,
        currentPeriodStart = ?,
        currentPeriodEnd = ?
      WHERE userId = ?
    `, [
      session.customer as string,
      subscription.id,
      subscription.items.data[0].price.id,
      subscription.status,
      tier.toUpperCase(),
      currentPeriodStart,
      currentPeriodEnd,
      userId
    ]);
  } else {
    // Create new subscription
    const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await execute(`
      INSERT INTO Subscription (
        id, userId, stripeCustomerId, stripeSubscriptionId, stripePriceId,
        status, tier, currentPeriodStart, currentPeriodEnd, createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      subId,
      userId,
      session.customer as string,
      subscription.id,
      subscription.items.data[0].price.id,
      subscription.status,
      tier.toUpperCase(),
      currentPeriodStart,
      currentPeriodEnd
    ]);
  }

  // Update user tier
  await execute('UPDATE User SET tier = ? WHERE id = ?', [tier.toUpperCase(), userId]);

  console.log(`✅ Subscription created for user ${userId} - ${tier}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  await execute(`
    UPDATE Subscription SET
      status = ?,
      currentPeriodStart = ?,
      currentPeriodEnd = ?,
      cancelAtPeriodEnd = ?
    WHERE stripeSubscriptionId = ?
  `, [
    subscription.status,
    new Date(subscription.current_period_start * 1000).toISOString(),
    new Date(subscription.current_period_end * 1000).toISOString(),
    !!subscription.cancel_at_period_end,
    subscription.id
  ]);

  console.log(`✅ Subscription updated for user ${userId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  // Update subscription status
  await execute(`
    UPDATE Subscription SET status = 'canceled' WHERE stripeSubscriptionId = ?
  `, [subscription.id]);

  // Downgrade user to FREE tier
  await execute('UPDATE User SET tier = ? WHERE id = ?', ['FREE', userId]);

  console.log(`✅ Subscription canceled for user ${userId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  await execute(`
    UPDATE Subscription SET status = 'past_due' WHERE stripeSubscriptionId = ?
  `, [subscriptionId]);

  console.log(`⚠️ Payment failed for subscription ${subscriptionId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  await execute(`
    UPDATE Subscription SET status = 'active' WHERE stripeSubscriptionId = ?
  `, [subscriptionId]);

  console.log(`✅ Payment succeeded for subscription ${subscriptionId}`);
}
