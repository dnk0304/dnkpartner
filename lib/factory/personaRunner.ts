/**
 * PersonaRunner — the v1 ExpertRunner: every expert is a prompt-persona on the
 * shared model (claude-opus-4-8). This is the only ExpertRunner impl for v1;
 * binding a real fleet subagent later is a second impl switched on
 * StageExpert.binding (see types.ts → ExpertBinding). The gate loop (gate.ts)
 * depends only on the ExpertRunner interface, so that swap is a drop-in.
 *
 * round1: each expert scores the artifact INDEPENDENTLY (no peer context) →
 *         { verdict, reasons, deltas } per its written pass-bar.
 * round2: each expert sees the other two round-1 verdicts and must run its
 *         ADVERSARIAL brief — cite a concrete challenge OR explicitly state
 *         "I tried to break X and could not, because…". A round-2 reply that
 *         neither challenged nor explained is the rubber-stamp tell; we
 *         re-prompt that expert ONCE for a real challenge (ORCHESTRATION §2).
 */

import { callClaudeJSON } from './llm';
import type {
  ExpertRunner,
  GateContext,
  Verdict,
  Challenge,
  Review,
  VerdictValue,
} from './types';

// ─── JSON schemas the model must conform to (json_schema mode) ───────────────

const VERDICT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    reasons: { type: 'array', items: { type: 'string' } },
    deltas: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'reasons', 'deltas'],
};

// LEAN single-reviewer schema (FACTORY_EXPERT_COUNT=1). One reviewer, one call:
// a real 0–100 score, an honest short critique, a PASS/FAIL, and (on FAIL) the
// concrete deltas a single rewrite must address.
const REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    critique: { type: 'string' },
    deltas: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'verdict', 'critique', 'deltas'],
};

const CHALLENGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    challengeAttempted: { type: 'boolean' },
    note: { type: 'string' },
    revisedVerdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    deltas: { type: 'array', items: { type: 'string' } },
    severity: { type: 'string', enum: ['blocking', 'minor'] },
  },
  // revisedVerdict optional — only when the expert changes its own call.
  // severity optional — missing treated as 'minor' (fail-open) by resolveRound.
  required: ['challengeAttempted', 'note', 'deltas', 'severity'],
};

// ─── KISS panel personas (Dennis, 2026-06-18 — the DEFAULT 3-expert panel) ───
//
// "implement the KISS model into them. People are simple, lets not overcomplicate
// things. Its more about finding the right timing for a specific niche and pushing
// it out there." — Dennis.
//
// These 3 LIGHTWEIGHT experts REPLACE the 24 academic stage-specific personas as
// the panel's reviewers (FACTORY_EXPERT_COUNT>=2). They are a FIXED cross-stage
// triad — the same three lenses gate every stage — so the panel is 3 universal,
// decisive judgments, not 24 multi-paragraph market essays. The vendored
// stage-N/*.md role files stay on disk untouched; flipping FACTORY_EXPERT_COUNT=1
// returns to the lean single-reviewer (which still loads stage.experts[0]).
//
// Each persona returns a quick verdict + a genuine 0–100 score + ONE-LINE reason.
// The score rides in reasons[0] as "score=NN/100" (same convention the lean path
// uses) so we keep a real, honest number — our edge over Monetise's canned output
// — without a schema or type change. Be brief and decisive; no market essays.

const KISS_PHILOSOPHY =
  'PHILOSOPHY: People are simple. Do NOT overcomplicate this. A product wins on ' +
  'TIMING + a SPECIFIC NICHE + SHIPPING FAST — not on exhaustive analysis. Be brief ' +
  'and decisive. Give a quick honest verdict, a genuine 0–100 score, and ONE clear ' +
  'reason. No multi-paragraph market essays, no hedging, no academic framing.';

const KISS_OUTPUT_CONTRACT =
  'OUTPUT: Return strictly as JSON. verdict = PASS | FAIL (FAIL only when your one ' +
  "lens genuinely isn't met). reasons = an array whose FIRST element is exactly " +
  '"score=NN/100" (your honest 0–100 score on YOUR lens — be discerning, reserve ' +
  '85+ for a clear winner and <60 for a real miss) and whose SECOND element is your ' +
  'ONE-LINE reason (a single short sentence). deltas = if FAIL, 1–3 specific one-line ' +
  'fixes the rewrite must make; empty array if PASS. Keep every string short.';

