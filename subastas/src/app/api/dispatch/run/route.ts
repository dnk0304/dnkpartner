/**
 * POST /api/dispatch/run — manual / cron-driven drain of the event outbox.
 *
 * Auth: requires `CRON_SECRET` Bearer token, OR an admin session. This is the
 * alternative to the standalone worker container — set up a cron entry in the
 * existing Python scheduler pinging this endpoint every N minutes.
 *
 * Response shape: `{ success: true, stats: DispatchStats }` (see dispatcher).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { drainOutbox } from '@/lib/dispatcher';

export async function POST(req: NextRequest) {
  const gate = await requireAdminOrCron(req);
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const batch = Math.min(
    Math.max(parseInt(url.searchParams.get('batch') ?? '50', 10), 1),
    500,
  );

  try {
    const stats = await drainOutbox(batch);
    return NextResponse.json({ success: true, mode: gate.mode, stats });
  } catch (err) {
    console.error('[dispatch/run] failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'dispatch_failed',
        details: (err as Error).message,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/dispatch/run',
    auth: 'Authorization: Bearer <CRON_SECRET> OR admin session',
    query: { batch: 'optional integer 1-500, default 50' },
  });
}
