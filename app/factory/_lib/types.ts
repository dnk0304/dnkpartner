/**
 * Client-side types + derivation for the Product Factory CRM board.
 *
 * The API ships two shapes:
 *   - GET /api/factory/runs        → { runs: RunSummary[] }      (board/list feed)
 *   - GET /api/factory/runs/:id    → { run: RunDetail }          (serializeRun)
 *
 * Everything here is PURE: status derivation, the 0-100 score mapping, and the
 * tier/competition visual bands. Kept defensive — real artifact payloads are
 * Json, so we narrow at the edges and degrade gracefully (never fake a score or
 * a tier we can't back with data).
 */

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export type RunStatus =
  | 'running'
  | 'awaiting_human_gate'
  | 'escalated'
  | 'draft_ready'
  | 'published'
  | 'killed';

/**
 * Real per-run progress signal (lib/factory/progress.ts computeRunProgress).
 * Stage X/N is coarse (moves on stage commit); the token-log fields move while
 * a stage is grinding, so the card never looks frozen mid-stage.
 */
export interface RunProgress {
  currentStage: number;
  totalStages: number;
  callsThisRun: number;
  lastActivityAt: string | null;
  isProcessing: boolean;
}

/** GET /api/factory/runs row. */
export interface RunSummary {
  id: string;
  seed: string;
  stage: number;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  /** Live progress — always present from the API; optional for defensive callers. */
  progress?: RunProgress;
}

/** One persisted FactoryArtifact (payload is opaque Json). */
export interface Artifact {
  id: string;
  runId: string;
  stage: number;
  kind: string;
  payload: unknown;
  createdAt: string;
}

/** Expert round-1 verdict (lib/factory/types.ts Verdict). */
export interface Verdict {
  expert: string;
  verdict: 'PASS' | 'FAIL';
  reasons: string[];
  deltas: string[];
}

/** Expert round-2 adversarial challenge (lib/factory/types.ts Challenge). */
export interface Challenge {
  expert: string;
  challengeAttempted: boolean;
  note: string;
  revisedVerdict?: 'PASS' | 'FAIL';
  deltas: string[];
  severity?: 'blocking' | 'minor';
}

/** One GateLog row — round1/round2 land as Json, narrowed here. */
export interface GateLog {
  id: string;
  runId: string;
  stage: number;
  loop: number;
  round1: Verdict[];
  round2: Challenge[];
  resolution: string; // 'pass' | 'fix' | 'escalate'
  createdAt: string;
}

export interface Decision {
  id: string;
  runId: string;
  gate: string;
  choice: string;
  by: string;
  at: string;
}

export interface PendingGate {
  gate: 'niche' | 'brand' | 'channel' | 'publish';
  stage: number;
  message: string;
}

/** GET /api/factory/runs/:id → serializeRun output. */
export interface RunDetail extends RunSummary {
  pendingGate: PendingGate | null;
  artifacts: Artifact[];
  gateLogs: GateLog[];
  decisions: Decision[];
}

// ─── Stage labels (mirrors lib/factory/types.ts STAGES, display copy) ─────────

export interface StageMeta {
  n: number;
  slug: string;
  name: string;
  short: string;
}

export const STAGES: readonly StageMeta[] = [
  { n: 1, slug: 'niche', name: 'Niche Discovery & Validation', short: 'Niche' },
  { n: 2, slug: 'blueprint', name: 'Product Blueprint', short: 'Blueprint' },
  { n: 3, slug: 'build', name: 'Build', short: 'Build' },
  { n: 4, slug: 'audit', name: 'Quality / Competitor Audit', short: 'Audit' },
  { n: 5, slug: 'branding', name: 'Branding & Naming', short: 'Brand' },
  { n: 6, slug: 'channel', name: 'Channel / Marketplace Selection', short: 'Channel' },
  { n: 7, slug: 'storefront', name: 'Storefront Setup', short: 'Storefront' },
  { n: 8, slug: 'launch', name: 'Launch & Connectors', short: 'Launch' },
] as const;

/**
 * Stages 7 (Storefront) and 8 (Launch) are PARKED out of the main flow for now —
 * the storefront-write + launch-connector seams aren't built yet, so showing
 * them as live columns/sections would overstate what the factory can do. They
 * are NOT deleted (the STAGES list above is intact, the engine can still reach
 * them): this flag only controls what the UI presents as the *active* flow. Flip
 * to `true` (here or via NEXT_PUBLIC_SHOW_STAGES_7_8) to bring them back.
 */
export const SHOW_STAGES_7_8: boolean =
  (typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_SHOW_STAGES_7_8?.trim().toLowerCase()
    : undefined) === 'true';