export interface KissExpert {
  slug: string;
  system: string;
}

/**
 * The fixed KISS panel — TIMING · NICHE-FIT · WILL-IT-SELL+SHIPPABLE. Exported so
 * the gate's panel path uses these three instead of loading the 24 vendored
 * stage personas. Order is stable (used for round-2 peer pairing if ever
 * re-enabled).
 */
export const KISS_PANEL: readonly KissExpert[] = [
  {
    slug: 'kiss-timing',
    system:
      'You are TIMING — the right-moment judge on a KISS product panel.\n\n' +
      KISS_PHILOSOPHY +
      '\n\nYOUR ONE LENS: Is NOW the right moment for this niche? Is it trending, ' +
      'seasonal, or freshly relevant right now — or is it stale, faded, or already ' +
      'peaked? You care ONLY about timing. A great product at the wrong moment FAILS; ' +
      'an ordinary product at the right moment SELLS. Judge whether the timing window ' +
      'is open right now.\n\n' +
      KISS_OUTPUT_CONTRACT,
  },
  {
    slug: 'kiss-niche-fit',
    system:
      'You are NICHE-FIT — the specificity judge on a KISS product panel.\n\n' +
      KISS_PHILOSOPHY +
      '\n\nYOUR ONE LENS: Is this specific enough, aimed at a REAL, reachable ' +
      'audience? A tight, named niche with people you can actually find and reach ' +
      'PASSES; something generic, vague, or "for everyone" FAILS. You care ONLY about ' +
      'niche specificity and reachability — not timing, not price. Decide if the niche ' +
      'is sharp enough to win.\n\n' +
      KISS_OUTPUT_CONTRACT,
  },
  {
    slug: 'kiss-will-it-sell',
    system:
      'You are WILL-IT-SELL — the demand-and-shippability judge on a KISS product ' +
      'panel.\n\n' +
      KISS_PHILOSOPHY +
      '\n\nYOUR ONE LENS: Would real people actually PAY for this, AND can it be ' +
      'pushed out FAST? Two halves, one verdict: genuine willingness to pay, and a ' +
      'product simple enough to ship quickly. A thing nobody pays for FAILS; a thing ' +
      'people want but that takes forever to build also FAILS the "ship fast" half. ' +
      'Pass only when it sells AND ships fast.\n\n' +
      KISS_OUTPUT_CONTRACT,
  },
] as const;

// ─── Prompt assembly helpers ─────────────────────────────────────────────────

// ─── Workbook audit lens (brief §2b) ─────────────────────────────────────────
//
// A Stage-3 artifact for a COMPUTATIONAL product carries a `workbook` whose
// `base64` is a giant .xlsx blob — opaque noise that JSON.stringify dumps into the
// prompt verbatim, blinding the experts to the actual spreadsheet. This lens
// turns the workbook's AUDIT MANIFEST (formulaCount / formulaSamples /
// sheetSummary, surfaced by producers.ts from the COERCED sheets) into a compact
// human-readable WORKBOOK section the experts can actually judge. Pure + unit-
// testable: takes the artifact, returns the section text or null (no workbook →
// inert). The base64 strip happens in artifactBlock so this helper stays pure.

/** Narrow shape of the manifest fields we read off a Stage-3 workbook artifact. */
interface WorkbookManifestView {
  base64?: unknown;
  computational?: unknown;
  formulaCount?: unknown;
  formulaSamples?: unknown;
  sheetSummary?: unknown;
}

/** Does this artifact carry a Stage-3 workbook (object with a base64 .xlsx blob)? */
function getWorkbook(artifact: unknown): WorkbookManifestView | null {
  if (!artifact || typeof artifact !== 'object') return null;
  const wb = (artifact as { workbook?: unknown }).workbook;
  if (!wb || typeof wb !== 'object') return null;
  const view = wb as WorkbookManifestView;
  if (typeof view.base64 !== 'string') return null;
  return view;
}

