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
 *   limit  — max rows to process this call (default 50, max 500).
 *   force  — if "1", re-resolve rows that already have an imageUrl.
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
  const force = url.searchParams.get('force') === '1';

  const statusList = ACTIVE_STATUSES.map((s) => `'${s}'`).join(',');
  const imageFilter = force
    ? ''
    : `AND ("imageUrl" IS NULL OR "imageUrl" NOT LIKE '/api/auction-image/%')`;

  const rows = await query<ResolverRow>(
    `SELECT "boeId", status, "cadastralRef", "cadastralData",
            "lotDescription", "propertyDescription", "boeAnnouncement",
            address, latitude, longitude, "imageUrl"
       FROM "Auction"
      WHERE status IN (${statusList})
        ${imageFilter}
      ORDER BY "publishedAt" DESC NULLS LAST
      LIMIT ${limit}`,
    []
  );

  const summary = {
    inspected: rows.length,
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
    hint: 'POST to /api/admin/images/backfill?limit=50',
  }, { status: 405 });
}