/** The stages the UI presents as the active flow (1–6 by default; 1–8 when 7/8 are un-parked). */
export const ACTIVE_STAGES: readonly StageMeta[] = SHOW_STAGES_7_8
  ? STAGES
  : STAGES.filter((s) => s.n <= 6);

/** Highest active stage number — the denominator for "Stage X / N" + pipeline %. */
export const TOTAL_STAGES = ACTIVE_STAGES.length;

export function stageMeta(n: number): StageMeta {
  return STAGES.find((s) => s.n === n) ?? { n, slug: `stage-${n}`, name: `Stage ${n}`, short: `Stage ${n}` };
}

// ─── Honest card state derivation ────────────────────────────────────────────

/**
 * The enum has no distinct "stopped/stalled" state yet (Forge is adding a
 * lastProgressAt / stalled signal). Until then we derive stall CLIENT-SIDE:
 * a run that is `running` but whose updatedAt is older than this threshold is
 * treated as a stopped draft with a Resume affordance. Swap to the real field
 * (data-only) the moment Forge ships it. This is the "estimated vs verified"
 * provenance discipline — flagged in the résumé.
 */
export const STALL_THRESHOLD_MS = 90_000;

export type CardState =
  | 'running'
  | 'draft_stalled'
  | 'awaiting_gate'
  | 'escalated'
  | 'draft_ready'
  | 'published'
  | 'killed';

export const TERMINAL_STATES: ReadonlySet<CardState> = new Set([
  'draft_ready',
  'published',
  'killed',
]);

/** Is this run still moving (worth polling fast / a candidate for moving cards)? */
export function isNonTerminal(status: RunStatus): boolean {
  return status === 'running' || status === 'awaiting_human_gate' || status === 'escalated';
}

/**
 * The TRUE liveness test, off the real token-log signal (progress.isProcessing
 * = active status AND a call within IDLE_AFTER_MS). A `running` run whose engine
 * is mid-stage has a stale `updatedAt` (it only moves on stage commit) but a
 * FRESH token log — so it must read as "running", never "stalled". We only fall
 * back to the coarse updatedAt clock when there is no progress signal at all.
 */
function isLiveProcessing(run: RunSummary, now: number): boolean {
  const p = run.progress;
  if (p) return p.isProcessing;
  // No progress signal (defensive caller): approximate from updatedAt freshness.
  return now - new Date(run.updatedAt).getTime() <= STALL_THRESHOLD_MS;
}

/**
 * Map RunStatus + liveness → the honest CardState the UI renders. `now` is
 * injectable for deterministic tests.
 *
 * A `running` run is only `draft_stalled` (Resume-able) when it is NOT actively
 * processing — i.e. the token log shows no recent call. While calls are firing
 * mid-stage it stays `running` even though its stage (and `updatedAt`) hasn't
 * moved, so the Resume affordance never appears on a run that is busy.
 */
export function deriveCardState(run: RunSummary, now: number = Date.now()): CardState {
  switch (run.status) {
    case 'awaiting_human_gate':
      return 'awaiting_gate';
    case 'escalated':
      return 'escalated';
    case 'draft_ready':
      return 'draft_ready';
    case 'published':
      return 'published';
    case 'killed':
      return 'killed';
    case 'running':
      return isLiveProcessing(run, now) ? 'running' : 'draft_stalled';
    default:
      return 'running';
  }
}

/**
 * Is the Resume action allowed RIGHT NOW? Resume advances one stage via
 * POST .../tick, which the API only accepts when status === 'running' AND the
 * engine is idle. So Resume is enabled iff the card is `draft_stalled` (a
 * running run with no recent activity). It is disabled (greyed) whenever the run
 * is actively processing, at a human gate, escalated, or terminal — clicking it
 * then is a no-op on the server, so we surface that as a disabled control.
 */
export function isResumable(run: RunSummary, now: number = Date.now()): boolean {
  return deriveCardState(run, now) === 'draft_stalled';
}

// ─── Live progress derivation (stage fill % + honest processing/idle label) ──

/**
 * Expected LLM calls within a single stage, used to fill the bar call-by-call
 * WHILE a stage grinds (instead of jumping only on stage commit). The engine's
 * DEFAULT KISS panel (FACTORY_EXPERT_COUNT=3, round-2 OFF, MAX_FIX_LOOPS=1) is
 * 1 producer + 3 panel reviews + (1 rewrite on fail → accept) = 4 calls clean /
 * 5 with a rewrite — so 5 is the per-stage budget. (Set this to 3 via
 * NEXT_PUBLIC_EXPECTED_CALLS_PER_STAGE if you run FACTORY_EXPERT_COUNT=1, the
 * lean single-reviewer path.) Overridable so it tracks the engine without a code
 * change. Falls back on unset / NaN / ≤0.
 */
