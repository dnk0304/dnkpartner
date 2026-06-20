/**
 * Competitor Scan — a 2-expert adversarial sparring engine (Stage 4 sub-step).
 *
 * Dennis's intent (verbatim): "add a competitor scan function. Once we have
 * encountered a niche/product, the competitor scan shall check the biggest
 * competition for that specific product and tell us what we can do to have an
 * edge in front of our competitors. That should be 2 experts that can spar with
 * each other that take care of that."
 *
 * The mechanism is a DEDICATED 2-PERSONA DEBATE — NOT the 3-expert KISS gate, NOT
 * PersonaRunner's round1/round2 (that is the gate, a different dynamic). Two named
 * personas spar adversarially:
 *   • EDGE-STRATEGIST — builds the concrete competitive-edge thesis (where WE win:
 *     price, positioning, features, completeness, the GAPS competitors leave open).
 *   • RED-TEAM        — attacks the thesis: where competitors are actually STRONGER,
 *     where the differentiation is weak/copyable, where a "gap" isn't real/valued.
 *
 * Flow (runCompetitorScan), all serialized (subscription rate caps):
 *   1. identify competitors (gatherCompetitors)   — 1 call
 *   2. EDGE thesis round 1 (EDGE-STRATEGIST)       — 1 call
 *   3. RED-TEAM challenge round 1 (RED-TEAM)       — 1 call
 *   4. EDGE sharpen round 2 (EDGE-STRATEGIST)      — 1 call   ← convergence
 *   (+ optional RED-TEAM grade pass when rounds=3)  — 1 call
 * Default rounds=2 ⇒ 4 calls. rounds=3 ⇒ 5 calls. Cheap and bounded.
 *
 * Reuses the `callClaudeJSON` seam from ./llm (subscription CLI, $0) — same as
 * every other factory call. Token burn is metered automatically via the shared
 * seam (FACTORY_RUN_ID is already stamped by advanceOneStage when S4 runs).
 *
 * ─── REAL-DATA SEAM (SCAFFOLD ONLY — see gatherCompetitors below) ─────────────
 * v1 identifies competitors via LLM market knowledge (dataSource:'llm-analysis').
 * The canonical spec wants S4/S5/S6 grounded in REAL competitor+sales data from
 * dnk-trends (Etsy/eBay/TikTok/Google). That connector is NOT built yet — a
 * separate next-phase brief (DISPATCH-BRIEF-FORGE-dnktrends-connector). We leave a
 * CLEAN one-function seam (fetchCompetitorsFromTrends) wired behind the env switch
 * FACTORY_COMPETITOR_DATA_SOURCE. When set to 'dnk-trends' it is a FALLBACK-WITH-
 * WARNING today (a misconfigured env must NEVER kill a live run) — the wire is a
 * future one-function drop-in. FOLLOW-UP: implement fetchCompetitorsFromTrends
 * against the dnk-trends connector and flip dataSource to 'dnk-trends'.
 */

import { callClaudeJSON } from './llm';

// ─── Knobs (env, clamped at read — a typo can never break a run) ─────────────

/**
 * How many of the BIGGEST competitors to identify. Default 5, clamp [2,8].
 * Env FACTORY_COMPETITOR_MAX_COMPETITORS. Unset / non-numeric / out-of-range →
 * default.
 */
function maxCompetitors(): number {
  const raw = process.env.FACTORY_COMPETITOR_MAX_COMPETITORS;
  if (raw === undefined) return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(8, Math.max(2, Math.floor(n)));
}

/**
 * How many spar rounds. Default 2, clamp [1,3]. Env FACTORY_COMPETITOR_SCAN_ROUNDS.
 *   rounds=1 → identify + EDGE thesis only (no red-team) — a cheap sniff.
 *   rounds=2 → identify + EDGE r1 + RED-TEAM r1 + EDGE sharpen r2 (the default spar).
 *   rounds=3 → + a final RED-TEAM grade pass that sets the post-spar confidence.
 */
