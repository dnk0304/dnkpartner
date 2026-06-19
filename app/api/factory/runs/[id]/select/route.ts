/**
 * POST /api/factory/runs/:id/select { candidateIndex } → promote the chosen
 * candidate niche and kick off the heavy Stage-1 gate.
 *
 * Owner-gated. Only runs that are `awaiting_selection` accept a selection. The
 * chosen candidate's refined niche is written into Run.seed (the downstream
 * anchor), a Decision row (gate='niche_selection') is recorded, and the existing
 * heavy 3-expert Stage-1 gate runs synchronously — landing the run at the existing
 * awaiting_human_gate (gate='niche'). From there S2→S6 are unchanged.
 *
 * ─── UI CONTRACT (for Pixel — keep stable) ────────────────────────────────────
 *   POST /api/factory/runs/:id/select  body { candidateIndex: number }  // 0-based
 *     200 → { run: { ..., status:'awaiting_human_gate', pendingGate:{gate:'niche'} } }
 *     400 → candidateIndex missing / not a number / out of range
 *     409 → run is not awaiting_selection
 *     502 → the heavy gate failed (e.g. LLM error); the pick is recorded, retriable
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError, serializeRun } from '@/lib/factory/api';
import { selectCandidate } from '@/lib/factory/runner';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const authGate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in authGate) return authGate.error;
  const operatorEmail = authGate.payload.email;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Body must be JSON.', 400);
  }
  const rawIndex = (body as { candidateIndex?: unknown }).candidateIndex;
  if (typeof rawIndex !== 'number' || !Number.isInteger(rawIndex) || rawIndex < 0) {
    return apiError('bad_request', 'candidateIndex must be a non-negative integer.', 400);
  }

  const run = await db.run.findUnique({ where: { id } });
  if (!run) return apiError('not_found', 'Run not found.', 404);

  if (run.status !== 'awaiting_selection') {
    return apiError('conflict', `Run is ${run.status}, not awaiting_selection.`, 409);
  }

  try {
    await selectCandidate(run, rawIndex, operatorEmail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Selection failed.';
    // An out-of-range index surfaces as a 400; everything else (gate/LLM) is a 502.
    const status = /out of range/i.test(message) ? 400 : 502;
    const code = status === 400 ? 'bad_request' : 'select_failed';
    const fresh = await db.run.findUnique({ where: { id } });
    return NextResponse.json(
      { run: fresh ? await serializeRun(fresh) : null, error: { code, message } },
      { status },
    );
  }

  const fresh = await db.run.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ run: await serializeRun(fresh) });
}
