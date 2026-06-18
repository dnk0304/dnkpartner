/**
 * /api/factory/runs
 *   POST {seed}  → create a Run, run stage 1 synchronously, return the run state.
 *   GET          → list runs (newest first) for the panel.
 *
 * Owner-gated (auth_token → validateSessionToken), exactly like the rest of the
 * app. Only GET/POST are exported — no other named exports (Next.js 16 type-gen).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError, serializeRun } from '@/lib/factory/api';
import { advanceOneStage } from '@/lib/factory/runner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in gate) return gate.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Body must be JSON.', 400);
  }
  const seed = (body as { seed?: unknown }).seed;
  if (typeof seed !== 'string' || seed.trim().length < 3) {
    return apiError('bad_request', 'seed must be a non-empty string (>= 3 chars).', 400);
  }

  // Create the run, then advance stage 1 synchronously so the first result is
  // ready when POST returns. Stage 1 has a human gate, so this stops at
  // awaiting_human_gate (the niche gate) — the panel shows it for approval.
  const created = await db.run.create({ data: { seed: seed.trim() } });

  try {
    await advanceOneStage(created);
  } catch (err) {
    // Stage 1 failed (e.g. LLM error). Surface it; the run row exists at stage 1
    // so it can be re-ticked once the cause is fixed.
    const message = err instanceof Error ? err.message : 'Stage 1 failed.';
    const run = await db.run.findUnique({ where: { id: created.id } });
    return NextResponse.json(
      { run: run ? await serializeRun(run) : null, error: { code: 'stage_failed', message } },
      { status: 502 },
    );
  }

  const run = await db.run.findUniqueOrThrow({ where: { id: created.id } });
  return NextResponse.json({ run: await serializeRun(run) }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const gate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in gate) return gate.error;

  const runs = await db.run.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      seed: true,
      stage: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ runs });
}