function scanRounds(): number {
  const raw = process.env.FACTORY_COMPETITOR_SCAN_ROUNDS;
  if (raw === undefined) return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

/** Where competitor identification data comes from. v1 default: 'llm-analysis'. */
function dataSourceMode(): CompetitorScan['dataSource'] {
  const raw = process.env.FACTORY_COMPETITOR_DATA_SOURCE?.trim();
  return raw === 'dnk-trends' ? 'dnk-trends' : 'llm-analysis';
}

// ─── Artifact shape (the structured output embedded in the S4 audit_report) ──

export interface Competitor {
  name: string;
  whatTheyOffer: string;
  /** e.g. "$12–$29" — a human string, not parsed (v1). */
  priceRange: string;
  strengths: string[];
  /** The gaps we can exploit. */
  weaknesses: string[];
}

/** One round of the spar — the raw transcript for the audit trail. */
export interface CompetitorScanRound {
  round: number;
  edge: { thesis: string; moves: string[]; note: string };
  redTeam: { challenges: string[]; competitorsStronger: string[]; note: string };
}

export interface CompetitorScan {
  /** The biggest real competitors for THIS product. */
  competitors: Competitor[];
  /** EDGE-STRATEGIST's sharpened final thesis (post-spar). */
  edgeThesis: string;
  /** Concrete moves: price / positioning / feature actions to take. */
  edgeMoves: string[];
  /** Gaps competitors leave open that we fill. */
  openGaps: string[];
  /** Surviving RED-TEAM challenges the thesis had to answer. */
  redTeamChallenges: string[];
  /** Honest: where competitors genuinely beat us (RED-TEAM's wins). */
  whereCompetitorsAreStronger: string[];
  /** 0–100 — how defensible the edge is after sparring. */
  confidence: number;
  /** v1 = 'llm-analysis'; the real-data seam flips this to 'dnk-trends' later. */
  dataSource: 'llm-analysis' | 'dnk-trends';
  /** The raw spar transcript per round (audit trail). */
  rounds: CompetitorScanRound[];
}

// ─── JSON schemas (mirror producers.ts: additionalProperties:false + required) ─

const COMPETITORS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          whatTheyOffer: { type: 'string' },
          priceRange: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'whatTheyOffer', 'priceRange', 'strengths', 'weaknesses'],
      },
    },
  },
  required: ['competitors'],
};

const EDGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thesis: { type: 'string' },
    moves: { type: 'array', items: { type: 'string' } },
    openGaps: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['thesis', 'moves', 'openGaps', 'note'],
};

const REDTEAM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    challenges: { type: 'array', items: { type: 'string' } },
    competitorsStronger: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
    note: { type: 'string' },
  },
  required: ['challenges', 'competitorsStronger', 'confidence', 'note'],
};

// ─── Persona system prompts ───────────────────────────────────────────────────

const COMPETITOR_FINDER_SYSTEM =
  'You are a market-intelligence analyst for a digital-product factory. Given a ' +
  'specific product and its context, name the BIGGEST REAL competitors a buyer ' +
  'would actually consider instead of ours — the incumbents that own this market. ' +
  'For each: what they offer, their price range (a human string like "$12–$29"), ' +
  'their genuine strengths, and their weaknesses (the gaps we could exploit). Be ' +
  'concrete and honest — name real categories of competitor/products, not strawmen, ' +
  'and do not invent fake brands. If you are unsure of an exact name, describe the ' +
  'concrete competitor type precisely. These are the biggest threats, ranked by how ' +
  'much they would actually steal our buyer.';

