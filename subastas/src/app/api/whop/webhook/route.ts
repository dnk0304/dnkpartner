/**
 * POST /api/whop/webhook — Feature #10 (embedded Whop payment).
 *
 * Whop is the AUTHORITATIVE source of paid-tier state. The /precios checkout
 * (Pixel's UI) is purely a payment initiator; we NEVER upgrade a user's tier
 * from a client-side success callback (spoofable). The tier write happens here
 * and ONLY here, after the request's HMAC-SHA256 signature is verified against
 * WHOP_WEBHOOK_SECRET.
 *
 * Events we care about:
 *   - membership.activated   → user now has paid access (incl. trial-start
 *                              with `status: "trialing"` — trial is paid access
 *                              by Dennis decision 2026-06-02). Set tier = ACCESO.
 *   - membership.deactivated → cancel / failed payment / trial-expired without
 *                              charge / kicked / refunded. Set tier = FREE.
 *
 * Identity linking: the local user id is carried in the checkout `metadata`
 * (Pixel passes it when launching the embed). Whop echoes it back on every
 * membership event under `data.metadata.userId`. As a fallback we accept
 * `data.user.email` and look the local User up by email — that covers the
 * case where someone joins via a raw share link without metadata.
 *
 * All other event types are accepted (200) but ignored — the webhook is
 * subscribed to "all events" at the Whop side (see brief F#10) and we filter
 * in-code so future event additions don't 4xx and trigger retries.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getWhopSignatureHeader,
  verifyWhopSignature,
} from '@/lib/whop/signature';
import { tierForPlan, type AppTier } from '@/lib/whop/plan-map';

// Force Node runtime — we use `crypto` (HMAC) and Prisma; both are Node-only.
export const runtime = 'nodejs';
// Never cache — every POST hits the handler.
export const dynamic = 'force-dynamic';

type WhopMembership = {
  id?: string;
  user_id?: string;
  plan_id?: string;
  status?: string;
  email?: string;
  metadata?: Record<string, unknown> | null;
  user?: { id?: string; email?: string } | null;
};

type WhopWebhookEnvelope = {
  id?: string;
  timestamp?: string | number;
  type?: string;
  action?: string; // some Whop event shapes use `action` instead of `type`
  event?: string;  // and some legacy shapes use `event`
  data?: WhopMembership | null;
};

export async function POST(req: NextRequest) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed — but log loudly. Ken wires this env on deploy.
    console.error('[whop/webhook] WHOP_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { success: false, error: 'webhook_secret_not_configured' },
      { status: 500 },
    );
  }

  // Read raw body BEFORE parsing — signature is over the raw bytes.
  const rawBody = await req.text();
  const sigHeader = getWhopSignatureHeader(req.headers);
  const check = verifyWhopSignature(rawBody, sigHeader, secret);
  if (!check.ok) {
    console.warn('[whop/webhook] signature rejected:', check.reason);
    return NextResponse.json(
      { success: false, error: 'unauthorized', reason: check.reason },
      { status: 401 },
    );
  }

  let envelope: WhopWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WhopWebhookEnvelope;
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json' },
      { status: 400 },
    );
  }

  const eventType =
    (envelope.type ?? envelope.action ?? envelope.event ?? '').toString();

  // Whitelist the two events that mutate tier; everything else is acknowledged.
  if (
    eventType !== 'membership.activated' &&
    eventType !== 'membership.deactivated'
  ) {
    return NextResponse.json({ success: true, ignored: eventType || 'unknown' });
  }

  const membership = envelope.data ?? null;
  if (!membership || !membership.id) {
    console.warn('[whop/webhook] event missing membership data:', eventType);
    return NextResponse.json(
      { success: false, error: 'malformed_event' },
      { status: 400 },
    );
  }

  const userId = await resolveLocalUserId(membership);
  if (!userId) {
    // We received a valid, signed event but can't tie it to a local user.
    // Return 200 so Whop does not retry forever — but log so we can backfill.
    console.warn(
      '[whop/webhook] cannot resolve local user for membership',
      membership.id,
      'plan',
      membership.plan_id,
    );
    return NextResponse.json({ success: true, unmatched: true });
  }

  if (eventType === 'membership.activated') {
    const targetTier: AppTier = tierForPlan(membership.plan_id) ?? 'ACCESO';
    await applyTierChange({
      userId,
      tier: targetTier,
      membership,
      status: membership.status ?? 'active',
    });
    return NextResponse.json({ success: true, applied: 'activated', tier: targetTier });
  }

  // membership.deactivated
  await applyTierChange({
    userId,
    tier: 'FREE',
    membership,
    status: membership.status ?? 'canceled',
  });
  return NextResponse.json({ success: true, applied: 'deactivated', tier: 'FREE' });
}

/**
 * Identity linking. Priority order:
 *  1) metadata.userId (passed in from the embedded checkout — primary path)
 *  2) data.user.email or data.email (fallback for raw-link joiners)
 *  3) existing Subscription.whopMembershipId (already linked previously)
 */
async function resolveLocalUserId(m: WhopMembership): Promise<string | null> {
  const metaUserId =
    typeof m.metadata?.userId === 'string' ? (m.metadata.userId as string) : null;
  if (metaUserId) {
    const u = await prisma.user.findUnique({ where: { id: metaUserId }, select: { id: true } });
    if (u) return u.id;
  }

  const email = m.user?.email ?? m.email ?? null;
  if (email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) return u.id;
  }

  if (m.id) {
    const sub = await prisma.subscription.findUnique({
      where: { whopMembershipId: m.id },
      select: { userId: true },
    });
    if (sub) return sub.userId;
  }

  return null;
}

async function applyTierChange(args: {
  userId: string;
  tier: AppTier;
  membership: WhopMembership;
  status: string;
}): Promise<void> {
  const { userId, tier, membership, status } = args;

  // Upsert Subscription so support/UI can see the latest Whop state. Single
  // row per user (Subscription.userId is @unique). Stripe columns are
  // preserved for any legacy data; we only write the whop* + tier/status here.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { tier: tier as 'FREE' | 'ACCESO' | 'GOLD' | 'DIAMOND' },
    }),
    prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier: tier as 'FREE' | 'ACCESO' | 'GOLD' | 'DIAMOND',
        status,
        whopMembershipId: membership.id ?? null,
        whopPlanId: membership.plan_id ?? null,
        whopUserId: membership.user_id ?? membership.user?.id ?? null,
      },
      update: {
        tier: tier as 'FREE' | 'ACCESO' | 'GOLD' | 'DIAMOND',
        status,
        whopMembershipId: membership.id ?? undefined,
        whopPlanId: membership.plan_id ?? undefined,
        whopUserId: membership.user_id ?? membership.user?.id ?? undefined,
      },
    }),
  ]);
}
