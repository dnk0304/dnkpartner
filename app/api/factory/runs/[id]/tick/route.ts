/**
 * POST /api/factory/runs/:id/tick → advance exactly ONE stage.
 *
 * This is the resumable driver: the panel polls /tick to drive the
 * auto-advance stages (2,3,4,7). It only runs when the run is in 'running'
 * status — at a human gate (awaiting_human_gate) the panel calls /gate instead;
 * at escalated/draft_ready/killed there is nothing to tick.
 *
 * Each call commits one stage's Artifact + GateLog rows before returning, so a
 * crash resumes from the last committed stage (never a silent total loss).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError, serializeRun } from '@/lib/factory/api';
import { advanceOneStage } from '@/lib/factory/runner';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in gate) return gate.error;

  const { id } = await ctx.params;
  const run = await db.run.findUnique({ where: { id } });
  if (!run) return apiError('not_found', 'Run not found.', 404);

  if (run.status !== 'running') {
    // Not tickable. Return the current state so the panel can react (await
    // human gate, show escalation, render the draft).
    return NextResponse.json(
      { run: await serializeRun(run), advanced: false, reason: `Run is ${run.status}, not tickable.` },
      { status: 409 },
    );
  }

  try {
    const result = await advanceOneStage(run);
    const fresh = await db.run.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({
      run: await serializeRun(fresh),
      advanced: true,
      stopped: result.stopped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stage failed.';
    const fresh = await db.run.findUnique({ where: { id } });
    return NextResponse.json(
      {
        run: fresh ? await serializeRun(fresh) : null,
        advanced: false,
        error: { code: 'stage_failed', message },
      },
      { status: 502 },
    );
  }
}
