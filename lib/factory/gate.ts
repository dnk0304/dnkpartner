/**
 * The gate loop — runs once per stage, parametric over stage N. This is the
 * core adversarial cross-check (ORCHESTRATION §2-3):
 *
 *   PRODUCE → ROUND 1 (independent) → ROUND 2 (adversarial, SKIPPED on a clean
 *                                     unanimous round-1 PASS) → RESOLVE
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
import { PersonaRunner, KISS_PANEL } from './personaRunner';
import { getStage } from './types';
import type {
  ExpertRunner,
  GateContext,
  GateLoopResult,
  Verdict,
  Challenge,
  Review,
} from './types';

export interface GateOutcome {
  /** The artifact that passed (or the best one produced before the cap). */
  artifact: unknown;
  /** One entry per loop attempt — persisted as GateLog rows. */
  loops: GateLoopResult[];
  /**
   * Terminal resolution:
   *   'pass'                — the gate genuinely passed → advance.
   *   'passed_with_caveats' — the fix-loop hit FACTORY_MAX_FIX_LOOPS without
   *                           converging; we ADVANCE with the best artifact so
   *                           far rather than dying. The surviving deltas are
   *                           recorded on the last loop's fixDeltas for audit.
   *                           Treated as a pass by the runner (the run must be
   *                           able to REACH stage 6+, not die at stage 1).
   *   'escalate'            — reserved for a hard stop surfaced to Dennis. The
   *                           bounded fix-loop no longer self-escalates; it
   *                           caps-and-advances. (A producer/LLM throw still
   *                           propagates and stops the run via the runner.)
   */
  resolution: 'pass' | 'passed_with_caveats' | 'escalate';
}

/**
 * Hard ceiling on fix-loop iterations per stage (Dennis, 2026-06-18 — KISS:
 * "stop burning unnecessary thinking"). The OLD behaviour ran up to
 * stage.fixCeiling (3–4) loops and ESCALATED on the last failure — so a stage
 * that never converged (e.g. stage 1) burned ~21 expert calls and then KILLED
 * the run. The new behaviour caps the loop at MAX_FIX_LOOPS *fix attempts* and,
 * at the cap, ADVANCES with the best artifact ('passed_with_caveats') so a run
 * can actually reach stage 6+. The genuine critique still runs every loop — it
 * just terminates instead of looping forever.
 *
 * DEFAULT 1 (Dennis, 2026-06-18 — KISS): one produce + the panel review +
 * AT MOST ONE rewrite on fail, then accept. Override with FACTORY_MAX_FIX_LOOPS
 * (positive integer). The effective per-stage loop count is
 * min(stage.fixCeiling, MAX_FIX_LOOPS), so a stage with a smaller fixCeiling is
 * never raised. With the default 1, every stage runs exactly one review pass and
 * (on fail) exactly one rewrite — see runPanelGate's single-rewrite-then-accept.
 */
const MAX_FIX_LOOPS: number = (() => {
  const raw = process.env.FACTORY_MAX_FIX_LOOPS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
})();

/**
 * Round-2 (adversarial) toggle (Dennis, 2026-06-18 — "maks 6 attempts with 2
 * rewrites, then we are at 9 calls with first run"). Round-2 is the call
 * MULTIPLIER: per loop it adds 3 challenge calls PLUS up to 3 rubber-stamp
 * re-prompts. Dropping it by default collapses a stage from ~14 calls to ~8
 * while keeping genuine critique — round-1 still runs 3 independent experts
 * every loop, which is what catches real flaws.
 *
 * Default OFF. Set FACTORY_ENABLE_ROUND2=1 (or true/yes/on) to restore the full
 * adversarial pass. When OFF, resolveRound(round1, []) decides the loop purely
 * on the 3 independent verdicts; an empty round2 in the GateLog is the auditable
 * signal that round-2 was disabled.
 */
