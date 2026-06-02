/**
 * POST /api/whop/checkout-session — Feature #10 (embedded Whop payment).
 *
 * Why this route exists
 * ----------------------
 * The official `@whop/checkout/react` `<WhopCheckoutEmbed>` accepts either a
 * `planId` (no metadata) or a `sessionId` (server-created configuration that
 * CAN carry metadata). To wire `metadata.userId` — which `/api/whop/webhook`
 * reads to map the new Whop membership back to a local `User` row — we MUST
 * create a checkout configuration server-side and hand the returned id (a
 * `ch_…` value) to the embed as `sessionId`.
 *
 * Why we can't pass the API key from the browser
 * ----------------------------------------------
 * `WHOP_API_KEY` is a company-scoped bearer token. Exposing it to the client
 * would let any visitor create checkouts on the company's behalf. Server-only.
 *
 * Upstream call (verified against docs.whop.com/api-reference/checkout-configurations):
 *   POST https://api.whop.com/api/v1/checkout_configurations
 *   Authorization: Bearer ${WHOP_API_KEY}
 *   Body: { plan_id, mode: "payment", metadata: { userId, email? } }
 *   Response: { id: "ch_…", purchase_url, plan: {...}, metadata: {...}, … }
 *
 * Contract returned to the client:
 *   200 { success: true, sessionId: "ch_…", planId: "plan_c4MzcxWSJP7eT" }
 *   401 user not signed in
 *   500 server misconfigured (missing WHOP_API_KEY) or upstream failure
 *
 * Defer the env check to request time (NOT module load) — see Forge memory note
 * `patterns_nextjs_build_env`: a fail-closed module-level throw would break
 * `next build` "Collect page data" in environments that don't expose runtime
 * secrets.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-helpers';
import { WHOP_PLAN_ID_ACCESO } from '@/lib/whop/plan-map';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WHOP_API_BASE = 'https://api.whop.com/api/v1';

type WhopCheckoutConfigResponse = {
  id?: string;
  purchase_url?: string;
  plan?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
};

export async function POST(req: NextRequest) {
  // 1) Must be a logged-in local user. The whole point of the route is to
  //    bind the resulting checkout to *this* user's id.
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, email } = session;

  // 2) Server config — checked at request time, not module load.
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) {
    console.error('[whop/checkout-session] WHOP_API_KEY not configured');
    return NextResponse.json(
      { success: false, error: 'whop_api_key_not_configured' },
      { status: 500 },
    );
  }

  // 3) Optional client overrides — kept tight; today we only honour planId so
  //    a future tier can reuse this route without a new endpoint. Default is
  //    the single Acceso plan.
  let planId: string = WHOP_PLAN_ID_ACCESO;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      planId?: unknown;
    };
    if (typeof body.planId === 'string' && body.planId.startsWith('plan_')) {
      planId = body.planId;
    }
  } catch {
    // No body / invalid JSON — fine, defaults apply.
  }

  // 4) Create the checkout configuration. Metadata is the critical bit: Whop
  //    will echo `metadata.userId` back on every membership.* event the
  //    webhook handles, which is how we map to the local User row.
  const upstreamBody = {
    plan_id: planId,
    mode: 'payment' as const,
    metadata: {
      userId,
      email: email ?? '',
      source: 'precios-embed',
    },
  };

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${WHOP_API_BASE}/checkout_configurations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      // Whop is upstream — never cache.
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[whop/checkout-session] upstream fetch failed:', err);
    return NextResponse.json(
      { success: false, error: 'upstream_unreachable' },
      { status: 502 },
    );
  }

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => '');
    console.error(
      '[whop/checkout-session] upstream non-2xx',
      upstreamRes.status,
      text.slice(0, 500),
    );
    return NextResponse.json(
      {
        success: false,
        error: 'upstream_error',
        status: upstreamRes.status,
      },
      { status: 502 },
    );
  }

  let data: WhopCheckoutConfigResponse;
  try {
    data = (await upstreamRes.json()) as WhopCheckoutConfigResponse;
  } catch (err) {
    console.error('[whop/checkout-session] upstream json parse failed:', err);
    return NextResponse.json(
      { success: false, error: 'upstream_invalid_json' },
      { status: 502 },
    );
  }

  const sessionId = data.id;
  if (!sessionId) {
    console.error(
      '[whop/checkout-session] upstream missing id',
      JSON.stringify(data).slice(0, 500),
    );
    return NextResponse.json(
      { success: false, error: 'upstream_missing_id' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    sessionId,
    planId,
  });
}