/**
 * Build the human-readable WORKBOOK audit section for the gate prompt, or null
 * when no Stage-3 workbook is present (the lens is INERT for prose products and
 * non-build stages). Pure — does not mutate the artifact. Compact single block
 * (FIX 3 token discipline): sheets, total live-formula cells, sample formulas.
 */
export function workbookAuditBlock(artifact: unknown): string | null {
  const wb = getWorkbook(artifact);
  if (!wb) return null;

  const computational = wb.computational === true;
  const summary = Array.isArray(wb.sheetSummary) ? wb.sheetSummary : [];
  const samples = Array.isArray(wb.formulaSamples) ? wb.formulaSamples : [];
  const formulaCount =
    typeof wb.formulaCount === 'number' && Number.isFinite(wb.formulaCount) ? wb.formulaCount : 0;

  const sheetsLine =
    summary.length > 0
      ? summary
          .map((s) => {
            const o = (s ?? {}) as { name?: unknown; rows?: unknown; formulaCells?: unknown };
            const name = typeof o.name === 'string' ? o.name : 'Sheet';
            const rows = typeof o.rows === 'number' ? o.rows : 0;
            const fc = typeof o.formulaCells === 'number' ? o.formulaCells : 0;
            return `${name} (${rows} rows, ${fc} formula cells)`;
          })
          .join('; ')
      : '(none)';

  const samplesLine =
    samples.length > 0
      ? samples
          .map((s) => {
            const o = (s ?? {}) as { sheet?: unknown; cell?: unknown; formula?: unknown };
            const sheet = typeof o.sheet === 'string' ? o.sheet : '?';
            const cell = typeof o.cell === 'string' ? o.cell : '?';
            const formula = typeof o.formula === 'string' ? o.formula : '';
            return `${sheet}!${cell} = ${formula}`;
          })
          .join(' · ')
      : '(none)';

  return (
    `\n\nWORKBOOK (live-formula spreadsheet — THE COMPUTATIONAL DELIVERABLE):\n` +
    `- computational: ${computational}\n` +
    `- sheets (${summary.length}): ${sheetsLine}\n` +
    `- total live-formula cells: ${formulaCount}\n` +
    `- sample formulas: ${samplesLine}`
  );
}

/**
 * Return a JSON-safe copy of the artifact with the workbook's giant base64 blob
 * stripped (replaced by a placeholder) — so JSON.stringify in the prompt carries
 * the small audit fields but NOT the opaque bytes. No workbook → returns the
 * artifact unchanged.
 */
function stripWorkbookBase64(artifact: unknown): unknown {
  const wb = getWorkbook(artifact);
  if (!wb) return artifact;
  const a = artifact as { workbook?: Record<string, unknown> };
  return {
    ...(artifact as Record<string, unknown>),
    workbook: { ...(a.workbook ?? {}), base64: '<.xlsx bytes omitted>' },
  };
}

// Compact JSON in prompts (no 2-space indent). FIX 3 (Dennis, 2026-06-18): the
// gate re-sends the artifact (+ all prior artifacts) on EVERY round-1/round-2
// call; pretty-print indentation is pure token bloat the model does not need to
// parse JSON. Compacting is behaviour-neutral and trims input tokens per call.
function artifactBlock(ctx: GateContext): string {
  const prior =
    Object.keys(ctx.priorArtifacts).length > 0
      ? `\n\nPRIOR-STAGE ARTIFACTS (context, do not re-litigate earlier stages):\n${JSON.stringify(
          ctx.priorArtifacts,
        )}`
      : '';
  // Strip the base64 .xlsx blob from the artifact VIEW the experts see, then append
  // the compact human-readable WORKBOOK audit section (null/no-op for non-workbook
  // artifacts) so the gate can judge the live formulas instead of opaque bytes.
  const wbAudit = workbookAuditBlock(ctx.artifact) ?? '';
  const artifactView = wbAudit ? stripWorkbookBase64(ctx.artifact) : ctx.artifact;
  return (
    `OPERATOR SEED (the run's raw input — your input-fidelity anchor):\n${ctx.seed}\n\n` +
    `STAGE ${ctx.stage} ARTIFACT UNDER REVIEW:\n${JSON.stringify(artifactView)}` +
    wbAudit +
    prior
  );
}

