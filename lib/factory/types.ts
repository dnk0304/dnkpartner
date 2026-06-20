/**
 * Product Factory — core types, stage configuration, and the ExpertRunner seam.
 *
 * This file is the contract layer the whole runner is built on. It encodes:
 *   - the expert OUTPUT CONTRACT (VERDICT = PASS|FAIL + deltas), parsed to `Verdict`
 *   - the per-stage configuration (slug, experts, fix-loop ceiling, human gate)
 *   - the ExpertRunner interface — the typed seam so a real fleet subagent
 *     (Scout/Marketing/Vinci) can replace the v1 PersonaRunner as a drop-in.
 *
 * Spec: docs/ORCHESTRATION.md §2-3, BLUEPRINT.md §1. Nothing here calls the
 * model or the DB — pure types + config, safe to import anywhere.
 */

// ─── Expert verdicts (the OUTPUT CONTRACT every /stages/.../experts/*.md emits)

export type VerdictValue = 'PASS' | 'FAIL';

/** One expert's independent (round 1) verdict on a stage artifact. */
export interface Verdict {
  /** Which expert produced this (the role file slug, e.g. "demand-data-analyst"). */
  expert: string;
  verdict: VerdictValue;
  /** Why — short reasons. Always present. */
  reasons: string[];
  /** If FAIL: the specific, actionable deltas to fix. Empty on PASS. */
  deltas: string[];
}

/**
 * Round-2 adversarial output for one expert. The expert sees the other two
 * round-1 verdicts and must EITHER cite a concrete challenge OR explicitly
 * state it tried to break a peer and could not. `challengeAttempted=false`
 * with no `revisedVerdict` is the rubber-stamp tell we re-prompt once.
 *
 * severity classifies the round-2 challenge so `resolveRound` can distinguish
 * material defects from minor nitpicks:
 *   'blocking' — a genuine material defect; fails the stage and loops.
 *   'minor'    — a nitpick / nice-to-have; recorded in the GateLog but does
 *                NOT block the stage from passing.
 * Missing/unset severity → treated as 'minor' (fail-open: prevents spurious
 * blocks; a real FAIL verdict always blocks regardless of severity).
 */
export interface Challenge {
  expert: string;
  /** Did this expert actually attempt to break a peer's verdict? */
  challengeAttempted: boolean;
  /** The concrete challenge text, or the explicit "I tried to break X and could not because…". */
  note: string;
  /** If the expert changed its own verdict after seeing peers, the new value. */
  revisedVerdict?: VerdictValue;
  /** Deltas surviving / introduced by this round. */
  deltas: string[];
  /**
   * Whether this challenge's deltas are blocking or merely minor.
   * Omitted → 'minor' (fail-open). An effective FAIL verdict always blocks
   * regardless of this field.
   */
  severity?: 'blocking' | 'minor';
}

/**
 * One single-reviewer review of a stage artifact (the LEAN default path —
 * FACTORY_EXPERT_COUNT=1, Monetise-like "produce → check → done"). ONE reviewer
 * returns a real 0–100 quality score, a short HONEST critique, and a PASS/FAIL
 * verdict, plus the deltas a rewrite must address on FAIL. This is the
 * differentiator vs a rubber-stamp: the score and critique are genuine, not
 * canned. When FACTORY_EXPERT_COUNT >= 2 the gate uses the round1/round2 panel
 * instead (see gate.ts) and this path is dormant.
 */
export interface Review {
  /** Which reviewer produced this (the stage's first expert slug). */
  expert: string;
  /** Real 0–100 quality score. The pass-bar is FACTORY_REVIEW_PASS_SCORE (default 70). */
  score: number;
  verdict: VerdictValue;
  /** Short, honest critique — what is strong and what is weak. Always present. */
  critique: string;
  /** If FAIL: the specific, actionable deltas a single rewrite must address. */
  deltas: string[];
}

export type GateResolution = 'pass' | 'fix' | 'passed_with_caveats' | 'escalate';

/** The full outcome of one gate loop attempt — persisted as a GateLog row. */
export interface GateLoopResult {
  loop: number;
  round1: Verdict[];
  round2: Challenge[];
  resolution: GateResolution;
  /** Union of BLOCKING deltas that must be addressed by the next fix (empty on pass). */
  fixDeltas: string[];
  /**
   * Round-2 deltas classified as 'minor' (non-blocking). Recorded for audit
   * visibility — they are real feedback but did not fail the stage. Empty when
   * there are no minor notes or on escalate.
   */
  minorDeltas: string[];
}

// ─── ExpertRunner seam ──────────────────────────────────────────────────────
// v1 binds every expert to PersonaRunner (a prompt-persona on the shared model).
// Binding a real fleet subagent later means writing another ExpertRunner impl
// and switching on StageExpert.binding — no change to the gate loop.

export type ExpertBinding =
  | 'persona'   // v1 default: prompt-persona on the shared model
  | 'scout'     // Stage 1 demand/competition — real research subagent (future)
  | 'marketing' // Stage 6/8 channel + SEO/copy (future)
  | 'vinci'     // Stage 3/5/7 visual craft (future)
  | 'forge'     // Stage 3 build (future)
  | 'pixel';    // Stage 3 build UI (future)

