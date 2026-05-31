/**
 * POST /api/admin/images/backfill
 *
 * Auth: admin session OR CRON_SECRET (mirrors /api/dispatch/run).
 * Walks ACTIVE auctions (CELEBRANDOSE / PROXIMA_APERTURA) without a real
 * imageUrl populated and resolves each via the catastro→streetview chain,
 * persisting the result back to Auction.imageUrl. Cached files survive in
 * the AUCTION_IMAGES_DIR volume across redeploys.
 *
 * Query params:
 *   limit            — max rows to process this call (default 50, max 500).
 *   offset           — skip first N rows (default 0). Lets cron walk past
 *                      the 500-row top-of-list cap on subsequent calls.
 *   force            — if "1", re-resolve rows that already have an imageUrl.
 *   missingImageWithCoords
 *                    — if "1", restrict to rows that already have
 *                      latitude/longitude but no resolved imageUrl.
 *                      Cheapest mode: skips Catastro/geocoding lookups,
 *                      goes straight to Street View.
 *
 * Rate-limited internally (small inter-request delay) so we stay polite to
 * both Catastro and Google. Designed to be called repeatedly from the
 * dnksubastas-scheduler cron until queue is empty.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { query } from '@/lib/db';
import { ACTIVE_STATUSES, resolveAndPersist, type ResolverRow } from '@/lib/auction-images/resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTER_REQ_DELAY_MS = 250;

async function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrCron(req);
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);
  const force = url.searchParams.get('force') === '1';
  const missingImageWithCoords = url.searchParams.get('missingImageWithCoords') === '1';

  const statusList = ACTIVE_STATUSES.map((s) => `'${s}'`).join(',');

  // imageUrl filter: skipped entirely when force=1 (re-resolve everything),
  // otherwise restricts to rows where imageUrl is null OR not yet served from
  // our cached /api/auction-image/ route.
  const imageFilter = force
    ? ''
    : `AND ("imageUrl" IS NULL OR "imageUrl" NOT LIKE '/api/auction-image/%')`;

  // Coords gate: in missingImageWithCoords mode we only touch rows that already
  // have lat/lng, so the resolver chain can go straight to Street View without
  // burning a Catastro RC lookup or a fresh geocode call. This is the cheapest
  // backfill mode and is what we want once T2 has populated coordinates.
  const coordsFilter = missingImageWithCoords
    ? 'AND latitude IS NOT NULL AND longitude IS NOT NULL'
    : '';

  const rows = await query<ResolverRow>(
    `SELECT "boeId", status, "cadastralRef", "cadastralData",
            "lotDescription", "propertyDescription", "boeAnnouncement",
            address, latitude, longitude, "imageUrl"
       FROM "Auction"
      WHERE status IN (${statusList})
        ${imageFilter}
        ${coordsFilter}
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}`,
    []
  );

  const summary = {
    inspected: rows.length,
    offset,
    limit,
    catastro: 0,
    streetview: 0,
    cached: 0,
    miss: 0,
    notes: {} as Record<string, number>,
  };

  for (const row of rows) {
    try {
      const out = await resolveAndPersist(row);
      if (out.source === 'catastro') summary.catastro++;
      else if (out.source === 'streetview') summary.streetview++;
      else if (out.source === 'cached') summary.cached++;
      else {
        summary.miss++;
        const k = out.note || 'unknown';
        summary.notes[k] = (summary.notes[k] || 0) + 1;
      }
    } catch (err) {
      summary.miss++;
      const k = `error:${(err as Error).message.slice(0, 60)}`;
      summary.notes[k] = (summary.notes[k] || 0) + 1;
    }
    if (INTER_REQ_DELAY_MS > 0) await sleep(INTER_REQ_DELAY_MS);
  }

  return NextResponse.json({ success: true, mode: gate.mode, summary });
}

export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'method_not_allowed',
    hint: 'POST to /api/admin/images/backfill?limit=50&offset=0[&missingImageWithCoords=1][&force=1]',
  }, { status: 405 });
}