const EDGE_STRATEGIST_SYSTEM =
  'You are the EDGE-STRATEGIST. You find how WE BEAT the biggest competitors. Given ' +
  'the product plus its real competitors, build a concrete, DEFENSIBLE competitive-' +
  'edge thesis: where we win on price, positioning, features, completeness, and the ' +
  'specific GAPS the competition leaves open. Be concrete and specific — name the ' +
  'wedge, not platitudes ("better quality" is not a wedge; "the only one that ships ' +
  'a live-formula equalization calculator at half their price" is). Return the ' +
  'thesis, the concrete moves to make (price/positioning/feature actions), the open ' +
  'gaps we fill, and a short note on your reasoning. When you are shown a RED-TEAM ' +
  'challenge, do not get defensive for its own sake — concede what is genuinely weak, ' +
  'and SHARPEN the thesis into something that survives the attack: drop weak/copyable ' +
  'claims, double down on the wedge that holds.';

const RED_TEAM_SYSTEM =
  'You are the RED-TEAM. You red-team the competitive-edge thesis. Poke holes: name ' +
  'where the competitors are actually STRONGER than us, where the proposed ' +
  'differentiation is weak, copyable, or already done by an incumbent, and where a ' +
  'claimed "gap" is not real or is not valued by buyers. Be adversarial and specific ' +
  '— your job is to BREAK the thesis, not to agree with it. A polite rubber-stamp is ' +
  'a failure. Return your concrete challenges, an honest list of where competitors ' +
  'are genuinely stronger, a confidence score (0–100: how defensible the edge ' +
  'remains AFTER your attack — low if you broke it, high only if it truly survived), ' +
  'and a short note.';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a possibly-malformed number into [0,100] (same guard reviewSingle uses). */