const ENABLE_ROUND2: boolean = (() => {
  const raw = process.env.FACTORY_ENABLE_ROUND2?.trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

/**
 * Hard ceiling on EXPERT-REVIEW calls per stage (round-1 + round-2 + any
 * re-prompts), summed across every loop. Belt-and-braces over MAX_FIX_LOOPS:
 * the moment a loop is about to push the running expert-call total past this
 * cap, the gate STOPS looping and advances with the best artifact so far
 * ('passed_with_caveats') — it never dies at the cap.
 *
 * Default 6 — a safe headroom ceiling that never binds under the KISS default
 * (round-2 OFF, MAX_FIX_LOOPS=1): the single loop fires 3 round-1 calls, well
 * under 6. It only engages if FACTORY_MAX_FIX_LOOPS or FACTORY_ENABLE_ROUND2 is
 * raised. Override with FACTORY_MAX_EXPERT_CALLS (positive integer); raise it if
 * you turn round-2 back on or allow more fix loops.
 */
const MAX_EXPERT_CALLS: number = (() => {
  const raw = process.env.FACTORY_MAX_EXPERT_CALLS?.trim();
  if (!raw) return 6;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 6;
})();

/**
 * How many reviewers gate each stage. DEFAULT 3 = the KISS PANEL (Dennis,
 * 2026-06-18 — "People are simple, lets not overcomplicate things. Its more
 * about finding the right timing for a specific niche and pushing it out
 * there."). The panel is the 3 LIGHTWEIGHT KISS experts defined in
 * personaRunner.ts (TIMING · NICHE-FIT · WILL-IT-SELL+SHIPPABLE) — each a quick
 * verdict + 0–100 score + one-line reason, NOT a market essay. With the default
 * config (round-2 OFF, MAX_FIX_LOOPS=1) a stage = 1 produce + 3 reviews +
 * (1 rewrite on fail → accept) = 4 calls clean / 5 with a rewrite.
 *
 * Set FACTORY_EXPERT_COUNT=1 to fall back to the LEAN single-reviewer path
 * (1 producer + 1 reviewer + at most 1 rewrite, ~2–3 calls/stage) — the prior
 * Monetise-like flow, preserved verbatim in runLeanGate. Both paths share the
 * unchanged FACTORY_ENABLE_ROUND2 / FACTORY_MAX_FIX_LOOPS / FACTORY_MAX_EXPERT_CALLS
 * flags, so the whole change is reversible via env knobs.
 */
const EXPERT_COUNT: number = (() => {
  const raw = process.env.FACTORY_EXPERT_COUNT?.trim();
  if (!raw) return 3;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 3;
})();

/**
 * The single reviewer's pass-bar on the 0–100 score. A review PASSES the stage
 * only when verdict==='PASS' AND score >= this bar. Default 70. Override with
 * FACTORY_REVIEW_PASS_SCORE (1–100). Lean path only (EXPERT_COUNT===1).
 */
const REVIEW_PASS_SCORE: number = (() => {
  const raw = process.env.FACTORY_REVIEW_PASS_SCORE?.trim();
  if (!raw) return 70;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 70;
})();

/**
 * Called by runGate the moment a loop finishes (pass, fix, or escalate), BEFORE
 * the next — potentially throwing — producer fix call. The runner uses this to
 * persist each loop's GateLog row independently, so a later throw (e.g. a
 * rate-limit cap mid-stage) cannot wipe loops that already completed. Awaited so
 * persistence ordering is deterministic. Optional — when omitted (unit tests,
 * scripts) behaviour is unchanged and runGate still returns the full loops[].
 */
export type LoopSink = (loop: GateLoopResult) => Promise<void>;

/**
 * Resolve one round of verdicts+challenges into a decision and the deltas a fix
 * must address. A stage passes when:
 *   - Every expert's EFFECTIVE verdict (round-2 revision if any, else round-1)
 *     is PASS, AND
 *   - No round-2 challenge has severity='blocking'.
 *
 * Round-2 challenges with severity='minor' (or severity omitted, which defaults
 * to 'minor' — fail-open) are recorded in minorDeltas for audit visibility but
 * do NOT block the stage. This is the fix for the impossible-gate bug where any
 * adversarial delta prevented convergence even on clean artifacts.
 *
 * An effective FAIL verdict always blocks regardless of challenge severity.
 */
export function resolveRound(round1: Verdict[], round2: Challenge[]): {
  passed: boolean;
  fixDeltas: string[];
  minorDeltas: string[];
} {
  const challengeBySlug = new Map(round2.map((c) => [c.expert, c]));
  const fixDeltas = new Set<string>();
  const minorDeltas = new Set<string>();
  let passed = true;

  for (const v of round1) {
    const challenge = challengeBySlug.get(v.expert);
    const effective = challenge?.revisedVerdict ?? v.verdict;

    // An effective FAIL verdict (round-1 FAIL not upgraded, OR round-2
    // revisedVerdict=FAIL) is always blocking — collect all its deltas.
    if (effective === 'FAIL') {
      passed = false;
      for (const d of v.deltas) fixDeltas.add(d);
      // If a revisedVerdict=FAIL came from round-2, its deltas are also blocking.
      if (challenge?.revisedVerdict === 'FAIL') {
        for (const d of challenge.deltas) {
          if (d.trim()) fixDeltas.add(d);
        }
      }
    }

    // Round-2 challenge severity gate. Missing severity → 'minor' (fail-open).
    // blocking → blocks the stage (even if the verdict is still PASS).
    // minor    → recorded for the audit trail but does NOT fail the stage.
    if (challenge && effective !== 'FAIL') {
      const sev = challenge.severity ?? 'minor';
      for (const d of challenge.deltas) {
        if (!d.trim()) continue;
        if (sev === 'blocking') {
          fixDeltas.add(d);
          passed = false;
        } else {
          minorDeltas.add(d);
        }
      }
    }
  }

  return { passed, fixDeltas: [...fixDeltas], minorDeltas: [...minorDeltas] };
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
  onLoopComplete?: LoopSink,
): Promise<GateOutcome> {
  // LEAN default (FACTORY_EXPERT_COUNT=1): produce → single reviewer → at most
  // one rewrite on fail → accept. ~2 calls/stage, 3 max. The full expert panel
  // is preserved below and used when EXPERT_COUNT >= 2.
  if (EXPERT_COUNT < 2) {
    return runLeanGate(stageN, seed, priorArtifacts, runner, onLoopComplete);
  }
  return runPanelGate(stageN, seed, priorArtifacts, runner, onLoopComplete);
}

// ─── LEAN gate (default) ──────────────────────────────────────────────────────

/**
 * Monetise-like single-reviewer flow:
 *   1. produce the artifact (input-driven)
 *   2. ONE reviewer scores it 0–100 + honest critique + PASS/FAIL
 *   3. if it fails, run AT MOST ONE rewrite from the reviewer's deltas, then
 *      ACCEPT ('passed_with_caveats') — we do NOT re-review after the rewrite.
 *
 * Resilience (Dennis, 2026-06-18 — a CLI flake must never freeze the run): once
 * we hold ANY artifact, a later LLM throw (reviewer or rewrite, after llm.ts has
 * already retried) NEVER propagates — the stage advances with the best artifact
 * so far ('passed_with_caveats'). Only a failure to produce the FIRST artifact
 * at all (nothing to advance with, after 5 internal retries) propagates.
 */
async function runLeanGate(
  stageN: number,
  seed: string,
  priorArtifacts: Record<number, unknown>,
  runner: ExpertRunner,
  onLoopComplete?: LoopSink,
): Promise<GateOutcome> {
  const stage = getStage(stageN);
  // The single reviewer is the stage's FIRST expert (a real, stage-specific
  // pass-bar — not a generic rubber-stamp).
  const reviewer = stage.experts[0];
  const system = loadExpertPrompt(stageN, reviewer.slug);

  const loops: GateLoopResult[] = [];

  // FIRST produce: this is the only call allowed to propagate (no artifact yet
  // to advance with). llm.ts already retries the flake up to 5×.
  let artifact = await produceStageArtifact({ stage: stageN, seed, priorArtifacts });

  // Single review. If it flakes after llm.ts retries, do NOT freeze the run —
  // accept the produced artifact with caveats (a review flake must not cost us
  // a perfectly good artifact).
  let review: Review;
  try {
    review = await runner.reviewSingle(system, reviewer.slug, {
      stage: stageN,
      seed,
      artifact,
      priorArtifacts,
    });
  } catch (err) {
    const lp = leanCaveatLoop(1, [
      `review call failed after retries (${errMsg(err)}); accepted artifact unreviewed`,
    ]);
    loops.push(lp);
    await onLoopComplete?.(lp);
    return { artifact, loops, resolution: 'passed_with_caveats' };
  }

  const passed = review.verdict === 'PASS' && review.score >= REVIEW_PASS_SCORE;
  if (passed) {
    const lp = leanLoop(1, review, 'pass', []);
    loops.push(lp);
    await onLoopComplete?.(lp);
    return { artifact, loops, resolution: 'pass' };
  }

  // Failed the single reviewer → record loop 1, then run AT MOST ONE rewrite
  // from the cited deltas (or the critique if no deltas), then ACCEPT.
  const deltas = review.deltas.length > 0 ? review.deltas : [review.critique].filter((s) => s.trim());
  const lp1 = leanLoop(1, review, 'fix', deltas);
  loops.push(lp1);
  // Persist loop 1 BEFORE the rewrite produce — that call is the one that can
  // throw on a flake, and loop 1 must already be durable when it does.
  await onLoopComplete?.(lp1);

  // The single rewrite. If it flakes after llm.ts retries, advance with the
  // pre-rewrite artifact (still better than freezing). Either way we ACCEPT.
  try {
    artifact = await produceStageArtifact({ stage: stageN, seed, priorArtifacts, fixDeltas: deltas });
  } catch {
    // rewrite flaked — keep the pre-rewrite artifact; still advance with caveats.
  }
  const lp2 = leanCaveatLoop(2, deltas);
  loops.push(lp2);
  await onLoopComplete?.(lp2);
  return { artifact, loops, resolution: 'passed_with_caveats' };
}

/** Build a lean GateLoopResult that carries the single review in round1[0]. */
function leanLoop(
  loop: number,
  review: Review,
  resolution: GateLoopResult['resolution'],
  fixDeltas: string[],
): GateLoopResult {
  // Map the single review onto the existing GateLoopResult shape so the DB row,
  // the audit trail, and the UI reader stay unchanged: round1 carries one
  // Verdict synthesised from the review; the score+critique ride in reasons.
  const v: Verdict = {
    expert: review.expert,
    verdict: review.verdict,
    reasons: [`score=${review.score}/100`, review.critique].filter((s) => s.trim()),
    deltas: review.deltas,
  };
  return { loop, round1: [v], round2: [], resolution, fixDeltas, minorDeltas: [] };
}

/** A lean caveat loop with no usable review (rewrite/accept or a flake fallback). */
function leanCaveatLoop(loop: number, fixDeltas: string[]): GateLoopResult {
  return { loop, round1: [], round2: [], resolution: 'passed_with_caveats', fixDeltas, minorDeltas: [] };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Panel gate (FACTORY_EXPERT_COUNT >= 2 — the preserved 3-expert path) ─────

async function runPanelGate(
  stageN: number,
  seed: string,
  priorArtifacts: Record<number, unknown>,
  runner: ExpertRunner,
  onLoopComplete?: LoopSink,
): Promise<GateOutcome> {
  const stage = getStage(stageN);
  // KISS panel (Dennis, 2026-06-18): the 3 LIGHTWEIGHT cross-stage experts
  // (TIMING · NICHE-FIT · WILL-IT-SELL+SHIPPABLE) gate EVERY stage — not the 24
  // academic stage-specific personas. Same three decisive lenses everywhere. The
  // vendored stage-N/*.md files stay on disk (used only by the lean path's
  // single reviewer when FACTORY_EXPERT_COUNT=1), so this is reversible by env.
  const prompts = KISS_PANEL.map((e) => ({ slug: e.slug, system: e.system }));

  const loops: GateLoopResult[] = [];
  let artifact = await produceStageArtifact({ stage: stageN, seed, priorArtifacts });
  let fixDeltas: string[] = [];

  // Effective fix-loop ceiling: the SMALLER of this stage's configured ceiling
  // and the global MAX_FIX_LOOPS cap. A stage whose fixCeiling is already <= the
  // cap (e.g. stage 5/6 = 2) is unchanged; a larger one (stage 1 = 3, stage 3 =
  // 4) is clamped down so it can no longer burn 21+ calls then die.
  const effectiveCeiling = Math.min(stage.fixCeiling, MAX_FIX_LOOPS);

  // Running tally of EXPERT-REVIEW calls across all loops (round-1 + round-2 +
  // re-prompts). Used to enforce MAX_EXPERT_CALLS as a hard belt-and-braces cap
  // independent of the loop count. (Re-prompts happen inside PersonaRunner.round2
  // and aren't visible here, so we conservatively count each round2 entry as 1;
  // the real saving comes from round-2 being OFF by default, which removes the
  // re-prompt path entirely.)
  let expertCalls = 0;

  // loop counts attempts: 1..effectiveCeiling. On the final-loop failure we do
  // NOT escalate — we ADVANCE with the best artifact ('passed_with_caveats').
  for (let loop = 1; loop <= effectiveCeiling; loop++) {
    const ctx: GateContext = { stage: stageN, seed, artifact, priorArtifacts };

    // ── Round 1: independent verdicts (parallel — no shared draft) ──────────
    // Resilience: a review-call flake (after llm.ts's internal retries) must
    // NOT freeze the run when we already hold an artifact — advance with caveats.
    let round1: Verdict[];
    try {
      round1 = await Promise.all(
        prompts.map((p) => runner.round1(p.system, p.slug, ctx)),
      );
    } catch (err) {
      const lp = leanCaveatLoop(loop, [
        `round-1 review failed after retries (${errMsg(err)}); advanced with caveats`,
      ]);
      loops.push(lp);
      await onLoopComplete?.(lp);
      return { artifact, loops, resolution: 'passed_with_caveats' };
    }
    expertCalls += round1.length;

    // ── Round 2: adversarial — each sees the other two round-1 verdicts ─────
    //
    // QUOTA SAVER (Dennis, 2026-06-18): round-2 is OFF by default
    // (FACTORY_ENABLE_ROUND2) because it is the per-stage call multiplier — 3
    // challenge calls + up to 3 re-prompts per loop. The 3 independent round-1
    // experts already catch real flaws; the adversarial pass is redundant for
    // the lean target. When round-2 IS enabled, we still skip it on a UNANIMOUS
    // round-1 PASS (nothing to challenge; resolveRound(round1, []) already
    // passes). An empty round2 in the GateLog is the auditable signal that
    // round-2 was disabled or skipped.
    const round1AllPass = round1.every((v) => v.verdict === 'PASS');
    const round2 =
      ENABLE_ROUND2 && !round1AllPass
        ? await Promise.all(
            prompts.map((p) => {
              const own = round1.find((v) => v.expert === p.slug)!;
              const peers = round1.filter((v) => v.expert !== p.slug);
              return runner.round2(p.system, p.slug, ctx, own, peers);
            }),
          )
        : [];
    expertCalls += round2.length;

    const { passed, fixDeltas: deltas, minorDeltas } = resolveRound(round1, round2);

    if (passed) {
      const lp: GateLoopResult = { loop, round1, round2, resolution: 'pass', fixDeltas: [], minorDeltas };
      loops.push(lp);
      await onLoopComplete?.(lp);
      return { artifact, loops, resolution: 'pass' };
    }

    // Failed this loop. Cap-and-advance when EITHER the fix-loop ceiling is
    // reached OR the next loop's round-1 (3 more expert calls) would push the
    // running expert-call total past MAX_EXPERT_CALLS. Whichever binds first
    // stops the loop and advances with the best artifact so far (Dennis
    // directive: a run must REACH stage 6+, not die at stage 1).
    //
    // KISS single-rewrite (Dennis, 2026-06-18): MAX_FIX_LOOPS counts FIX
    // ATTEMPTS. At the fix-loop ceiling with surviving blocking deltas we run
    // EXACTLY ONE targeted rewrite from those deltas and then ACCEPT WITHOUT
    // re-reviewing — so a failing stage = produce(1) + 3 reviews + 1 rewrite = 5
    // calls (vs 4 on a clean pass), matching the ~5-calls/stage target. The
    // MAX_EXPERT_CALLS belt (round-2 path) caps without a rewrite — it is the
    // safety stop, not the normal fail path.
    const nextLoopWouldExceedCalls = expertCalls + round1.length > MAX_EXPERT_CALLS;
    if (loop === effectiveCeiling || nextLoopWouldExceedCalls) {
      const lp: GateLoopResult = {
        loop,
        round1,
        round2,
        resolution: loop === effectiveCeiling && deltas.length > 0 ? 'fix' : 'passed_with_caveats',
        fixDeltas: deltas,
        minorDeltas,
      };
      loops.push(lp);
      // Persist the failing loop BEFORE the rewrite produce (the throwing call).
      await onLoopComplete?.(lp);

      // One targeted rewrite on a genuine fail at the fix-loop ceiling, then
      // accept. Skipped when capping purely on MAX_EXPERT_CALLS (round-2 path)
      // or when there are no actionable deltas. A rewrite flake (after llm.ts
      // retries) keeps the pre-rewrite artifact — still advance with caveats.
      if (loop === effectiveCeiling && deltas.length > 0) {
        try {
          artifact = await produceStageArtifact({
            stage: stageN,
            seed,
            priorArtifacts,
            fixDeltas: deltas,
          });
        } catch {
          // rewrite flaked — keep the pre-rewrite artifact; still advance.
        }
        const cap = leanCaveatLoop(loop + 1, deltas);
        loops.push(cap);
        await onLoopComplete?.(cap);
      }
      return { artifact, loops, resolution: 'passed_with_caveats' };
    }

    const lp: GateLoopResult = { loop, round1, round2, resolution: 'fix', fixDeltas: deltas, minorDeltas };
    loops.push(lp);
    // Persist this loop BEFORE the produce fix call below — that call is the one
    // that can throw on a rate cap, and loop-1 must already be durable when it does.
    await onLoopComplete?.(lp);
    fixDeltas = deltas;
    // Resilience: the fix re-produce is the original freeze seam (a CLI flake
    // here once threw 'stage_failed' and froze the run). After llm.ts retries,
    // if it STILL fails we advance with the best artifact so far rather than
    // throwing — loop `lp` (fix) is already durable above.
    try {
      artifact = await produceStageArtifact({
        stage: stageN,
        seed,
        priorArtifacts,
        fixDeltas,
      });
    } catch {
      const cap = leanCaveatLoop(loop + 1, fixDeltas);
      loops.push(cap);
      await onLoopComplete?.(cap);
      return { artifact, loops, resolution: 'passed_with_caveats' };
    }
  }

  // Unreachable: the loop returns on pass/cap. Defensive: advance with caveats
  // (never escalate from the bounded fix-loop — a run must reach stage 6+).
  return {
    artifact,
    loops,
    resolution: 'passed_with_caveats',
  };
}