export const EXPECTED_CALLS_PER_STAGE: number = (() => {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_EXPECTED_CALLS_PER_STAGE?.trim()
      : undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
})();

/**
 * Cap the within-stage fill short of 100% so a stage never *looks* finished
 * before it actually commits (the bar would otherwise sit full while the gate
 * still runs). The remaining sliver lands the instant the stage advances.
 */
const WITHIN_STAGE_CAP = 0.95;

export type ProgressTone = 'processing' | 'idle' | 'done';

export interface ProgressView {
  /** 0-100 fill: (completedStages + withinStageFraction) / totalStages. */
  percent: number;
  currentStage: number;
  totalStages: number;
  callsThisRun: number;
  /** Estimated calls landed within the CURRENT stage (0..expected). */
  callsThisStage: number;
  /** Per-stage call budget the within-stage bar fills against. */
  expectedPerStage: number;
  /** 0..1 progress through the current stage, by calls/expected. */
  withinStageFraction: number;
  /** Seconds since the last LLM call, or null when none recorded. */
  lastActivitySeconds: number | null;
  /** processing = live calls firing · idle = active run, no recent call · done = terminal. */
  tone: ProgressTone;
}

/**
 * Derive the bar + live label from a run's progress signal. PURE (now is
 * injectable).
 *
 * The bar now moves WITHIN a stage, not just at stage boundaries:
 *   completedStages = currentStage - 1 (or all N when terminal).
 *   The token log is whole-run + cumulative (runId is null today), so calls in
 *   the current stage ≈ callsThisRun − completedStages × expected, clamped to
 *   [0, expected]. That fraction (capped at 95% until the stage commits) is
 *   added to the completed-stage count, so percent climbs call-by-call and then
 *   snaps forward a whole stage when the engine advances.
 *
 * Honesty guards: only a PROCESSING run shows within-stage fill — an idle/
 * stalled run sits at its completed-stage floor (no fake creep), and a terminal
 * run reads a clean 100%.
 */
export function deriveProgress(run: RunSummary, now: number = Date.now()): ProgressView | null {
  const p = run.progress;
  if (!p) return null;

  const terminal = TERMINAL_STATES.has(deriveCardState(run, now));
  const totalStages = p.totalStages > 0 ? p.totalStages : 1;
  const completedStages = terminal ? totalStages : Math.max(0, p.currentStage - 1);

  const expectedPerStage = EXPECTED_CALLS_PER_STAGE;
  // Cumulative calls attributable to the current stage (best-effort estimate).
  const callsThisStage = Math.max(
    0,
    Math.min(p.callsThisRun - completedStages * expectedPerStage, expectedPerStage),
  );

  // Only fill within-stage while the engine is actually firing calls. An idle or
  // terminal run shows no within-stage creep.
  const withinStageFraction =
    !terminal && p.isProcessing
      ? Math.min(callsThisStage / expectedPerStage, WITHIN_STAGE_CAP)
      : 0;

  const fractionOfPipeline = terminal
    ? 1
    : (completedStages + withinStageFraction) / totalStages;
  const percent = Math.round(fractionOfPipeline * 100);

  const lastActivitySeconds =
    p.lastActivityAt && !Number.isNaN(Date.parse(p.lastActivityAt))
      ? Math.max(0, Math.floor((now - Date.parse(p.lastActivityAt)) / 1000))
      : null;

  const tone: ProgressTone = terminal ? 'done' : p.isProcessing ? 'processing' : 'idle';

  return {
    percent,
    currentStage: p.currentStage,
    totalStages,
    callsThisRun: p.callsThisRun,
    callsThisStage,
    expectedPerStage,
    withinStageFraction,
    lastActivitySeconds,
    tone,
  };
}