function clampConfidence(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

/** Keep only non-empty trimmed strings from a possibly-malformed array. */
function cleanStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

/** Compact one competitor for a prompt line. */
function competitorLine(c: Competitor): string {
  return (
    `- ${c.name} — offers: ${c.whatTheyOffer} | price: ${c.priceRange} | ` +
    `strengths: ${c.strengths.join('; ') || '(none given)'} | ` +
    `weaknesses: ${c.weaknesses.join('; ') || '(none given)'}`
  );
}

/**
 * Distill a compact product context from the seed + prior artifacts. The scan is
 * "for that specific product" (Dennis) — S2 blueprint (offer/market) and the S3
 * build (the deliverable) both exist by S4, so we anchor on them. Kept compact
 * (token discipline) — the model gets the offer, positioning, and product title.
 */
export function buildProductContext(
  seed: string,
  priorArtifacts: Record<number, unknown>,
): string {
  const lines: string[] = [`OPERATOR SEED: ${seed}`];

  const bp = priorArtifacts[2];
  if (bp && typeof bp === 'object') {
    const offer = (bp as { offer?: unknown }).offer;
    const market = (bp as { market?: unknown }).market;
    if (offer && typeof offer === 'object') {
      const o = offer as { format?: string; transformation?: string; price?: string };
      if (o.format) lines.push(`PRODUCT FORMAT: ${o.format}`);
      if (o.transformation) lines.push(`TRANSFORMATION: ${o.transformation}`);
      if (o.price) lines.push(`OUR PRICE: ${o.price}`);
    }
    if (market && typeof market === 'object') {
      const m = market as { targetBuyer?: string; positioningLine?: string; competitors?: unknown };
      if (m.targetBuyer) lines.push(`TARGET BUYER: ${m.targetBuyer}`);
      if (m.positioningLine) lines.push(`POSITIONING: ${m.positioningLine}`);
      const named = cleanStrings(m.competitors);
      if (named.length > 0) lines.push(`BLUEPRINT-NAMED COMPETITORS: ${named.join('; ')}`);
    }
  }

  const build = priorArtifacts[3];
  if (build && typeof build === 'object') {
    const b = build as { title?: string; sections?: unknown };
    if (b.title) lines.push(`BUILT PRODUCT: ${b.title}`);
    const secs = cleanStrings(b.sections);
    if (secs.length > 0) lines.push(`PRODUCT SECTIONS: ${secs.join('; ')}`);
  }

  return lines.join('\n');
}

// ─── Real-data seam (SCAFFOLD ONLY) ──────────────────────────────────────────

/**
 * FUTURE DROP-IN — ground competitor identification in REAL dnk-trends data
 * (Etsy/eBay/TikTok/Google) instead of LLM market knowledge. The connector is a
 * separate next-phase brief (DISPATCH-BRIEF-FORGE-dnktrends-connector) and is NOT
 * built yet. This stub exists so the SHAPE and the switch are in place; wiring it
 * is a one-function change. When it lands, return real competitors and the caller
 * stamps dataSource:'dnk-trends'.
 *
 * DELIBERATE CHOICE: it does NOT throw. A misconfigured FACTORY_COMPETITOR_DATA_
 * SOURCE=dnk-trends env on the LIVE factory must never kill a run — so callers log
 * a warning and fall back to llm-analysis (see gatherCompetitors). Throwing here
 * would harden the seam against silent misconfig but at the cost of run safety;
 * fallback-with-warning is the safer default for a live auto-deploy branch.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchCompetitorsFromTrends(_productContext: string): Promise<Competitor[]> {
  throw new Error(
    'dnk-trends competitor source not yet wired — see ' +
      'DISPATCH-BRIEF-FORGE-dnktrends-connector. Falling back to llm-analysis.',
  );
}

/**
 * Identify the biggest competitors for the product. THE REAL-DATA SEAM lives here:
 *   - FACTORY_COMPETITOR_DATA_SOURCE unset / 'llm-analysis' (v1 default) → LLM
 *     market analysis, dataSource:'llm-analysis'.
 *   - 'dnk-trends' → ATTEMPT fetchCompetitorsFromTrends; on its (current) throw,
 *     log a warning and FALL BACK to llm-analysis so a misconfigured env never
 *     kills a live run. (Once the connector ships, this returns dataSource:'dnk-trends'.)
 */
export async function gatherCompetitors(
  productContext: string,
): Promise<{ competitors: Competitor[]; dataSource: CompetitorScan['dataSource'] }> {
  if (dataSourceMode() === 'dnk-trends') {
    try {
      const competitors = await fetchCompetitorsFromTrends(productContext);
      if (competitors.length > 0) {
        return { competitors, dataSource: 'dnk-trends' };
      }
      console.warn(
        '[competitorScan] dnk-trends returned no competitors — falling back to llm-analysis.',
      );
    } catch (err) {
      console.warn(
        `[competitorScan] dnk-trends source unavailable (${
          (err as Error).message
        }) — falling back to llm-analysis.`,
      );
    }
  }

  const competitors = await identifyCompetitorsViaLLM(productContext);
  return { competitors, dataSource: 'llm-analysis' };
}

/** v1 competitor identification: one structured LLM market-analysis call. */
async function identifyCompetitorsViaLLM(productContext: string): Promise<Competitor[]> {
  const n = maxCompetitors();
  const out = await callClaudeJSON<{ competitors: unknown[] }>({
    system: COMPETITOR_FINDER_SYSTEM,
    user:
      `Identify the ${n} BIGGEST real competitors for THIS specific product. ` +
      `For each give name, whatTheyOffer, priceRange, strengths[], weaknesses[].\n\n` +
      `PRODUCT CONTEXT:\n${productContext}\n\n` +
      `Return at most ${n} competitors, ranked biggest-threat first.`,
    schema: COMPETITORS_SCHEMA,
    maxTokens: 6000,
  });

  const raw = Array.isArray(out.competitors) ? out.competitors : [];
  const competitors: Competitor[] = raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      name: typeof c.name === 'string' ? c.name : '',
      whatTheyOffer: typeof c.whatTheyOffer === 'string' ? c.whatTheyOffer : '',
      priceRange: typeof c.priceRange === 'string' ? c.priceRange : '',
      strengths: cleanStrings(c.strengths),
      weaknesses: cleanStrings(c.weaknesses),
    }))
    .filter((c) => c.name.trim().length > 0)
    .slice(0, n);

  if (competitors.length === 0) {
    throw new Error('Competitor identification returned no usable competitors.');
  }
  return competitors;
}

