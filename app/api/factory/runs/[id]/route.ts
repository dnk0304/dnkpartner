/**
 * GET    /api/factory/runs/:id → full run state (stage, status, artifacts,
 *        gateLogs, decisions, pendingGate). Owner-gated. 404 if the run doesn't exist.
 * DELETE /api/factory/runs/:id → permanently delete the run and its children
 *        (GateLog / FactoryArtifact / Decision cascade). Owner-gated. 404 if missing.
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

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in gate) return gate.error;

  const { id } = await ctx.params;

  // 404 (not 500) when the run is already gone. The child rows
  // (GateLog / FactoryArtifact / Decision) cascade via `onDelete: Cascade`
  // in the schema, so deleting the Run is sufficient.
  const run = await db.run.findUnique({ where: { id } });
  if (!run) return apiError('not_found', 'Run not found.', 404);

  await db.run.delete({ where: { id } });

  return NextResponse.json({ ok: true, id });
}