export interface StageExpert {
  /** Role file slug — maps to lib/factory/experts/stage-N/<slug>.md. */
  slug: string;
  /** Runtime binding. v1: always 'persona'. */
  binding: ExpertBinding;
}

/** Context handed to an ExpertRunner for one gate. */
export interface GateContext {
  stage: number;
  seed: string;
  /** The artifact under review (stringified for the prompt). */
  artifact: unknown;
  /** Prior-stage artifacts, keyed by stage number (for cross-stage reasoning). */
  priorArtifacts: Record<number, unknown>;
}

/**
 * The seam. A runner takes one expert's system prompt + the gate context and
 * returns a structured verdict (round 1) or challenge (round 2). The
 * PersonaRunner impl uses one Claude JSON call per method; a future
 * subagent-bound impl would dispatch to a fleet agent instead.
 */
export interface ExpertRunner {
  /**
   * LEAN default (FACTORY_EXPERT_COUNT=1): one reviewer returns a 0–100 score +
   * honest critique + PASS/FAIL on the artifact. One Claude call.
   */
  reviewSingle(systemPrompt: string, expertSlug: string, ctx: GateContext): Promise<Review>;
  round1(systemPrompt: string, expertSlug: string, ctx: GateContext): Promise<Verdict>;
  round2(
    systemPrompt: string,
    expertSlug: string,
    ctx: GateContext,
    ownVerdict: Verdict,
    peerVerdicts: Verdict[],
  ): Promise<Challenge>;
}

// ─── Stage configuration ──────────────────────────────────────────────────────

export type HumanGate = 'niche' | 'brand' | 'channel' | 'publish';

export interface StageConfig {
  n: number;
  /** Matches the lib/factory/experts/stage-N directory and the producer key. */
  slug: string;
  name: string;
  /** Artifact `kind` written to FactoryArtifact.kind. */
  artifactKind: string;
  /** The 3 distinct experts that gate this stage. */
  experts: [StageExpert, StageExpert, StageExpert];
  /** Fix-loop ceiling (BLUEPRINT §1). On exceeding → escalate. */
  fixCeiling: number;
  /** If set, the run stops at this human gate AFTER the stage passes. */
  humanGate: HumanGate | null;
}

const persona = (slug: string): StageExpert => ({ slug, binding: 'persona' });

/**
 * The 8 stages. Expert slugs match the vendored role files exactly. Fix
 * ceilings and human gates are verbatim from BLUEPRINT.md §1 / ORCHESTRATION
 * §3 — do not tune without a brief.
 */
export const STAGES: readonly StageConfig[] = [
  {
    n: 1, slug: 'niche', name: 'Niche Discovery & Validation', artifactKind: 'niche_brief',
    experts: [persona('demand-data-analyst'), persona('saturation-competition-specialist'), persona('buyer-psychology-pain-specialist')],
    fixCeiling: 3, humanGate: 'niche',
  },
  {
    n: 2, slug: 'blueprint', name: 'Product Blueprint', artifactKind: 'blueprint',
    experts: [persona('offer-architect'), persona('seo-market-specialist'), persona('production-feasibility-engineer')],
    fixCeiling: 3, humanGate: null,
  },
  {
    n: 3, slug: 'build', name: 'Build', artifactKind: 'build',
    experts: [persona('domain-correctness-expert'), persona('ux-design-specialist'), persona('technical-qa')],
    fixCeiling: 4, humanGate: null,
  },
  {
    n: 4, slug: 'audit', name: 'Quality / Competitor Audit', artifactKind: 'audit_report',
    experts: [persona('content-superset-checker'), persona('premium-feel-checker'), persona('pricing-positioning-checker')],
    fixCeiling: 3, humanGate: null,
  },
  {
    n: 5, slug: 'branding', name: 'Branding & Naming', artifactKind: 'brand_package',
    experts: [persona('brand-strategist'), persona('naming-trademark-specialist'), persona('visual-identity-director')],
    fixCeiling: 2, humanGate: 'brand',
  },
  {
    n: 6, slug: 'channel', name: 'Channel / Marketplace Selection', artifactKind: 'channel_recommendation',
    experts: [persona('marketplace-fit-analyst'), persona('fees-economics-specialist'), persona('audience-traffic-specialist')],
    fixCeiling: 2, humanGate: 'channel',
  },
  {
    n: 7, slug: 'storefront', name: 'Storefront Setup', artifactKind: 'storefront_draft',
    experts: [persona('store-conversion-specialist'), persona('policy-compliance-specialist'), persona('merchandising-specialist')],
    fixCeiling: 3, humanGate: null,
  },
  {
    n: 8, slug: 'launch', name: 'Launch & Connectors', artifactKind: 'draft_listing',
    experts: [persona('integrations-automation-engineer'), persona('email-marketing-specialist'), persona('launch-growth-specialist')],
    fixCeiling: 3, humanGate: 'publish',
  },
] as const;

export function getStage(n: number): StageConfig {
  const s = STAGES.find((x) => x.n === n);
  if (!s) throw new Error(`No stage config for stage ${n}`);
  return s;
}

/** Maps a human-gate slug to the stage number it stops at. */
export const HUMAN_GATE_STAGE: Record<HumanGate, number> = {
  niche: 1, brand: 5, channel: 6, publish: 8,
};
