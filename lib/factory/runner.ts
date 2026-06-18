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

/**
 * Optional stage ceiling for audit runs. When FACTORY_STAGE_CEILING=N, the run
 * stops cleanly after stage N passes — no stage N+1 producer call, no GateLog
 * or artifact rows. Unset (default) → all 8 stages run as normal.
 *
 * Stage 6 has a humanGate='channel' so it already stops at awaiting_human_gate
 * in normal flow. The ceiling is a belt-and-braces guard ensuring that even if
 * the driver auto-approves the human gate, the run does not advance past N.
 * Enforced in both advanceOneStage AND resumeFromGate.
 */
const STAGE_CEILING: number | null = (() => {
  const raw = process.env.FACTORY_STAGE_CEILING?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
})();

export type AdvanceState =
  | 'awaiting_human_gate'
  | 'running'
  | 'escalated'
  | 'draft_ready'
  /**
   * Run stopped at the FACTORY_STAGE_CEILING (local audit only). The DB status
   * is set to 'draft_ready' (no migration needed — RunStatus is a Prisma enum
   * and ceiling_reached would require a migration). The driver sees stopped:true
   * and the status field in the return value is 'ceiling_reached' so call-sites
   * can distinguish it from a genuine draft.
   */
  | 'ceiling_reached';

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
  //
  // Durability: each loop's GateLog row is committed the INSTANT that loop
  // finishes (via the onLoopComplete sink below), NOT batched at end-of-stage.
  // A stage is many heavy LLM calls; if a later loop's producer fix call throws
  // (e.g. a rate-limit cap), the loops that already passed stay in the DB. The
  // old single end-of-stage $transaction meant any mid-stage throw discarded
  // every completed loop — runGate never returned, so nothing was ever written.
  //
  // Idempotency (option a — "latest re-run wins", no migration): a stage can be
  // re-ticked after a partial failure (some loops persisted, a later loop threw,
  // run still 'running' at this stage). A re-tick re-runs from loop-1, so before
  // creating each loop we deleteMany the prior row for {runId, stage, loop}. The
  // GateLog model has no @@unique on (runId, stage, loop), so delete-then-create
  // is the simplest correct guard; the audit trail keeps the most recent attempt
  // per loop, which is the honest current state.
  const outcome = await runGate(stageN, run.seed, priorArtifacts, undefined, async (lp) => {
    await db.gateLog.deleteMany({ where: { runId: run.id, stage: stageN, loop: lp.loop } });
    await db.gateLog.create({
      data: {
        runId: run.id,
        stage: stageN,
        loop: lp.loop,
        round1: lp.round1 as unknown as object,
        round2: lp.round2 as unknown as object,
        resolution: lp.resolution,
      },
    });
  });

  // The artifact is only meaningful once the stage actually resolved (pass /
  // escalate), so it is written AFTER runGate returns — by which point there is
  // no half-stage to roll back, hence no transaction needed. deleteMany the
  // prior stage artifact first so a re-tick replaces rather than stacks (option a).
  await db.factoryArtifact.deleteMany({ where: { runId: run.id, stage: stageN } });
  await db.factoryArtifact.create({
    data: {
      runId: run.id,
      stage: stageN,
      kind: stage.artifactKind,
      payload: outcome.artifact as unknown as object,
    },
  });

  // ── Escalation: a gate hit its ceiling. Stop and surface to Dennis. ───────
  if (outcome.resolution === 'escalate') {
    await db.run.update({
      where: { id: run.id },
      data: { status: 'escalated' },
    });
    return { runId: run.id, stage: stageN, status: 'escalated', stopped: true };
  }

  // ── Gate passed. Decide the next state. ───────────────────────────────────

  // Stage ceiling: if this stage equals or exceeds the audit ceiling, stop
  // cleanly. The stage's artifact + GateLogs are already committed above.
  // DB status → 'draft_ready' (reusing an existing RunStatus enum value to
  // avoid a migration; ceiling_reached would require a schema change on the
  // critical path). The return value carries 'ceiling_reached' so call-sites
  // can distinguish it from a genuine publish-ready draft.
  if (STAGE_CEILING !== null && stageN >= STAGE_CEILING) {
    await db.run.update({
      where: { id: run.id },
      data: { status: 'draft_ready' },
    });
    return { runId: run.id, stage: stageN, status: 'ceiling_reached', stopped: true };
  }

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

  // Stage ceiling guard: if the current stage is at or beyond the ceiling,
  // refuse to advance even on an approved human gate (belt-and-braces for the
  // audit driver that auto-approves). The Decision row is already committed.
  // DB status → 'draft_ready' (same reasoning as advanceOneStage — no migration).
  if (STAGE_CEILING !== null && run.stage >= STAGE_CEILING) {
    await db.run.update({
      where: { id: run.id },
      data: { status: 'draft_ready' },
    });
    return { runId: run.id, stage: run.stage, status: 'ceiling_reached', stopped: true };
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
