/**
 * GET /api/participar/[id] — the auth-gated official-auction redirect (wave169).
 *
 * This is the CORE of the "Participar" feature. It is the ONLY place the
 * official-auction URL (BOE detalleSubasta.php / PLABI / SEGSOCIAL portal) is
 * resolved and emitted, and it emits it ONLY inside the 302 `Location` header —
 * never into page HTML, an RSC payload, or a crawlable <a href>. A "Participar"
 * button anywhere in the app needs nothing but the auction `id`:
 *
 *     window.open('/api/participar/' + auctionId, '_blank', 'noopener')
 *
 * Flow:
 *   - Row not found / malformed id → 404 (never 500).
 *   - Anonymous viewer           → 302 /register?next=<detail-slug> (sign-up).
 *   - Authenticated viewer       → 302 to the resolved official-auction URL.
 *   - Authenticated but the row has no resolvable official URL → 302 back to
 *     the detail page (graceful; never a dead 404 for an entitled user).
 *
 * SEO: the route lives under `/api/`, which robots.txt already Disallows, so
 * Googlebot never follows it. Do NOT add it to the sitemap.
 *
 * Redirects are explicit 302 (not Next's default 307) so the route behaves
 * predictably even when opened directly, and so an anonymous direct-hit lands
 * on /register rather than leaking the destination.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { boeLinkFor } from '@/lib/boe-link';
import { officialAuctionUrl } from '@/lib/official-url';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';

// Force per-request evaluation — the route reads the session and must never be
// statically cached.
export const dynamic = 'force-dynamic';

/**
 * ── PARTICIPATION AUTH GATE — THE SINGLE SWITCH POINT ──────────────────────
 *
 * Default (Dennis 2026-07-31): participation is gated behind a LOGGED-IN
 * account (any free account counts). "Sign up / log in to participate."
 *
 * To switch the gate to PAID/trial subscription instead, replace the body of
 * this function with the one-line paid check:
 *
 *     import { hasFullAccessServer } from '@/lib/access';
 *     return hasFullAccessServer();
 *
 * That is the ONLY line that changes free ↔ paid. Nothing else in the feature
 * references the auth level directly.
 */
async function isParticipationAllowed(): Promise<boolean> {
  // Logged-in gate (default). A session-store blip collapses to "not allowed",
  // which fails safe to the sign-up prompt (never leaks the official URL).
  try {
    const session = await auth();
    return Boolean(session?.user?.id);
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Minimal projection — only what the resolver + slug builder need. Crucially
  // this row is NEVER serialised to a client; it exists only to compute the
  // redirect target.
  let row: {
    id: string;
    source: string | null;
    boeLink: string | null;
    boeId: string | null;
    originalSource: string | null;
    auctionType: string | null;
    province: string | null;
    municipality: string | null;
  } | null = null;
  try {
    row = await prisma.auction.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        boeLink: true,
        boeId: true,
        originalSource: true,
        auctionType: true,
        province: true,
        municipality: true,
      },
    });
  } catch {
    // DB blip — treat as not found rather than 500.
    return new NextResponse('Not found', { status: 404 });
  }
  if (!row) {
    return new NextResponse('Not found', { status: 404 });
  }

  const detailPath = `/subastas/subasta/${buildAuctionSlug({
    id: row.id,
    auctionType: row.auctionType,
    province: row.province,
    municipality: row.municipality,
  })}`;

  // ── THE GATE ──────────────────────────────────────────────────────────────
  const allowed = await isParticipationAllowed();
  if (!allowed) {
    // Anonymous → sign-up prompt, returning to the auction afterwards. Send
    // BOTH `next` and `callbackUrl` since /register reads either (matches the
    // rest of the app — see CrearAlertaCTA).
    const enc = encodeURIComponent(detailPath);
    return NextResponse.redirect(
      new URL(`/register?callbackUrl=${enc}&next=${enc}`, req.url),
      302,
    );
  }

  // Authenticated → resolve the official-auction URL server-side and hand it
  // back ONLY in the redirect Location.
  const url = officialAuctionUrl({
    source: row.source,
    boeLink: boeLinkFor(row.boeId, row.boeLink),
    originalSource: row.originalSource,
  });

  if (!url) {
    // Entitled user but the row has no resolvable official URL — send them to
    // the detail page rather than a dead end.
    return NextResponse.redirect(new URL(detailPath, req.url), 302);
  }

  return NextResponse.redirect(url, 302);
}
