/**
 * /api/factory/runs
 *   POST {hint?} → create a Run, generate N candidate niches synchronously, return
 *                  the run state + the candidate set. Stops at `awaiting_selection`.
 *   GET          → list runs (newest first) for the panel.
 *
 * Owner-gated (auth_token → validateSessionToken), exactly like the rest of the
 * app. Only GET/POST are exported — no other named exports (Next.js 16 type-gen).
 *
 * ─── UI CONTRACT (for Pixel — keep stable) ────────────────────────────────────
 *   POST /api/factory/runs  body { hint?: string }   // hint OPTIONAL; "" = "help me discover"
 *     201 → {
 *       run: { id, seed, hint, stage, status:'awaiting_selection', candidates:[...], ... },
 *       candidates: NicheCandidate[]
 *     }
 *   NicheCandidate = {
 *     index, niche, productIdea, painArea,
 *     scores: { pain, worsening, purchasingPower, speedToValue, competitionGap }, // 1-10
 *     demandEvidence, rationale, advisoryFlags?: string[]
 *   }
 *   Then: POST /api/factory/runs/[id]/select { candidateIndex } promotes the pick
 *   and advances the heavy gate (→ status 'awaiting_human_gate', gate 'niche').
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * BACK-COMPAT: a legacy `{seed}` body is still accepted and treated as the hint,
 * so an existing caller that posts a seed gets the new multi-niche flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner, apiError, serializeRun } from '@/lib/factory/api';
import { runCandidateGeneration } from '@/lib/factory/runner';
import { computeRunProgress } from '@/lib/factory/progress';

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

  // hint is OPTIONAL. Accept `hint`; fall back to legacy `seed` for back-compat.
  // Empty / missing → "help me discover" (the generator spreads across spaces).
  const rawHint = (body as { hint?: unknown }).hint ?? (body as { seed?: unknown }).seed;
  if (rawHint !== undefined && typeof rawHint !== 'string') {
    return apiError('bad_request', 'hint, when provided, must be a string.', 400);
  }
  const hint = (rawHint ?? '').trim();

  // Create the run. `seed` mirrors the hint pre-selection (it is REWRITTEN to the
  // chosen refined niche at selection time); `hint` preserves the raw input.
  const created = await db.run.create({ data: { seed: hint, hint: hint || null } });

  try {
    await runCandidateGeneration(created);
  } catch (err) {
    // Generation failed (e.g. LLM error). Surface it; the run row exists so it can
    // be retried. Status stays 'running' (it never reached awaiting_selection).
    const message = err instanceof Error ? err.message : 'Candidate generation failed.';
    const run = await db.run.findUnique({ where: { id: created.id } });
    return NextResponse.json(
      { run: run ? await serializeRun(run) : null, error: { code: 'generation_failed', message } },
      { status: 502 },
    );
  }

  const run = await db.run.findUniqueOrThrow({ where: { id: created.id } });
  const serialized = await serializeRun(run);
  return NextResponse.json(
    { run: serialized, candidates: serialized.candidates ?? [] },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const gate = await requireOwner(req.cookies.get('auth_token')?.value);
  if ('error' in gate) return gate.error;

  const rows = await db.run.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      seed: true,
      hint: true,
      stage: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  // Attach the real progress signal (stage X/N + token-log liveness) so cards
  // can show a filling bar + live "processing" state without an extra request.
  const runs = rows.map((r) => ({
    ...r,
    progress: computeRunProgress(r),
  }));
  return NextResponse.json({ runs });
}
