/**
 * POST /api/mint/url-v3/run — mint v3 urls for auctions that do not have one.
 *
 * This is the MINT-ON-INGEST entry point. The Python scheduler pings it right
 * after each ingest job (BOE / SEGSOCIAL / PLABI), which is what keeps v3
 * coverage from decaying as new auctions arrive. The SAME endpoint, with a
 * larger `limit`, performs the one-off catch-up of the existing backlog — there
 * is no separate backfill script that could drift from the live path.
 *
 * Auth: `CRON_SECRET` Bearer token OR an admin session — identical to
 * `/api/dispatch/run`, which is the pattern this repo already uses for
 * scheduler-driven work.
 *
 * Query:
 *   limit  — rows to process this pass (1..5000, default 500)
 *   dryRun — '1' to compute outcomes and write NOTHING
 *
 * Response: `{ success, mode, stats }`. `stats.failed` and `stats.failures`
 * carry every refusal verbatim; the scheduler logs the body, so a mint that
 * cannot be performed correctly is visible rather than silent. A failure is
 * SAFE — the row keeps serving its legacy url and the next pass retries it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { sweepMintUrlV3, recheckSkipped } from '@/lib/seo/mint-url-v3-sweep';

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrCron(req);
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '500', 10) || 500, 1),
    5000,
  );
  const dryRun = url.searchParams.get('dryRun') === '1';

  // Release previously-skipped rows back to the mint (e.g. `held:` once the
  // upstream `address` defect is fixed). Admin-only: re-minting is a deliberate
  // act, not something a scheduler tick should ever trigger by accident.
  const recheck = url.searchParams.get('recheck');
  let rechecked = 0;
  if (recheck) {
    if (gate.mode !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'recheck_requires_admin' },
        { status: 403 },
      );
    }
    rechecked = await recheckSkipped(recheck);
  }

  try {
    const stats = await sweepMintUrlV3({ limit, dryRun });
    return NextResponse.json({ success: true, mode: gate.mode, rechecked, stats });
  } catch (err) {
    console.error('[mint/url-v3/run] failed:', err);
    return NextResponse.json(
      { success: false, error: 'mint_sweep_failed', details: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/mint/url-v3/run',
    auth: 'Authorization: Bearer <CRON_SECRET> OR admin session',
    query: {
      limit: 'optional integer 1-5000, default 500',
      dryRun: "optional '1' — compute outcomes, write nothing",
      recheck: 'optional reason prefix to un-skip (admin session only)',
    },
  });
}