/** Human "Ns ago" / "Nm ago" for the last-activity readout. */
export function formatActivityAgo(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── 0-100 score + tier/competition visual bands (re-scaled for the factory) ──

/**
 * Tier band, RE-SCALED to the factory's 0-100 score (the AITrends thresholds
 * key off a low-range opportunity score and would make everything S-tier).
 * Same gradient colours per tier as AITrends getOpportunityTier.
 *   S ≥ 80 · A ≥ 65 · B ≥ 50 · C < 50
 */
export interface Tier {
  tier: 'S' | 'A' | 'B' | 'C';
  /** Tailwind gradient stops for the badge bg-gradient-to-br. */
  color: string;
  /** Tailwind text colour for the numeric score. */
  textColor: string;
}

export function getTier(score: number): Tier {
  if (score >= 80) return { tier: 'S', color: 'from-amber-400 to-orange-500', textColor: 'text-amber-600' };
  if (score >= 65) return { tier: 'A', color: 'from-emerald-400 to-green-500', textColor: 'text-emerald-600' };
  if (score >= 50) return { tier: 'B', color: 'from-blue-400 to-indigo-500', textColor: 'text-blue-600' };
  return { tier: 'C', color: 'from-gray-400 to-gray-500', textColor: 'text-gray-600' };
}

export interface CompetitionBadge {
  label: 'Easy' | 'Medium' | 'Hard';
  /** Tailwind chip classes. */
  color: string;
}

/**
 * Competition badge from a 0-100 competition/saturation score (HIGH = harder).
 * Same colour language as AITrends getCompetitionBadge.
 */
export function getCompetitionBadge(score: number): CompetitionBadge {
  if (score < 34) return { label: 'Easy', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (score < 67) return { label: 'Medium', color: 'bg-amber-100 text-amber-700 border-amber-200' };
  return { label: 'Hard', color: 'bg-rose-100 text-rose-700 border-rose-200' };
}

// ─── Niche-brief angle extraction (the scored ranking the board displays) ─────

export interface ScoredAngle {
  name: string;
  /** Composite 0-100 score (sum of the 5 sub-scores × 2). */
  score: number;
  /** 0-100 competition score (HIGH = harder = a small competitionGap). */
  competition: number;
  /** Raw 1-10 sub-scores for the detail breakdown (may be partial). */
  scores: {
    pain?: number;
    worsening?: number;
    purchasingPower?: number;
    speedToValue?: number;
    competitionGap?: number;
  };
  demandEvidence?: string;
  /** True if this is the producer's recommended angle. */
  recommended?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Extract scored angles from a Stage-1 niche_brief artifact payload.
 * The producer emits 5 sub-scores in a 1-10 band; we compose them into a single
 * 0-100 score (sum × 2, max 50 → 100). competitionGap (HIGH = more open gap =
 * EASIER) is inverted into a 0-100 competition score (HIGH = harder) so the
 * Easy/Medium/Hard badge reads correctly.
 *
 * Returns [] for any payload that doesn't carry recognisable angles — we never
 * fabricate a ranking.
 */
export function extractScoredAngles(artifact: Artifact | undefined | null): ScoredAngle[] {
  if (!artifact || !isRecord(artifact.payload)) return [];
  const payload = artifact.payload;
  const rawAngles = payload.angles;
  if (!Array.isArray(rawAngles)) return [];

  const recommended =
    typeof payload.recommendedAngle === 'string' ? payload.recommendedAngle : undefined;

  const out: ScoredAngle[] = [];
  for (const raw of rawAngles) {
    if (!isRecord(raw)) continue;
    const name = typeof raw.name === 'string' ? raw.name : undefined;
    if (!name) continue;
    const s = isRecord(raw.scores) ? raw.scores : {};

    const pain = num(s.pain);
    const worsening = num(s.worsening);
    const purchasingPower = num(s.purchasingPower);
    const speedToValue = num(s.speedToValue);
    const competitionGap = num(s.competitionGap);

    const subs = [pain, worsening, purchasingPower, speedToValue, competitionGap].filter(
      (x): x is number => typeof x === 'number',
    );
    // Compose 0-100: sum of available sub-scores scaled by how many we have.
    // Full 5 sub-scores (max 50) → ×2 = 100. Partial → scaled to the same band.
    const score =
      subs.length > 0
        ? Math.round((subs.reduce((a, b) => a + b, 0) / (subs.length * 10)) * 100)
        : 0;

    // competitionGap 1-10 (high = open) → competition 0-100 (high = hard) = invert.
    const competition =
      competitionGap !== undefined ? Math.round((10 - competitionGap) * 10) : 50;

    out.push({
      name,
      score,
      competition,
      scores: { pain, worsening, purchasingPower, speedToValue, competitionGap },
      demandEvidence: typeof raw.demandEvidence === 'string' ? raw.demandEvidence : undefined,
      recommended: recommended ? name === recommended : false,
    });
  }
  return out;
}

/**
 * The single headline score for a card's CURRENT stage, if any. Finds the
 * latest artifact for the run's current stage, extracts scored angles, and
 * returns the top score (0-100) — or null when the stage has no scored artifact
 * (we omit the tier badge rather than fake one).
 */
export function headlineScoreForStage(
  artifacts: Artifact[] | undefined,
  stage: number,
): number | null {
  if (!artifacts?.length) return null;
  const forStage = artifacts.filter((a) => a.stage === stage);
  const angles = forStage.flatMap((a) => extractScoredAngles(a));
  if (!angles.length) return null;
  return Math.max(...angles.map((a) => a.score));
}
