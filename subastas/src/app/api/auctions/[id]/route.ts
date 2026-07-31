/**
 * GET /api/auctions/[id] — auction detail loader.
 *
 * Wave-B2 ungate (Dennis 2026-07-31): the detail endpoint is now FULLY PUBLIC.
 * Every caller — anonymous, trial, paid — receives the SAME full payload
 * (address, pricing/valuation, description, legal/cadastral data, documents,
 * timeline, and every column the row carries). The previous logged-out TEASER
 * projection (`meta.gated:true, requires:'auth'`) is GONE. The paid product is
 * the alerts/notifications (see /api/alerts/route.ts), NOT content gating.
 *
 * The payload is built by the shared `buildAuctionDetailPayload()` — the SAME
 * function the SSR detail page (/subastas/subasta/[slug]/page.tsx) calls to seed
 * <AuctionDetailClient/> with `initialData`. One builder for both paths = no
 * "half-gated" drift between the SSR HTML and the API response.
 *
 * `viewerUserId` (from the session) only affects `isFollowing` — a per-user
 * favourite flag. All auction INFORMATION is identical for every viewer.
 *
 * Response shape:
 *   { success:true, data:{ auction, history:{statuses,bids}, followCount, isFollowing } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildAuctionDetailPayload } from '@/lib/auction-detail-payload';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'id_required' }, { status: 400 });
  }

  // Resolve session — used ONLY to personalise `isFollowing`. A session-store
  // blip is treated as logged-out (isFollowing:false); it never withholds
  // information, because there is no information gate anymore.
  let viewerUserId: string | undefined;
  try {
    const session = await auth();
    viewerUserId = session?.user?.id;
  } catch {
    viewerUserId = undefined;
  }

  const payload = await buildAuctionDetailPayload(id, { viewerUserId });
  if (!payload) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: payload });
}