// ─── The spar ────────────────────────────────────────────────────────────────

interface EdgeOut {
  thesis: string;
  moves: string[];
  openGaps: string[];
  note: string;
}
interface RedTeamOut {
  challenges: string[];
  competitorsStronger: string[];
  confidence: number;
  note: string;
}

/** EDGE-STRATEGIST builds (or sharpens) the edge thesis. */
async function runEdge(
  productContext: string,
  competitorBlock: string,
  priorChallenge: RedTeamOut | null,
  round: number,
): Promise<EdgeOut> {
  const challengeBlock = priorChallenge
    ? `\n\nThe RED-TEAM challenged your previous thesis. ANSWER it — concede what is ` +
      `genuinely weak, drop copyable claims, and SHARPEN your thesis into one that ` +
      `survives:\nCHALLENGES:\n- ${priorChallenge.challenges.join('\n- ') || '(none)'}\n` +
      `WHERE THEY ARE STRONGER:\n- ${
        priorChallenge.competitorsStronger.join('\n- ') || '(none)'
      }`
    : '';

  const out = await callClaudeJSON<EdgeOut>({
    system: EDGE_STRATEGIST_SYSTEM,
    user:
      `Build our competitive-edge thesis for THIS product (spar round ${round}).\n\n` +
      `PRODUCT CONTEXT:\n${productContext}\n\nBIGGEST COMPETITORS:\n${competitorBlock}` +
      challengeBlock +
      `\n\nReturn thesis, concrete moves[], the openGaps[] we fill, and a short note.`,
    schema: EDGE_SCHEMA,
    maxTokens: 6000,
  });

  return {
    thesis: typeof out.thesis === 'string' ? out.thesis : '',
    moves: cleanStrings(out.moves),
    openGaps: cleanStrings(out.openGaps),
    note: typeof out.note === 'string' ? out.note : '',
  };
}

/** RED-TEAM attacks (or grades) the current edge thesis. */
async function runRedTeam(
  productContext: string,
  competitorBlock: string,
  edge: EdgeOut,
  round: number,
  grading: boolean,
): Promise<RedTeamOut> {
  const task = grading
    ? `GRADE the sharpened thesis below. After the spar, how defensible is this edge? ` +
      `Set confidence honestly and list any challenges that still stand.`
    : `ATTACK the thesis below. Break it: where are competitors stronger, where is the ` +
      `differentiation weak/copyable, which "gaps" are not real or not valued?`;

  const out = await callClaudeJSON<RedTeamOut>({
    system: RED_TEAM_SYSTEM,
    user:
      `Red-team our competitive-edge thesis (spar round ${round}). ${task}\n\n` +
      `PRODUCT CONTEXT:\n${productContext}\n\nBIGGEST COMPETITORS:\n${competitorBlock}\n\n` +
      `EDGE THESIS:\n${edge.thesis}\n\nPROPOSED MOVES:\n- ${
        edge.moves.join('\n- ') || '(none)'
      }\n\nCLAIMED OPEN GAPS:\n- ${edge.openGaps.join('\n- ') || '(none)'}\n\n` +
      `Return challenges[], competitorsStronger[], a 0–100 confidence, and a note.`,
    schema: REDTEAM_SCHEMA,
    maxTokens: 6000,
  });

  return {
    challenges: cleanStrings(out.challenges),
    competitorsStronger: cleanStrings(out.competitorsStronger),
    confidence: clampConfidence(out.confidence),
    note: typeof out.note === 'string' ? out.note : '',
  };
}

/**
 * Run the full competitor scan: identify the biggest competitors, then run the
 * EDGE-STRATEGIST vs RED-TEAM spar for `rounds` rounds, and assemble the
 * sharpened, post-spar CompetitorScan artifact. All calls serialized.
 *
 * Call budget: identify(1) + edge-r1(1) [+ redteam-r1(1) + edge-r2(1) at rounds≥2]
 * [+ redteam-grade(1) at rounds=3]. Default rounds=2 ⇒ 4 calls.
 */