// Workbook-correctness clause (brief §2b). Fires ONLY when a WORKBOOK section is
// present in the artifact view; for prose products / non-build stages there is no
// WORKBOOK section, so this clause is inert (nothing to apply). Kept tight — one
// pass-bar line appended to both review tasks, not a per-prompt essay.
const WORKBOOK_CLAUSE =
  ' If a WORKBOOK section is present and marked computational, it MUST contain real live ' +
  'formulas that compute the product\'s core value (roll-ups, totals, the equalization/' +
  'settlement/pricing math the product promises). A computational product whose workbook has ' +
  'zero or trivially few formulas, or formulas that do not reference inputs, FAILS — a static ' +
  'spreadsheet is not the deliverable.';

const REVIEW_TASK =
  'You are the SINGLE quality reviewer for this stage. Review the STAGE ARTIFACT UNDER ' +
  'REVIEW against YOUR pass-bar and the OPERATOR SEED. Return strictly as JSON: ' +
  'score (an HONEST 0–100 quality score — be discerning, not generous; reserve 90+ for ' +
  'genuinely excellent work and <70 for work that needs a fix), verdict (PASS|FAIL — ' +
  'FAIL when the artifact does not yet meet your pass-bar), critique (2–4 sentences: what is ' +
  'strong and what is weak — a real, specific assessment, never a rubber-stamp), and deltas ' +
  '(if FAIL: the specific actionable fixes a single rewrite must make; empty array if PASS). ' +
  'Judge the artifact on its own merits and on FIDELITY to the seed — do not soften.' +
  WORKBOOK_CLAUSE;

const ROUND1_TASK =
  'Evaluate the STAGE ARTIFACT UNDER REVIEW against YOUR pass-bar only. Return your ' +
  'verdict strictly as JSON: verdict (PASS|FAIL), reasons (short, each a concrete ' +
  'finding), deltas (if FAIL: the specific actionable fixes; empty array if PASS). ' +
  'Do not soften — if your pass-bar is not met, FAIL and say exactly what to fix.' +
  WORKBOOK_CLAUSE;

function round2Task(ownVerdict: Verdict, peers: Verdict[]): string {
  return (
    `You already returned this round-1 verdict:\n${JSON.stringify(ownVerdict)}\n\n` +
    `Your two peers returned:\n${JSON.stringify(peers)}\n\n` +
    'Now run your ADVERSARIAL brief. You MUST do ONE of:\n' +
    '  (a) cite a concrete challenge to a peer verdict (attack a weak PASS, or reinforce/upgrade a FAIL you agree with), OR\n' +
    "  (b) explicitly state \"I tried to break <peer>'s verdict and could not, because …\" with a real reason.\n" +
    'Pure agreement with no challenge attempted is NOT acceptable. Return strictly as JSON:\n' +
    '  challengeAttempted (true if you genuinely attacked or stress-tested a peer)\n' +
    '  note (your challenge text or your explicit could-not-break statement)\n' +
    '  revisedVerdict (only if YOU change your own verdict after seeing peers — omit otherwise)\n' +
    '  deltas (any surviving or newly-found deltas the fix must address; empty if none)\n' +
    '  severity: classify the issues you found as EXACTLY ONE of:\n' +
    '    "blocking" — a MATERIAL defect that makes the artifact wrong, unsellable, factually ' +
    'unsound, or fails this expert\'s hard pass-bar / red-flags. The kind of issue that MUST ' +
    'be fixed before the stage can pass.\n' +
    '    "minor" — a nitpick, a nice-to-have, a stylistic preference, a "could be slightly ' +
    'stronger" observation. Real feedback worth recording, but NOT a reason to block the stage.\n' +
    'Classify severity HONESTLY. Most adversarial challenges surface minor refinements — that ' +
    'is normal and expected. Reserve "blocking" for genuine material defects. Do NOT inflate ' +
    'severity to force a re-loop, and do NOT downgrade a real material defect to "minor" to ' +
    'avoid conflict. If you found nothing at all, set severity="minor" and deltas=[].'
  );
}

