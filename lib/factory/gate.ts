/**
 * The gate loop — runs once per stage, parametric over stage N. This is the
 * core adversarial cross-check (ORCHESTRATION §2-3):
 *
 *   PRODUCE → ROUND 1 (independent) → ROUND 2 (adversarial) → RESOLVE
 *     all-PASS, no surviving dissent → gate pass
 *     any surviving FAIL → targeted FIX (cited deltas only) → re-loop
 *     loop == ceiling → ESCALATE
 *
 * Each loop attempt yields a GateLoopResult (persisted as a GateLog row by the
 * runner). The gate returns the final artifact + the full loop history + the
 * terminal resolution. The runner owns DB writes and stage advancement.
 */

import { produceStageArtifact } from './producers';
import { loadExpertPrompt } from './experts';
import { PersonaRunner } from './personaRunner';
import { getStage } from './types';
import type {
  ExpertRunner,
  GateContext,
  GateLoopResult,
  Verdict,
  Challenge,
} from './types';

export interface GateOutcome {
  /** The artifact that passed (or the last one produced before escalation). */
  artifact: unknown;
  /** One entry per loop attempt — persisted as GateLog rows. */
  loops: GateLoopResult[];
  /** Terminal resolution: 'pass' (advance) or 'escalate' (stop, surface to Dennis). */
  resolution: 'pass' | 'escalate';
}

/**
 * Resolve one round of verdicts+challenges into a decision and the deltas a fix
 * must address. A stage passes only when, after the adversarial round, every
 * expert's EFFECTIVE verdict (round-2 revision if any, else round-1) is PASS
 * and no surviving deltas remain. Any effective FAIL → fix.
 */
export function resolveRound(round1: Verdict[], round2: Challenge[]): {
  passed: boolean;
  fixDeltas: string[];
} {
  const challengeBySlug = new Map(round2.map((c) => [c.expert, c]));
  const fixDeltas = new Set<string>();
  let passed = true;

  for (const v of round1) {
    const challenge = challengeBySlug.get(v.expert);
    const effective = challenge?.revisedVerdict ?? v.verdict;
    if (effective === 'FAIL') {
      passed = false;
      for (const d of v.deltas) fixDeltas.add(d);
    }
    // Surviving deltas raised in round 2 (e.g. a peer broke a weak PASS) also
    // block the gate even if the owner's verdict text still says PASS.
    if (challenge) {
      for (const d of challenge.deltas) {
        if (d.trim()) {
          fixDeltas.add(d);
          passed = false;
        }
      }
    }
  }

  return { passed, fixDeltas: [...fixDeltas] };
}

/**
 * Run the full gate loop for one stage. Produces the artifact, runs the
 * adversarial gate, and applies targeted fixes up to the stage's fix ceiling.
 *
 * @param runner  the ExpertRunner (v1: PersonaRunner). Injectable for testing /
 *                future subagent binding.
 */
export async function runGate(
  stageN: number,
  seed: string,
  priorArtifacts: Record<number, unknown>,
  runner: ExpertRunner = new PersonaRunner(),
): Promise<GateOutcome> {
  const stage = getStage(stageN);
  const prompts = stage.experts.map((e) => ({
    slug: e.slug,
    system: loadExpertPrompt(stageN, e.slug),
  }));

  const loops: GateLoopResult[] = [];
  let artifact = await produceStageArtifact({ stage: stageN, seed, priorArtifacts });
  let fixDeltas: string[] = [];

  // loop counts attempts: 1..fixCeiling. On the ceiling-th failure we escalate.
  for (let loop = 1; loop <= stage.fixCeiling; loop++) {
    const ctx: GateContext = { stage: stageN, seed, artifact, priorArtifacts };

    // ── Round 1: independent verdicts (parallel — no shared draft) ──────────
    const round1 = await Promise.all(
      prompts.map((p) => runner.round1(p.system, p.slug, ctx)),
    );

    // ── Round 2: adversarial — each sees the other two round-1 verdicts ─────
    const round2 = await Promise.all(
      prompts.map((p) => {
        const own = round1.find((v) => v.expert === p.slug)!;
        const peers = round1.filter((v) => v.expert !== p.slug);
        return runner.round2(p.system, p.slug, ctx, own, peers);
      }),
    );

    const { passed, fixDeltas: deltas } = resolveRound(round1, round2);

    if (passed) {
      loops.push({ loop, round1, round2, resolution: 'pass', fixDeltas: [] });
      return { artifact, loops, resolution: 'pass' };
    }

    // Failed this loop. If we're at the ceiling, escalate; else targeted fix.
    if (loop === stage.fixCeiling) {
      loops.push({ loop, round1, round2, resolution: 'escalate', fixDeltas: deltas });
      return { artifact, loops, resolution: 'escalate' };
    }

    loops.push({ loop, round1, round2, resolution: 'fix', fixDeltas: deltas });
    fixDeltas = deltas;
    artifact = await produceStageArtifact({
      stage: stageN,
      seed,
      priorArtifacts,
      fixDeltas,
    });
  }

  // Unreachable: the loop returns on pass/escalate. Defensive escalate.
  return {
    artifact,
    loops,
    resolution: 'escalate',
  };
}