export async function runCompetitorScan(
  seed: string,
  priorArtifacts: Record<number, unknown>,
): Promise<CompetitorScan> {
  const rounds = scanRounds();
  const productContext = buildProductContext(seed, priorArtifacts);

  // 1. Identify competitors (the real-data seam).
  const { competitors, dataSource } = await gatherCompetitors(productContext);
  const competitorBlock = competitors.map(competitorLine).join('\n');

  const transcript: CompetitorScanRound[] = [];

  // 2. EDGE thesis — round 1.
  let edge = await runEdge(productContext, competitorBlock, null, 1);
  let lastRedTeam: RedTeamOut | null = null;

  if (rounds === 1) {
    // Cheap sniff: thesis only, no adversary. Confidence is unproven → moderate.
    transcript.push({
      round: 1,
      edge: { thesis: edge.thesis, moves: edge.moves, note: edge.note },
      redTeam: { challenges: [], competitorsStronger: [], note: 'rounds=1: red-team skipped' },
    });
    return assemble(competitors, edge, [], [], transcript, 50, dataSource);
  }

  // 3. RED-TEAM challenge — round 1.
  lastRedTeam = await runRedTeam(productContext, competitorBlock, edge, 1, false);
  transcript.push({
    round: 1,
    edge: { thesis: edge.thesis, moves: edge.moves, note: edge.note },
    redTeam: {
      challenges: lastRedTeam.challenges,
      competitorsStronger: lastRedTeam.competitorsStronger,
      note: lastRedTeam.note,
    },
  });

  // 4. EDGE sharpen — round 2 (convergence): answer the challenge, sharpen.
  edge = await runEdge(productContext, competitorBlock, lastRedTeam, 2);

  let round2RedTeam: { challenges: string[]; competitorsStronger: string[]; note: string } = {
    challenges: [],
    competitorsStronger: [],
    note: 'rounds=2: sharpened thesis stands; confidence carried from round-1 red-team',
  };
  // Default rounds=2 confidence: the round-1 red-team's post-attack score.
  let confidence = lastRedTeam.confidence;

  // 5. (rounds=3) Final RED-TEAM grade pass on the sharpened thesis.
  if (rounds >= 3) {
    const graded = await runRedTeam(productContext, competitorBlock, edge, 2, true);
    confidence = graded.confidence;
    round2RedTeam = {
      challenges: graded.challenges,
      competitorsStronger: graded.competitorsStronger,
      note: graded.note,
    };
  }

  transcript.push({
    round: 2,
    edge: { thesis: edge.thesis, moves: edge.moves, note: edge.note },
    redTeam: round2RedTeam,
  });

  // Surviving challenges + honest "where they're stronger" = the final red-team's
  // (graded pass if rounds=3, else the round-1 attack the thesis had to answer).
  const survivingChallenges = rounds >= 3 ? round2RedTeam.challenges : lastRedTeam.challenges;
  const strongerThanUs = rounds >= 3 ? round2RedTeam.competitorsStronger : lastRedTeam.competitorsStronger;

  return assemble(
    competitors,
    edge,
    survivingChallenges,
    strongerThanUs,
    transcript,
    confidence,
    dataSource,
  );
}

/** Assemble the final CompetitorScan artifact from the spar outputs. */
function assemble(
  competitors: Competitor[],
  edge: EdgeOut,
  redTeamChallenges: string[],
  whereCompetitorsAreStronger: string[],
  rounds: CompetitorScanRound[],
  confidence: number,
  dataSource: CompetitorScan['dataSource'],
): CompetitorScan {
  return {
    competitors,
    edgeThesis: edge.thesis,
    edgeMoves: edge.moves,
    openGaps: edge.openGaps,
    redTeamChallenges,
    whereCompetitorsAreStronger,
    confidence: clampConfidence(confidence),
    dataSource,
    rounds,
  };
}
