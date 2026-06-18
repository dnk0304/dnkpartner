/**
 * POST /api/factory/runs/:id/gate {gate, choice, override?} → record the human
 * Decision and resume the run from the human gate.
 *
 *   gate    — one of 'niche' | 'brand' | 'channel' | 'publish' (must match the
 *             gate the run is currently stopped at).
 *   choice  — 'approve' | 'override' | 'reject'.
 *   override— optional free-text override note (audit).
 *
 * For the PUBLISH gate, approval finalizes the Etsy DRAFT object and sets
 * status=draft_ready — NEVER published (the Etsy write token is not connected).
 * Owner-gated. Only runs that are awaiting_human_gate accept a gate decision.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError, serializeRun } from '@/lib/factory/api';
import { resumeFromGate } from '@/lib/factory/runner';
import { getStage } from '@/lib/factory/types';

export const dynamic = 'force-dynamic';

const VALID_CHOICES = new Set(['approve', 'override', 'reject']);

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
  const { gate, choice } = body as { gate?: unknown; choice?: unknown };
  if (typeof gate !== 'string' || typeof choice !== 'string' || !VALID_CHOICES.has(choice)) {
    return apiError(
      'bad_request',
      "gate must be a string; choice must be one of 'approve' | 'override' | 'reject'.",
      400,
    );
  }

  const run = await db.run.findUnique({ where: { id } });
  if (!run) return apiError('not_found', 'Run not found.', 404);

  if (run.status !== 'awaiting_human_gate') {
    return apiError('conflict', `Run is ${run.status}, not awaiting a human gate.`, 409);
  }

  // The gate must match the gate the run is actually stopped at.
  const stage = getStage(run.stage);
  if (stage.humanGate !== gate) {
    return apiError(
      'bad_request',
      `Run is at the '${stage.humanGate}' gate (stage ${run.stage}), not '${gate}'.`,
      400,
    );
  }

  try {
    await resumeFromGate(run, gate, choice, operatorEmail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gate resume failed.';
    return apiError('gate_failed', message, 502);
  }

  const fresh = await db.run.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ run: await serializeRun(fresh) });
}
