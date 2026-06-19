/**
 * GET /api/factory/runs/:id/artifacts → the run's stage outputs, owner-gated.
 *
 * Returns `{ artifacts: [{ stage, kind, payload, createdAt }] }` ordered by
 * stage (then createdAt) — the readable project view + the .md downloads read
 * this. Owner gate is identical to the sibling routes (auth_token cookie →
 * requireOwner). 404 when the run doesn't exist, so an unknown id can't be
 * probed for artifacts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError } from '@/lib/factory/api';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in gate) return gate.error;

  const { id } = await ctx.params;

  const run = await db.run.findUnique({ where: { id } });
  if (!run) return apiError('not_found', 'Run not found.', 404);

  const artifacts = await db.factoryArtifact.findMany({
    where: { runId: id },
    orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }],
    select: { stage: true, kind: true, payload: true, createdAt: true },
  });

  return NextResponse.json({ runId: id, seed: run.seed, artifacts });
}
