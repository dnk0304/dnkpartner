/**
 * GET /api/factory/runs/:id → full run state (stage, status, artifacts,
 * gateLogs, decisions, pendingGate). Owner-gated. 404 if the run doesn't exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError, serializeRun } from '@/lib/factory/api';

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

  return NextResponse.json({ run: await serializeRun(run) });
}