// ─── PersonaRunner ───────────────────────────────────────────────────────────

export class PersonaRunner implements ExpertRunner {
  /**
   * LEAN single-reviewer path (FACTORY_EXPERT_COUNT=1). One Claude call returns a
   * real 0–100 score + honest critique + PASS/FAIL + deltas. The gate decides
   * pass/fail from BOTH the verdict and the score (FACTORY_REVIEW_PASS_SCORE).
   */
  async reviewSingle(systemPrompt: string, expertSlug: string, ctx: GateContext): Promise<Review> {
    const user = `${REVIEW_TASK}\n\n${artifactBlock(ctx)}`;
    const out = await callClaudeJSON<{
      score: number;
      verdict: VerdictValue;
      critique: string;
      deltas: string[];
    }>({ system: systemPrompt, user, schema: REVIEW_SCHEMA });

    // Coerce a malformed score into range so a bad number can never crash the
    // gate's threshold compare; the verdict is still the model's own call.
    const rawScore = Number(out.score);
    const score = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, rawScore)) : 0;

    return {
      expert: expertSlug,
      score,
      verdict: out.verdict,
      critique: out.critique ?? '',
      // A FAIL with no deltas is useless to the rewrite — keep [] but the gate
      // still treats FAIL as a fail and runs the one rewrite from the critique.
      deltas: out.verdict === 'FAIL' ? out.deltas ?? [] : [],
    };
  }

  async round1(systemPrompt: string, expertSlug: string, ctx: GateContext): Promise<Verdict> {
    const user = `${ROUND1_TASK}\n\n${artifactBlock(ctx)}`;
    const out = await callClaudeJSON<{
      verdict: VerdictValue;
      reasons: string[];
      deltas: string[];
    }>({ system: systemPrompt, user, schema: VERDICT_SCHEMA });

    return {
      expert: expertSlug,
      verdict: out.verdict,
      reasons: out.reasons ?? [],
      // A FAIL with no deltas is useless to the fix loop — guard it.
      deltas: out.verdict === 'FAIL' ? out.deltas ?? [] : [],
    };
  }

  async round2(
    systemPrompt: string,
    expertSlug: string,
    ctx: GateContext,
    ownVerdict: Verdict,
    peerVerdicts: Verdict[],
  ): Promise<Challenge> {
    const baseUser = `${round2Task(ownVerdict, peerVerdicts)}\n\n${artifactBlock(ctx)}`;

    let out = await this.callChallenge(systemPrompt, baseUser);

    // Rubber-stamp guard: if the expert neither attempted a challenge nor
    // changed its verdict, re-prompt ONCE demanding a real adversarial attempt.
    if (!out.challengeAttempted && !out.revisedVerdict) {
      const reprompt =
        baseUser +
        '\n\nYour previous reply attempted no challenge. That is a rubber-stamp and is ' +
        'rejected. Re-do your adversarial brief: pick a specific peer claim and genuinely ' +
        'try to break it, OR state precisely why you could not break a specific peer claim. ' +
        'Set challengeAttempted=true only if you really stress-tested a peer.';
      out = await this.callChallenge(systemPrompt, reprompt);
    }

    return {
      expert: expertSlug,
      challengeAttempted: out.challengeAttempted,
      note: out.note,
      ...(out.revisedVerdict ? { revisedVerdict: out.revisedVerdict } : {}),
      deltas: out.deltas ?? [],
      // Fail-open: missing severity → 'minor' so it never spuriously blocks.
      severity: out.severity ?? 'minor',
    };
  }

  private async callChallenge(
    system: string,
    user: string,
  ): Promise<{
    challengeAttempted: boolean;
    note: string;
    revisedVerdict?: VerdictValue;
    deltas: string[];
    severity?: 'blocking' | 'minor';
  }> {
    return callClaudeJSON({ system, user, schema: CHALLENGE_SCHEMA });
  }
}
