/**
 * Shared helpers for the Product Factory API routes. Lives in lib/ (not in a
 * route file) because Next.js 16 route files may only export the HTTP-method
 * handlers + a small fixed set of segment configs — any other named export
 * fails type-gen (see app/factory/stages.ts). Keeping the owner gate, the JSON
 * error shape, and the run serializer here keeps every route file clean.
 */

import { NextResponse } from 'next/server';
import { validateSessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { publishGateMessage } from './etsyAdapter';
import { getStage } from './types';
import type { JwtPayload } from '@/lib/auth';
import type { Run } from '@prisma/client';

/** Consistent error body across every factory endpoint. */
export function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Owner gate — identical contract to app/api/auth/me/route.ts: read the
 * `auth_token` cookie, validate signature + sessionVersion, 401 on any failure.
 * Returns the JWT payload (with the operator email) on success, or a 401
 * NextResponse the caller should return directly.
 */
export async function requireOwner(
  cookieToken: string | undefined,
): Promise<{ payload: JwtPayload } | { error: NextResponse }> {
  if (!cookieToken) {
    return { error: apiError('unauthorized', 'Not signed in.', 401) };
  }
  try {
    const payload = await validateSessionToken(cookieToken);
    if (!payload) {
      return { error: apiError('unauthorized', 'Session invalid or expired.', 401) };
    }
    return { payload };
  } catch {
    return { error: apiError('unauthorized', 'Auth check failed.', 401) };
  }
}

/**
 * Serialize a run to the full state the panel renders: the run row, all
 * artifacts, all gate logs, the decisions, and — when stopped at a human gate
 * or at draft_ready — a `pendingGate` descriptor with the human-gate slug and
 * (for publish) the honest Etsy-token message.
 */
export async function serializeRun(run: Run) {
  const [artifacts, gateLogs, decisions] = await Promise.all([
    db.factoryArtifact.findMany({
      where: { runId: run.id },
      orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }],
    }),
    db.gateLog.findMany({
      where: { runId: run.id },
      orderBy: [{ stage: 'asc' }, { loop: 'asc' }],
    }),
    db.decision.findMany({ where: { runId: run.id }, orderBy: { at: 'asc' } }),
  ]);

  const stage = getStage(run.stage);
  const pendingGate =
    run.status === 'awaiting_human_gate' && stage.humanGate
      ? {
          gate: stage.humanGate,
          stage: run.stage,
          message:
            stage.humanGate === 'publish' ? publishGateMessage() : 'Review and approve to continue.',
        }
      : null;

  return {
    id: run.id,
    seed: run.seed,
    stage: run.stage,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    pendingGate,
    artifacts,
    gateLogs,
    decisions,
  };
}
