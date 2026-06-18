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

const CHALLENGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    challengeAttempted: { type: 'boolean' },
    note: { type: 'string' },
    revisedVerdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    deltas: { type: 'array', items: { type: 'string' } },
  },
  // revisedVerdict optional — only when the expert changes its own call.
  required: ['challengeAttempted', 'note', 'deltas'],
};

// ─── Prompt assembly helpers ─────────────────────────────────────────────────

function artifactBlock(ctx: GateContext): string {
  const prior =
    Object.keys(ctx.priorArtifacts).length > 0
      ? `\n\nPRIOR-STAGE ARTIFACTS (context, do not re-litigate earlier stages):\n${JSON.stringify(
          ctx.priorArtifacts,
          null,
          2,
        )}`
      : '';
  return (
    `OPERATOR SEED (the run's raw input — your input-fidelity anchor):\n${ctx.seed}\n\n` +
    `STAGE ${ctx.stage} ARTIFACT UNDER REVIEW:\n${JSON.stringify(ctx.artifact, null, 2)}` +
    prior
  );
}

const ROUND1_TASK =
  'Evaluate the STAGE ARTIFACT UNDER REVIEW against YOUR pass-bar only. Return your ' +
  'verdict strictly as JSON: verdict (PASS|FAIL), reasons (short, each a concrete ' +
  'finding), deltas (if FAIL: the specific actionable fixes; empty array if PASS). ' +
  'Do not soften — if your pass-bar is not met, FAIL and say exactly what to fix.';

function round2Task(ownVerdict: Verdict, peers: Verdict[]): string {
  return (
    `You already returned this round-1 verdict:\n${JSON.stringify(ownVerdict, null, 2)}\n\n` +
    `Your two peers returned:\n${JSON.stringify(peers, null, 2)}\n\n` +
    'Now run your ADVERSARIAL brief. You MUST do ONE of:\n' +
    '  (a) cite a concrete challenge to a peer verdict (attack a weak PASS, or reinforce/upgrade a FAIL you agree with), OR\n' +
    "  (b) explicitly state \"I tried to break <peer>'s verdict and could not, because …\" with a real reason.\n" +
    'Pure agreement with no challenge attempted is NOT acceptable. Return strictly as JSON: ' +
    'challengeAttempted (true if you genuinely attacked or stress-tested a peer), note (your ' +
    'challenge text or your explicit could-not-break statement), revisedVerdict (only if YOU ' +
    'change your own verdict after seeing peers — omit otherwise), deltas (any surviving or ' +
    'newly-found deltas the fix must address; empty if none).'
  );
}

// ─── PersonaRunner ───────────────────────────────────────────────────────────

export class PersonaRunner implements ExpertRunner {
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
  }> {
    return callClaudeJSON({ system, user, schema: CHALLENGE_SCHEMA });
  }
}
