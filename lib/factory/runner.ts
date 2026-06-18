/**
 * The resumable step-runner. `advanceOneStage` runs EXACTLY ONE stage and
 * commits its results to Postgres BEFORE returning — so a crash resumes from
 * the last committed stage and never silently loses a whole run. There is no
 * fire-and-forget job and no separate worker: the API's /tick and /gate POSTs
 * call advanceOneStage one stage at a time (ORCHESTRATION §6a — avoid the
 * loop-drop seam).
 *
 * Control flow per stage:
 *   gate passes, stage has a human gate  → status = awaiting_human_gate (STOP)
 *   gate passes, no human gate, stage<8  → stage += 1, status = running (tick again)
 *   gate passes, stage == 8              → build Etsy draft, status = draft_ready
 *   gate escalates                       → status = escalated (STOP, surface to Dennis)
 *
 * Stages 1/5/6/8 have human gates: the gate PASSES, the artifact is committed,
 * and the run stops at awaiting_human_gate. The /gate POST records the Decision
 * and resumes by advancing to the next stage.
 */

import { db } from '@/lib/db';
import { runGate } from './gate';
import { getStage, STAGES } from './types';
import { buildDraftListing } from './etsyAdapter';
import type { Run } from '@prisma/client';

export type AdvanceState =
  | 'awaiting_human_gate'
  | 'running'
  | 'escalated'
  | 'draft_ready';

export interface AdvanceResult {
  runId: string;
  stage: number;
  status: AdvanceState;
  /** True when the run is at a stopping point (human gate, escalation, done). */
  stopped: boolean;
}

/** Load all completed artifacts for a run, keyed by stage number. */
async function loadPriorArtifacts(runId: string): Promise<Record<number, unknown>> {
  const rows = await db.factoryArtifact.findMany({
    where: { runId },
    orderBy: { stage: 'asc' },
    select: { stage: true, payload: true },
  });
  const out: Record<number, unknown> = {};
  for (const r of rows) out[r.stage] = r.payload;
  return out;
}

/**
 * Advance the run by exactly one stage. The run MUST be in a runnable state
 * ('running'); callers (tick/gate routes) enforce that. Idempotency note: this
 * produces + gates the CURRENT stage. If two ticks race, both could produce the
 * same stage — the routes serialize by checking status first; a belt-and-braces
 * guard could be added later with a row lock if needed.
 */
export async function advanceOneStage(run: Run): Promise<AdvanceResult> {
  const stageN = run.stage;
  const stage = getStage(stageN);
  const priorArtifacts = await loadPriorArtifacts(run.id);

  // ── Run the produce → adversarial gate → resolve loop for this stage ──────
  const outcome = await runGate(stageN, run.seed, priorArtifacts);

  // Persist GateLog rows (one per loop attempt) + the artifact in a single
  // transaction, so the stage transition is atomic: either the whole stage is
  // committed or none of it is. A crash mid-stage leaves the run at the prior
  // committed stage — re-tick re-runs this stage cleanly.
  await db.$transaction([
    ...outcome.loops.map((lp) =>
      db.gateLog.create({
        data: {
          runId: run.id,
          stage: stageN,
          loop: lp.loop,
          round1: lp.round1 as unknown as object,
          round2: lp.round2 as unknown as object,
          resolution: lp.resolution,
        },
      }),
    ),
    db.factoryArtifact.create({
      data: {
        runId: run.id,
        stage: stageN,
        kind: stage.artifactKind,
        payload: outcome.artifact as unknown as object,
      },
    }),
  ]);

  // ── Escalation: a gate hit its ceiling. Stop and surface to Dennis. ───────
  if (outcome.resolution === 'escalate') {
    await db.run.update({
      where: { id: run.id },
      data: { status: 'escalated' },
    });
    return { runId: run.id, stage: stageN, status: 'escalated', stopped: true };
  }

  // ── Gate passed. Decide the next state. ───────────────────────────────────

  // Human gate: pass, but STOP for operator approval before advancing.
  if (stage.humanGate) {
    await db.run.update({
      where: { id: run.id },
      data: { status: 'awaiting_human_gate' },
    });
    return { runId: run.id, stage: stageN, status: 'awaiting_human_gate', stopped: true };
  }

  // Final stage with no human gate would be unusual; stage 8 HAS a human gate
  // so it's handled above. Auto-advance stages (no human gate, stage < last):
  const isLast = stageN === STAGES.length;
  if (!isLast) {
    await db.run.update({
      where: { id: run.id },
      data: { stage: stageN + 1, status: 'running' },
    });
    return { runId: run.id, stage: stageN + 1, status: 'running', stopped: false };
  }

  // Defensive: a final stage without a human gate → treat as draft_ready.
  await finalizeDraft(run.id);
  return { runId: run.id, stage: stageN, status: 'draft_ready', stopped: true };
}

/**
 * Resume a run sitting at a human gate by recording the Decision and advancing.
 * For the PUBLISH gate (stage 8), approval finalizes the Etsy draft object and
 * sets status=draft_ready (NEVER published — the Etsy write token is not
 * connected; see etsyAdapter). For other gates, approval advances to the next
 * stage with status=running so the driver can tick onward.
 */
export async function resumeFromGate(
  run: Run,
  gate: string,
  choice: string,
  by: string,
): Promise<AdvanceResult> {
  const stage = getStage(run.stage);

  await db.decision.create({
    data: { runId: run.id, gate, choice, by },
  });

  // Reject / kill at a human gate → kill the run.
  if (choice === 'reject') {
    await db.run.update({ where: { id: run.id }, data: { status: 'killed' } });
    return { runId: run.id, stage: run.stage, status: 'escalated', stopped: true };
  }

  // The publish gate is the terminal human gate. Approval = finalize draft.
  if (stage.humanGate === 'publish') {
    await finalizeDraft(run.id);
    return { runId: run.id, stage: run.stage, status: 'draft_ready', stopped: true };
  }

  // Non-terminal human gate (niche / brand / channel): approval advances.
  await db.run.update({
    where: { id: run.id },
    data: { stage: run.stage + 1, status: 'running' },
  });
  return { runId: run.id, stage: run.stage + 1, status: 'running', stopped: false };
}

/**
 * Finalize the run as draft_ready: build the schema-valid Etsy draft-listing
 * object from the stage artifacts and persist it as a dedicated artifact. The
 * actual Etsy write POST stays behind the OFF feature flag (etsyAdapter); we
 * record the draft as publish-ready, we do NOT publish.
 */
async function finalizeDraft(runId: string): Promise<void> {
  const priorArtifacts = await loadPriorArtifacts(runId);
  const draft = buildDraftListing(priorArtifacts);

  await db.factoryArtifact.create({
    data: {
      runId,
      stage: 8,
      kind: 'etsy_draft_object',
      payload: draft as unknown as object,
    },
  });
  await db.run.update({
    where: { id: runId },
    data: { status: 'draft_ready' },
  });
}
