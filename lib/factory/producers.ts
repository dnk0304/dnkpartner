/**
 * Stage producers — generate each stage's artifact from (seed + prior artifacts).
 * Most producers are thin PRODUCER prompts authored here making ONE structured
 * LLM call; the EXPERT prompts (vendored) are for GATING, not producing
 * (ORCHESTRATION §2).
 *
 * Each producer returns a JSON artifact whose shape matches the reference
 * artifact for that stage (BLUEPRINT §1).
 *
 * ─── STAGE 3 (BUILD) is the exception — it generates the FULL product ──────────
 * Monetise/Synthesise delivery model (ref: niki/PROJECTS/monetise-analysis
 * 2C-product.md §1, VERDICT.md): "it generates a course/product structure
 * (6 phases, 37 modules in one example), module-by-module, as TEXT" → a complete
 * done-for-you text artifact. We copy that pattern: stage 3 is HEAVIER than every
 * other stage (intended) — it (1) derives an ordered section list from the
 * Stage-2 Blueprint, then (2) FILLS each section with real content via one call
 * per section (serialized — subscription rate caps), then (3) ASSEMBLES every
 * section into ONE complete markdown product. The output is the actual deliverable
 * (e.g. the full Divorce Organizer with all its sections), NOT a 1-page proof.
 *
 * The section count is bounded by FACTORY_BUILD_MAX_SECTIONS (default 9) so a run
 * can't explode into dozens of calls. Each call reuses callClaudeJSON, which
 * already carries the flake/rate retry loop (llm.ts). The gate (gate.ts) and the
 * lean experts are UNCHANGED — this only reworks the BUILD producer.
 */

import { callClaudeJSON } from './llm';
import { getStage } from './types';
import { runCompetitorScan, type CompetitorScan } from './competitorScan';
import { buildXlsx, colLetter, type SheetCell, type SheetDef, type CellStyle } from './xlsx';

/**
 * Hard ceiling on how many sections/modules the full build generates — one LLM
 * call per section, so this directly bounds stage-3 cost. Default 9 (a complete
 * mid-size info-product: a handful of substantive modules + front/back matter).
 * Override with FACTORY_BUILD_MAX_SECTIONS. Clamped to [1, 20]: unset / non-numeric
 * / out-of-range → default, so a typo can never spawn an unbounded call fan-out.
 */
function buildMaxSections(): number {
  const raw = process.env.FACTORY_BUILD_MAX_SECTIONS;
  if (raw === undefined) return 9;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 9;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

export interface ProduceInput {
  stage: number;
  seed: string;
  priorArtifacts: Record<number, unknown>;
  /** If this is a fix re-produce, the deltas the new artifact must address. */
  fixDeltas?: string[];
}

// ─── Stage 1 MULTI-NICHE candidate generator (the pre-stage selection step) ────
//
// This runs BEFORE the existing per-niche Stage-1 producer. It emits N candidate
// niches — each a DISTINCT {niche, productIdea, painArea} (NOT angles on one
// niche) — from an OPTIONAL hint. The user picks one; only the chosen niche then
// goes through the existing heavy 3-expert gate + S2-S6. Generating + advisory-
// scoring the SET is cheap (2 LLM calls total); the heavy gate runs once, on the
// pick. This is the cost-discipline core: do NOT gate all N candidates.
//
// ANTI-CANNED-NICHE WEDGE (brief §1): the benchmark (Synthesise) IGNORED the
// typed hint and returned generic high-scorers. Our edge is to HONOR the hint and
// score honestly — that constraint is baked into the system prompt below.

/** One scored candidate niche. Indexes are assigned by the generator (0-based). */
export interface NicheCandidate {
  /** 0-based position in the returned set (assigned in code, stable for selection). */
  index: number;
  /** The distinct niche/audience. */
  niche: string;
  /** The concrete product idea for this niche. */
  productIdea: string;
  /** The specific pain this product relieves. */
  painArea: string;
  /** 1-10 each — reuse the existing scoring scale. */
  scores: {
    pain: number;
    worsening: number;
    purchasingPower: number;
    speedToValue: number;
    competitionGap: number;
  };
  /** Concrete, plausible demand signal behind the scores (no fabricated round numbers). */
  demandEvidence: string;
  /** Why this candidate is worth considering. */
  rationale: string;
  /**
   * Advisory cross-check flags from the KISS lenses (e.g. "stale 2023 citation",
   * "timing window likely closed"). NON-BLOCKING — they help the user choose; they
   * do NOT gate. Absent/empty when the advisory pass found nothing notable.
   */
  advisoryFlags?: string[];
}

/** The full candidate set persisted as the `niche_candidates` artifact. */
export interface NicheCandidateSet {
  /** The raw hint that steered generation ("" when "help me discover"). */
  hint: string;
  /** Whether the user gave a hint (false = discover mode). */
  hintProvided: boolean;
  candidates: NicheCandidate[];
}

/**
 * How many candidate niches to generate. Default 5, env FACTORY_S1_CANDIDATES,
 * clamped [3,8] (brief §2a). Unset / non-numeric / out-of-range → 5.
 */
function candidateCount(): number {
  const raw = process.env.FACTORY_S1_CANDIDATES;
  if (raw === undefined) return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(8, Math.max(3, Math.floor(n)));
}

const CANDIDATE_SCORES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pain: { type: 'number' },
    worsening: { type: 'number' },
    purchasingPower: { type: 'number' },
    speedToValue: { type: 'number' },
    competitionGap: { type: 'number' },
  },
  required: ['pain', 'worsening', 'purchasingPower', 'speedToValue', 'competitionGap'],
};

const CANDIDATES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          niche: { type: 'string' },
          productIdea: { type: 'string' },
          painArea: { type: 'string' },
          scores: CANDIDATE_SCORES_SCHEMA,
          demandEvidence: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['niche', 'productIdea', 'painArea', 'scores', 'demandEvidence', 'rationale'],
      },
    },
  },
  required: ['candidates'],
};

/** Raw candidate shape from the model (no index/advisoryFlags yet). */
type RawCandidate = Omit<NicheCandidate, 'index' | 'advisoryFlags'>;

/** Normalize a string for near-duplicate comparison (cheap, no LLM). */
function normNiche(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Reject near-duplicate candidates so the set is genuinely varied (brief §2a:
 * "5 phrasings of one idea" is the failure mode). Cheap string check only — keep
 * the FIRST occurrence of each normalized niche, drop later collisions.
 */
function dedupeCandidates(raw: RawCandidate[]): RawCandidate[] {
  const seen = new Set<string>();
  const out: RawCandidate[] = [];
  for (const c of raw) {
    if (!c || typeof c.niche !== 'string' || !c.niche.trim()) continue;
    const key = normNiche(c.niche);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Generate N DISTINCT candidate niches from an optional hint. ONE structured LLM
 * call (cost discipline — never N calls). Returns the deduped, indexed set WITHOUT
 * advisory flags; call `advisoryCrossCheck` next to attach them.
 */
export async function produceNicheCandidates(hint: string): Promise<NicheCandidateSet> {
  const n = candidateCount();
  const trimmedHint = (hint ?? '').trim();
  const hintProvided = trimmedHint.length > 0;

  const hintDirective = hintProvided
    ? `The operator gave this HINT — a genre/area they have experience with:\n"${trimmedHint}"\n\n` +
      'GENERATE ALL CANDIDATES WITHIN OR DIRECTLY ADJACENT TO THIS HINT. Each must be a ' +
      'DIFFERENT product, niche, and pain INSIDE the hint\'s space (e.g. hint "divorce & ' +
      'family admin" → a co-parenting schedule kit, a divorce document inventory, a ' +
      'separation-finances workbook, etc. — all family-admin, all different). DO NOT drift ' +
      'to unrelated generic high-scoring niches just because they score well — honoring the ' +
      "hint is the whole point. If a candidate isn't recognizably within the hint's area, it " +
      'is wrong.'
    : 'No hint was given ("help me discover"). Generate candidates across DIFFERENT spaces — ' +
      'distinct audiences, distinct problems — so the operator sees a genuine spread of ' +
      'opportunities, not five variations of one theme.';

  const system =
    'You are the Stage 1 MULTI-NICHE candidate generator for a digital-product factory. ' +
    `Produce exactly ${n} candidate niches. Each candidate is a DISTINCT, self-contained ` +
    'opportunity: a specific niche/audience, ONE concrete digital product idea for it, and ' +
    'the specific PAIN that product relieves. These are NOT angles on a single niche — each ' +
    'must differ in niche AND product AND pain. Score each 1-10 on pain, worsening (is the ' +
    'pain getting worse over time), purchasing-power (can this audience pay), speed-to-value ' +
    '(how fast a buyer feels the benefit), and competition-gap (how open the field is — ' +
    'higher = less saturated). Be HONEST and DISCERNING: cite concrete, plausible demand ' +
    'signals for each (no fabricated round numbers), and let scores VARY across candidates — ' +
    'do not give everything 9s and 10s. A varied, input-driven, honestly-scored set is the ' +
    'product; a row of canned generic high-scorers is the failure mode to avoid.';

  const user =
    `Generate ${n} DISTINCT candidate niches.\n\n${hintDirective}\n\n` +
    `Return exactly ${n} candidates (or as many genuinely-distinct ones as the space honestly ` +
    'supports if fewer are real), each with: niche, productIdea, painArea, the 5 scores, ' +
    'demandEvidence, and a one-line rationale.';

  const out = await callClaudeJSON<{ candidates: RawCandidate[] }>({
    system,
    user,
    schema: CANDIDATES_SCHEMA,
    maxTokens: 8000,
  });

  const raw = Array.isArray(out.candidates) ? out.candidates : [];
  const deduped = dedupeCandidates(raw);
  if (deduped.length === 0) {
    throw new Error('Candidate generator returned no usable niches.');
  }

  const candidates: NicheCandidate[] = deduped.map((c, i) => ({
    index: i,
    niche: c.niche,
    productIdea: c.productIdea,
    painArea: c.painArea,
    scores: c.scores,
    demandEvidence: c.demandEvidence,
    rationale: c.rationale,
  }));

  return { hint: trimmedHint, hintProvided, candidates };
}

const ADVISORY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    flagsByIndex: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'number' },
          flags: { type: 'array', items: { type: 'string' } },
        },
        required: ['index', 'flags'],
      },
    },
  },
  required: ['flagsByIndex'],
};

/**
 * Advisory cross-check (brief §2b, Option A): the KISS lenses (TIMING · NICHE-FIT ·
 * WILL-IT-SELL) review the WHOLE candidate set in ONE call and emit per-candidate
 * advisory flags — short notes that help the user choose (e.g. "timing window
 * likely closed", "demand evidence is thin/stale", "audience may not pay"). This
 * is NON-BLOCKING: it does NOT gate or drop any candidate. The heavy blocking
 * 3-expert adversarial gate still runs LATER, on the single CHOSEN niche only.
 *
 * Mutates a shallow copy of the set, attaching `advisoryFlags` per candidate.
 * Resilient: a flake here (after llm.ts retries) returns the set unflagged rather
 * than failing the whole generation — advisory data is nice-to-have, not required.
 */
export async function advisoryCrossCheck(set: NicheCandidateSet): Promise<NicheCandidateSet> {
  const system =
    'You are a KISS product panel (three lenses: TIMING — is now the right moment; ' +
    'NICHE-FIT — is it specific and reachable; WILL-IT-SELL — would real people pay AND can ' +
    'it ship fast). You are giving ADVISORY cross-check notes to help an operator CHOOSE among ' +
    'candidate niches — you are NOT gating or rejecting any. For each candidate, return 0-3 ' +
    'SHORT, honest flags worth knowing before picking (a weakness, a risk, a stale/thin demand ' +
    'signal, a timing concern). If a candidate looks clean on all three lenses, return an empty ' +
    'flags array for it. Be concrete and brief — one short phrase per flag, no essays.';

  const list = set.candidates
    .map(
      (c) =>
        `#${c.index} — niche: ${c.niche} | product: ${c.productIdea} | pain: ${c.painArea} | ` +
        `scores ${JSON.stringify(c.scores)} | evidence: ${c.demandEvidence}`,
    )
    .join('\n');

  const user =
    `Cross-check these ${set.candidates.length} candidate niches. Return advisory flags keyed ` +
    `by their index (0-based):\n\n${list}\n\n` +
    'For each index, give 0-3 short flags (empty array if nothing notable).';

  try {
    const out = await callClaudeJSON<{ flagsByIndex: { index: number; flags: string[] }[] }>({
      system,
      user,
      schema: ADVISORY_SCHEMA,
      maxTokens: 4000,
    });
    const byIndex = new Map<number, string[]>();
    for (const row of out.flagsByIndex ?? []) {
      if (typeof row?.index === 'number' && Array.isArray(row.flags)) {
        byIndex.set(row.index, row.flags.filter((f) => typeof f === 'string' && f.trim()));
      }
    }
    return {
      ...set,
      candidates: set.candidates.map((c) => {
        const flags = byIndex.get(c.index);
        return flags && flags.length > 0 ? { ...c, advisoryFlags: flags } : c;
      }),
    };
  } catch {
    // Advisory is non-essential — never let a flake fail the whole generation step.
    return set;
  }
}

function priorBlock(priorArtifacts: Record<number, unknown>): string {
  if (Object.keys(priorArtifacts).length === 0) return '';
  // Compact JSON (no indent) — FIX 3 token trim; behaviour-neutral for the model.
  return `\n\nAPPROVED PRIOR-STAGE ARTIFACTS (build on these, stay consistent):\n${JSON.stringify(
    priorArtifacts,
  )}`;
}

function fixBlock(fixDeltas?: string[]): string {
  if (!fixDeltas || fixDeltas.length === 0) return '';
  return (
    '\n\nThis is a TARGETED FIX. The previous artifact FAILED the gate on these ' +
    `deltas — address ONLY these, keep everything else stable:\n- ${fixDeltas.join('\n- ')}`
  );
}

/**
 * Per-stage producer: system brief + JSON schema. Kept compact; the experts
 * enforce depth at the gate. Schemas use additionalProperties:false and only
 * the fields the downstream stages + the gate need.
 */
const PRODUCERS: Record<
  number,
  { system: string; schema: Record<string, unknown>; maxTokens?: number }
> = {
  1: {
    system:
      'You are the Stage 1 Niche producer. From the operator SEED, produce a Validated Niche ' +
      'Brief: a refined niche statement DERIVED FROM THE SEED (never swapped for a generic ' +
      'higher-scoring niche), a scored table of 3-5 candidate angles on Pain, Worsening, ' +
      'Purchasing-Power, Speed-to-value, Competition-gap (1-10 each), the demand evidence behind ' +
      'each score, and ONE recommended angle with reasoning. Be honest: cite concrete, plausible ' +
      'demand signals; do not fabricate round numbers.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        refinedNiche: { type: 'string' },
        angles: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              scores: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  pain: { type: 'number' },
                  worsening: { type: 'number' },
                  purchasingPower: { type: 'number' },
                  speedToValue: { type: 'number' },
                  competitionGap: { type: 'number' },
                },
                required: ['pain', 'worsening', 'purchasingPower', 'speedToValue', 'competitionGap'],
              },
              demandEvidence: { type: 'string' },
            },
            required: ['name', 'scores', 'demandEvidence'],
          },
        },
        recommendedAngle: { type: 'string' },
        reasoning: { type: 'string' },
      },
      required: ['refinedNiche', 'angles', 'recommendedAngle', 'reasoning'],
    },
  },
  2: {
    system:
      'You are the Stage 2 Blueprint producer. From the approved niche brief, produce a build-ready ' +
      'Product Blueprint with three locked sections: Offer (format, transformation, price, honest ' +
      'value framing), Market (target buyer, candidate channel, positioning line, 3 NAMED live ' +
      'competitors to beat), Production (exact file list, asset/page counts, tools, done-definition ' +
      'for Stage 3). No open questions — Stage 3 must build from this with zero ambiguity.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        offer: {
          type: 'object',
          additionalProperties: false,
          properties: {
            format: { type: 'string' },
            transformation: { type: 'string' },
            price: { type: 'string' },
            valueFraming: { type: 'string' },
          },
          required: ['format', 'transformation', 'price', 'valueFraming'],
        },
        market: {
          type: 'object',
          additionalProperties: false,
          properties: {
            targetBuyer: { type: 'string' },
            candidateChannel: { type: 'string' },
            positioningLine: { type: 'string' },
            competitors: { type: 'array', items: { type: 'string' } },
          },
          required: ['targetBuyer', 'candidateChannel', 'positioningLine', 'competitors'],
        },
        production: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fileList: { type: 'array', items: { type: 'string' } },
            counts: { type: 'string' },
            tools: { type: 'array', items: { type: 'string' } },
            doneDefinition: { type: 'string' },
          },
          required: ['fileList', 'counts', 'tools', 'doneDefinition'],
        },
      },
      required: ['offer', 'market', 'production'],
    },
  },
  // Stage 3 (build) is NOT a single-call producer — it generates the FULL product
  // module-by-module via produceBuildArtifact (below). Intentionally absent from
  // this map; produceStageArtifact routes stage 3 to the dedicated multi-call path.
  4: {
    system:
      'You are the Stage 4 Audit producer. A 2-expert COMPETITOR SCAN (EDGE-STRATEGIST vs ' +
      'RED-TEAM spar) has already run and is supplied to you below: the biggest real competitors, ' +
      'our sharpened competitive-edge thesis, the gaps we fill, the surviving red-team challenges, ' +
      'and where competitors are genuinely stronger. Benchmark the built artifact against those ' +
      'competitors on completeness, perceived value, presentation, and price-to-value, and let the ' +
      'scan findings drive your verdict — if the red-team showed competitors decisively beat us on ' +
      'something buyers value, that must lower the verdict; if our edge thesis holds, it supports a ' +
      'ship. Return a verdict (ship | improve-then-ship | kill) and, if improve, the exact deltas ' +
      '(reference the edge moves / open gaps where relevant).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        benchmarks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              competitor: { type: 'string' },
              completeness: { type: 'string' },
              perceivedValue: { type: 'string' },
              priceToValue: { type: 'string' },
            },
            required: ['competitor', 'completeness', 'perceivedValue', 'priceToValue'],
          },
        },
        verdict: { type: 'string', enum: ['ship', 'improve-then-ship', 'kill'] },
        deltas: { type: 'array', items: { type: 'string' } },
      },
      required: ['benchmarks', 'verdict', 'deltas'],
    },
  },
  5: {
    system:
      'You are the Stage 5 Branding producer. Produce a Brand Package: a primary product/brand name ' +
      '+ alternatives, store-name options with a primary pick, a positioning tagline, and a visual ' +
      'identity direction (palette, type feel, logo direction) — each with rationale tied to the ' +
      'Stage-1 buyer and Stage-4 differentiation. Names must feel ownable (no obvious trademark clash).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        brandName: { type: 'string' },
        brandNameAlternatives: { type: 'array', items: { type: 'string' } },
        storeName: { type: 'string' },
        storeNameAlternatives: { type: 'array', items: { type: 'string' } },
        tagline: { type: 'string' },
        visualIdentity: {
          type: 'object',
          additionalProperties: false,
          properties: {
            palette: { type: 'string' },
            typeFeel: { type: 'string' },
            logoDirection: { type: 'string' },
          },
          required: ['palette', 'typeFeel', 'logoDirection'],
        },
        rationale: { type: 'string' },
      },
      required: ['brandName', 'storeName', 'tagline', 'visualIdentity', 'rationale'],
    },
  },
  6: {
    system:
      'You are the Stage 6 Channel producer. Recommend the single best marketplace for this product ' +
      '(Etsy first per the locked decision unless clearly wrong), with a scored comparison of realistic ' +
      'alternatives on fit, unit economics (at the Stage-4 price), and reachable in-platform audience, ' +
      'plus the reasoning. Show the unit economics numerically.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recommendedChannel: { type: 'string' },
        comparison: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              channel: { type: 'string' },
              fit: { type: 'string' },
              unitEconomics: { type: 'string' },
              audience: { type: 'string' },
            },
            required: ['channel', 'fit', 'unitEconomics', 'audience'],
          },
        },
        reasoning: { type: 'string' },
      },
      required: ['recommendedChannel', 'comparison', 'reasoning'],
    },
  },
  7: {
    system:
      'You are the Stage 7 Storefront producer. Produce a configured listing DRAFT for the chosen ' +
      'channel (Etsy): title, transformation-led description, tags, price, the build file attached, ' +
      'and the policies/category. Arrange it to convert, comply with channel rules, and merchandise ' +
      'well. It is a DRAFT — never published.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        price: { type: 'string' },
        category: { type: 'string' },
        policies: { type: 'string' },
        attachedFile: { type: 'string' },
      },
      required: ['title', 'description', 'tags', 'price', 'category', 'policies', 'attachedFile'],
    },
  },
  8: {
    system:
      'You are the Stage 8 Launch producer. Finalize the Etsy listing fields for one-click review and ' +
      'a launch package: SEO-tuned title (<=140 chars), <=13 tags (each <=20 chars), buyer-query-matched ' +
      'description, price, the attached build file, plus a launch plan (first-traffic, first-review ' +
      'strategy) and the connector notes (Etsy-native payments/delivery/analytics — platform handles ' +
      'these once published). Output is a draft-ready listing; it is NOT published.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        listingTitle: { type: 'string' },
        listingTags: { type: 'array', items: { type: 'string' } },
        listingDescription: { type: 'string' },
        price: { type: 'string' },
        attachedFile: { type: 'string' },
        launchPlan: { type: 'string' },
        connectorNotes: { type: 'string' },
      },
      required: [
        'listingTitle',
        'listingTags',
        'listingDescription',
        'price',
        'attachedFile',
        'launchPlan',
        'connectorNotes',
      ],
    },
  },
};

/** Produce (or re-produce as a fix) the artifact for one stage. */
export async function produceStageArtifact(input: ProduceInput): Promise<unknown> {
  // Stage 3 (build) generates the FULL product module-by-module — its own path.
  if (input.stage === 3) {
    return produceBuildArtifact(input);
  }

  // Stage 4 (audit) runs the 2-expert COMPETITOR SCAN spar first, then the audit
  // call consumes it; the scan rides inside the persisted audit_report payload.
  if (input.stage === 4) {
    return produceAuditArtifact(input);
  }

  const cfg = PRODUCERS[input.stage];
  if (!cfg) throw new Error(`No producer for stage ${input.stage}`);
  const stage = getStage(input.stage);

  const user =
    `Produce the artifact for Stage ${input.stage} (${stage.name}).\n\n` +
    `OPERATOR SEED:\n${input.seed}` +
    priorBlock(input.priorArtifacts) +
    fixBlock(input.fixDeltas);

  return callClaudeJSON({
    system: cfg.system,
    user,
    schema: cfg.schema,
    maxTokens: cfg.maxTokens ?? 8000,
  });
}

// ─── Stage 4: Audit + embedded 2-expert COMPETITOR SCAN ──────────────────────
//
// Ken's design (locked): the Competitor Scan is a PRE-STEP inside the Stage-4
// producer, not a new stage. Before the audit benchmark is produced, the
// EDGE-STRATEGIST vs RED-TEAM spar runs (lib/factory/competitorScan.ts) and
// produces a CompetitorScan artifact. The audit call then consumes it (its system
// prompt is scan-aware) and the scan is embedded INTO the persisted audit_report
// payload under `competitorScan` — exactly like the workbook rides inside the S3
// build payload. One artifact (audit_report), one DB row, richer payload. NO
// Prisma migration (FactoryArtifact.payload is Json).
//
// RESILIENCE: a scan flake (after llm.ts retries) must not kill the audit. If the
// spar throws, we log and proceed with a null competitorScan rather than failing
// the whole Stage-4 produce — the audit benchmark is the guaranteed deliverable.

/** What the model returns for the S4 audit (the scan is merged in code, not by the model). */
interface AuditModelOut {
  benchmarks: { competitor: string; completeness: string; perceivedValue: string; priceToValue: string }[];
  verdict: string;
  deltas: string[];
}

/** The persisted Stage-4 audit_report payload: the audit + the embedded scan. */
interface AuditArtifact extends AuditModelOut {
  /** The 2-expert spar result. null only if the scan threw (audit still ships). */
  competitorScan: CompetitorScan | null;
}

async function produceAuditArtifact(input: ProduceInput): Promise<AuditArtifact> {
  const cfg = PRODUCERS[4];
  const stage = getStage(4);

  // 1. COMPETITOR SCAN — the 2-expert spar (resilient: a flake yields null, not a
  //    failed audit). identify → edge r1 → red-team r1 → edge sharpen r2 (default).
  let competitorScan: CompetitorScan | null = null;
  try {
    competitorScan = await runCompetitorScan(input.seed, input.priorArtifacts);
  } catch (err) {
    console.warn(
      `[producers:S4] competitor scan failed — auditing without it: ${(err as Error).message}`,
    );
  }

  // 2. AUDIT — the scan-aware benchmark call. Feed the spar findings so the verdict
  //    reflects the edge thesis + surviving red-team challenges.
  const scanBlock = competitorScan
    ? `\n\nCOMPETITOR SCAN (2-expert EDGE vs RED-TEAM spar result — drive your verdict from this):\n` +
      `Competitors: ${competitorScan.competitors
        .map((c) => `${c.name} (${c.priceRange})`)
        .join('; ')}\n` +
      `Edge thesis: ${competitorScan.edgeThesis}\n` +
      `Edge moves: ${competitorScan.edgeMoves.join('; ') || '(none)'}\n` +
      `Open gaps we fill: ${competitorScan.openGaps.join('; ') || '(none)'}\n` +
      `Surviving red-team challenges: ${competitorScan.redTeamChallenges.join('; ') || '(none)'}\n` +
      `Where competitors are stronger: ${
        competitorScan.whereCompetitorsAreStronger.join('; ') || '(none)'
      }\n` +
      `Edge confidence after sparring: ${competitorScan.confidence}/100 (source: ${competitorScan.dataSource})`
    : '\n\n(Competitor scan unavailable for this run — benchmark against the Stage-2 named competitors.)';

  const user =
    `Produce the artifact for Stage 4 (${stage.name}).\n\n` +
    `OPERATOR SEED:\n${input.seed}` +
    priorBlock(input.priorArtifacts) +
    scanBlock +
    fixBlock(input.fixDeltas);

  const audit = await callClaudeJSON<AuditModelOut>({
    system: cfg.system,
    user,
    schema: cfg.schema,
    maxTokens: cfg.maxTokens ?? 8000,
  });

  // 3. EMBED the scan in the persisted payload (the merge happens in code, not by
  //    the model — keeps the spar transcript verbatim and untruncated).
  return { ...audit, competitorScan };
}

// ─── Stage 3: FULL product generation (Monetise-style, module-by-module) ───────

/** The shape the OUTLINE call returns: the product's ordered section plan. */
interface BuildOutline {
  /** The full product's title (reflects the whole product, NOT a 1-pager). */
  productTitle: string;
  /** One-paragraph intro placed under the product H1, framing the deliverable. */
  intro: string;
  /** Ordered sections/modules to fill — the product's structure. */
  sections: { title: string; scope: string }[];
}

/** One filled section's real content. */
interface BuildSection {
  /** The section heading as it appears in the document (echo of the planned title). */
  title: string;
  /** The section's full real content as markdown (no leading H1/H2 — assembler adds the heading). */
  markdown: string;
}

/**
 * The optional live-formula workbook persisted alongside the markdown for a
 * COMPUTATIONAL product (brief §2c). The `.xlsx` bytes ride inside the Stage-3
 * artifact JSON payload as base64 — no DB migration. Pixel reads
 * `artifact.payload.workbook.base64` to wire a "Download .xlsx" button.
 *
 * Absent entirely when the product is NOT computational (pure-prose ebooks etc.)
 * — markdown stays the sole deliverable; we never force a spreadsheet on prose.
 */
interface BuildWorkbook {
  /** Suggested download filename, e.g. "divorce-organizer.xlsx". */
  filename: string;
  /** base64-encoded `.xlsx` bytes (the workbook itself). */
  base64: string;
  /** The sheet tab names, in order (for a quick UI summary without decoding). */
  sheetNames: string[];
  /** Always true when this object is present (mirrors the gating decision). */
  computational: boolean;
  /**
   * AUDIT MANIFEST (brief §2a) — a compact, human-readable view of the workbook's
   * live formulas so the 3-expert gate can SEE the spreadsheet's computational
   * value WITHOUT decoding the base64 blob. All three fields are computed from the
   * SAME coerced SheetDefs that get rendered to bytes — so the manifest reflects
   * what's actually IN the file, not the raw model claim. They are small (text),
   * safe to keep in the artifact JSON and safe to show the experts.
   */
  /** Total count of live-formula cells across all sheets (cells whose `f` is non-empty after coercion). */
  formulaCount: number;
  /** A BOUNDED sample of real formulas for gate audit — never the whole sheet. */
  formulaSamples: { sheet: string; cell: string; formula: string }[];
  /** Per-sheet shape so the lens can sanity-check structure. */
  sheetSummary: { name: string; rows: number; formulaCells: number }[];
}

/** The final stage-3 artifact. Keeps {title, markdown} for the viewer; adds visibility fields. */
interface BuildArtifact {
  title: string;
  markdown: string;
  /** The section titles that were generated and assembled, in order. */
  sections: string[];
  /** Total markdown character count of the assembled product (assembler-computed). */
  totalChars: number;
  /**
   * Live-formula spreadsheet — present ONLY for computational products. The
   * markdown above is untouched/unconditional; this is purely ADDITIVE.
   */
  workbook?: BuildWorkbook;
}

/**
 * The Stage-2 Blueprint is the structural source of truth. We pass the whole
 * prior-artifact block to the model anyway, but pulling the production spec out
 * explicitly lets the OUTLINE call anchor the section plan on the locked file
 * list / counts / done-definition rather than inventing a structure from scratch.
 */
function blueprintStructureHint(priorArtifacts: Record<number, unknown>): string {
  const bp = priorArtifacts[2];
  if (!bp || typeof bp !== 'object') return '';
  const prod = (bp as { production?: unknown }).production;
  if (!prod || typeof prod !== 'object') return '';
  const p = prod as { fileList?: unknown; counts?: unknown; doneDefinition?: unknown };
  const lines: string[] = [];
  if (Array.isArray(p.fileList) && p.fileList.length > 0) {
    lines.push(`Blueprint file list: ${p.fileList.join('; ')}`);
  }
  if (typeof p.counts === 'string' && p.counts.trim()) lines.push(`Blueprint counts: ${p.counts}`);
  if (typeof p.doneDefinition === 'string' && p.doneDefinition.trim()) {
    lines.push(`Done-definition: ${p.doneDefinition}`);
  }
  return lines.length === 0
    ? ''
    : `\n\nSTAGE-2 PRODUCTION SPEC (anchor the section plan on this):\n- ${lines.join('\n- ')}`;
}

/** JSON schema for the OUTLINE call. */
const OUTLINE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    productTitle: { type: 'string' },
    intro: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string' }, scope: { type: 'string' } },
        required: ['title', 'scope'],
      },
    },
  },
  required: ['productTitle', 'intro', 'sections'],
};

/** JSON schema for ONE section FILL call. */
const SECTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    markdown: { type: 'string' },
  },
  required: ['title', 'markdown'],
};

// ─── Stage 3: live-formula WORKBOOK path (brief §2b/§2c) ─────────────────────
//
// After the markdown product is assembled, for a COMPUTATIONAL product we make
// ONE extra structured call — the WORKBOOK SPEC — that returns a typed sheet/
// column/row/FORMULA plan. The model designs the spreadsheet LOGIC (it returns
// formula strings like "SUM(B2:B9)"); our code renders that to real .xlsx bytes
// via buildXlsx (the model never emits XML). If the model says the product is
// NOT computational, we skip the workbook entirely — markdown stays the
// deliverable. One call only (Stage-3 is already the heaviest stage).

/** Max sheets the workbook may contain. Default 8, clamp [1,20]. Env FACTORY_WORKBOOK_MAX_SHEETS. */
function workbookMaxSheets(): number {
  const raw = process.env.FACTORY_WORKBOOK_MAX_SHEETS;
  if (raw === undefined) return 8;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 8;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

/** Hard cell-cap per sheet so a runaway spec can't bloat the base64 payload. */
const WORKBOOK_MAX_ROWS_PER_SHEET = 200;
const WORKBOOK_MAX_COLS_PER_SHEET = 26;

/**
 * How many real formulas to sample into the audit manifest for the gate (brief
 * §2a). Default 24, clamp [4,60]. Env FACTORY_WORKBOOK_FORMULA_SAMPLES. Bounded so
 * the manifest never balloons the artifact JSON — it's a representative sample for
 * the experts, never the whole sheet.
 */
function workbookFormulaSampleCap(): number {
  const raw = process.env.FACTORY_WORKBOOK_FORMULA_SAMPLES;
  if (raw === undefined) return 24;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 24;
  return Math.min(60, Math.max(4, Math.floor(n)));
}

/** One live-formula cell located in the coerced grid (for counting/sampling). */
interface FormulaHit {
  sheet: string;
  /** A1 ref computed from row/col index via the xlsx colLetter helper. */
  cell: string;
  /** The `<f>` string (no leading '='), already coerced/normalized. */
  formula: string;
}

/**
 * Build the audit manifest (formulaCount / formulaSamples / sheetSummary) from the
 * COERCED SheetDefs — the exact cells that get written to the .xlsx, so the
 * manifest matches the file, not the raw model claim. Counts only cells whose `f`
 * survived `toSheetCell` coercion. Samples are taken ROUND-ROBIN across sheets so a
 * multi-sheet workbook isn't represented by sheet-1 only, then capped. Reuses the
 * xlsx `colLetter` helper for A1 refs (no duplicated column-letter routine).
 */
function buildWorkbookManifest(sheets: SheetDef[]): {
  formulaCount: number;
  formulaSamples: { sheet: string; cell: string; formula: string }[];
  sheetSummary: { name: string; rows: number; formulaCells: number }[];
} {
  const sheetSummary: { name: string; rows: number; formulaCells: number }[] = [];
  // Per-sheet ordered formula hits → enables round-robin sampling across sheets.
  const perSheetHits: FormulaHit[][] = [];
  let formulaCount = 0;

  for (const s of sheets) {
    const rows = Array.isArray(s.rows) ? s.rows : [];
    const hits: FormulaHit[] = [];
    rows.forEach((row, r) => {
      (Array.isArray(row) ? row : []).forEach((cell, c) => {
        if (cell && typeof cell.f === 'string' && cell.f.trim()) {
          hits.push({ sheet: s.name, cell: `${colLetter(c)}${r + 1}`, formula: cell.f });
        }
      });
    });
    formulaCount += hits.length;
    perSheetHits.push(hits);
    sheetSummary.push({ name: s.name, rows: rows.length, formulaCells: hits.length });
  }

  // Round-robin across sheets so the sample spans the whole workbook, not sheet 1.
  const cap = workbookFormulaSampleCap();
  const formulaSamples: { sheet: string; cell: string; formula: string }[] = [];
  const cursors = perSheetHits.map(() => 0);
  let exhausted = false;
  while (formulaSamples.length < cap && !exhausted) {
    exhausted = true;
    for (let i = 0; i < perSheetHits.length && formulaSamples.length < cap; i++) {
      const hits = perSheetHits[i];
      const cur = cursors[i];
      if (cur < hits.length) {
        formulaSamples.push(hits[cur]);
        cursors[i] = cur + 1;
        exhausted = false;
      }
    }
  }

  return { formulaCount, formulaSamples, sheetSummary };
}

/** One cell as the model returns it (mirrors xlsx.SheetCell, schema-constrained). */
interface SpecCell {
  v?: string | number;
  f?: string;
  style?: CellStyle;
}
/** One sheet as the model returns it. */
interface SpecSheet {
  name: string;
  rows: SpecCell[][];
  cols?: number[];
}
/** The WORKBOOK-SPEC call's full return shape. */
interface WorkbookSpec {
  computational: boolean;
  filename?: string;
  sheets?: SpecSheet[];
}

const STYLE_ENUM = ['header', 'input', 'formula', 'label', 'money'];

/** JSON schema for the WORKBOOK-SPEC call. */
const WORKBOOK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    computational: { type: 'boolean' },
    filename: { type: 'string' },
    sheets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          cols: { type: 'array', items: { type: 'number' } },
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  v: { type: ['string', 'number'] },
                  f: { type: 'string' },
                  style: { type: 'string', enum: STYLE_ENUM },
                },
              },
            },
          },
        },
        required: ['name', 'rows'],
      },
    },
  },
  required: ['computational'],
};

/** Coerce one spec cell to a clean xlsx SheetCell (drop junk, keep formula/value/style). */
function toSheetCell(c: SpecCell | null | undefined): SheetCell {
  if (!c || typeof c !== 'object') return {};
  const out: SheetCell = {};
  // Formula wins; strip a leading '=' the model may include (renderer also guards).
  if (typeof c.f === 'string' && c.f.trim()) out.f = c.f.replace(/^\s*=+/, '').trim();
  if (typeof c.v === 'string' || (typeof c.v === 'number' && Number.isFinite(c.v))) out.v = c.v;
  if (typeof c.style === 'string' && STYLE_ENUM.includes(c.style)) out.style = c.style as CellStyle;
  return out;
}

/** Coerce + BOUND the model's spec into safe SheetDefs (caps sheets/rows/cols). */
function specToSheets(spec: WorkbookSpec): SheetDef[] {
  const maxSheets = workbookMaxSheets();
  const rawSheets = Array.isArray(spec.sheets) ? spec.sheets : [];
  const sheets: SheetDef[] = [];
  for (const s of rawSheets.slice(0, maxSheets)) {
    if (!s || typeof s !== 'object') continue;
    const name = typeof s.name === 'string' && s.name.trim() ? s.name : `Sheet${sheets.length + 1}`;
    const rawRows = Array.isArray(s.rows) ? s.rows.slice(0, WORKBOOK_MAX_ROWS_PER_SHEET) : [];
    const rows: SheetCell[][] = rawRows.map((row) =>
      (Array.isArray(row) ? row.slice(0, WORKBOOK_MAX_COLS_PER_SHEET) : []).map(toSheetCell),
    );
    const cols =
      Array.isArray(s.cols) && s.cols.length > 0
        ? s.cols.slice(0, WORKBOOK_MAX_COLS_PER_SHEET).filter((w) => Number.isFinite(w))
        : undefined;
    sheets.push({ name, rows, cols });
  }
  return sheets;
}

/** Derive a safe .xlsx filename from a product title (kebab, ascii, bounded). */
function safeWorkbookFilename(suggested: string | undefined, productTitle: string): string {
  const base = (suggested && suggested.trim()) || productTitle || 'workbook';
  const stem = base
    .replace(/\.xlsx$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'workbook'}.xlsx`;
}

/**
 * Build the optional live-formula workbook for a computational product. ONE LLM
 * call (the WORKBOOK SPEC); the model designs sheets/columns/rows + formula
 * strings, our code renders the bytes. Returns undefined when the product is
 * non-computational OR the spec produced no usable sheets. RESILIENT: a flake
 * here (after llm.ts retries) returns undefined rather than failing the whole
 * Stage-3 build — the workbook is additive, the markdown is the guaranteed
 * deliverable.
 */
async function produceWorkbook(
  productTitle: string,
  seed: string,
  prior: string,
  structureHint: string,
  outlineList: string,
): Promise<BuildWorkbook | undefined> {
  const maxSheets = workbookMaxSheets();

  const system =
    'You are the Stage 3 Build producer (WORKBOOK phase). You decide whether the ' +
    'product just built is COMPUTATIONAL — i.e. its core value is calculation a ' +
    'spreadsheet does live (a budget/finances workbook, an equalization or ' +
    'settlement calculator, a net-worth tracker, a pricing model, a planner with ' +
    'roll-ups/totals). If it is NOT computational (a pure-prose ebook, a checklist ' +
    'with no math, a guide), set computational:false and return NO sheets — the ' +
    'markdown stays the deliverable; do NOT force a spreadsheet onto prose.\n\n' +
    'If it IS computational, design a REAL working spreadsheet with LIVE Excel ' +
    'formulas. Return a typed plan only — DO NOT emit XML. For each sheet: a name, ' +
    'optional column widths, and a row-major grid of cells. Each cell is one of:\n' +
    '  • a LABEL/heading: {"v":"Asset","style":"header"} or {"v":"Total","style":"label"}\n' +
    '  • a BUYER INPUT (a value they type): {"v":0,"style":"input"}\n' +
    '  • a MONEY value: {"v":1234.5,"style":"money"}\n' +
    '  • a LIVE FORMULA: {"f":"SUM(B2:B9)","style":"formula"} — f is an Excel ' +
    'formula WITHOUT a leading "=" (e.g. "SUM(B2:B9)", "(B12-C12)/2", "B5*0.5", ' +
    '"IFERROR(B2/C2,0)"). Reference real cells you laid out. Formulas are what make ' +
    'this beat a static doc — the cell COMPUTES the answer on open.\n\n' +
    `Use at most ${maxSheets} sheets. Build a genuinely useful tool a paying buyer ` +
    'opens and immediately gets answers from — totals that sum, calculators that ' +
    'compute, scenarios that update. Wrap every division in IFERROR(…,0) so an empty ' +
    'input never shows #DIV/0!. Keep grids reasonable (tens of rows, not hundreds).';

  const user =
    `Design the live-formula workbook for this just-built product (or decline it if ` +
    `it is not computational).\n\nPRODUCT: ${productTitle}\n\nOPERATOR SEED:\n${seed}\n\n` +
    `PRODUCT STRUCTURE (the sections that were built):\n${outlineList}` +
    prior +
    structureHint +
    `\n\nReturn {computational}. If true, also return {filename, sheets[]} with real ` +
    `<f> formulas wired to the cells you lay out. If false, return computational:false and no sheets.`;

  let spec: WorkbookSpec;
  try {
    spec = await callClaudeJSON<WorkbookSpec>({
      system,
      user,
      schema: WORKBOOK_SCHEMA,
      maxTokens: 8000,
    });
  } catch {
    // Workbook is additive — never let its flake fail the markdown build.
    return undefined;
  }

  if (!spec || spec.computational !== true) return undefined;

  const sheets = specToSheets(spec);
  // A computational verdict with no usable sheet content → treat as no workbook.
  const hasContent = sheets.some((s) => s.rows.some((r) => r.length > 0));
  if (sheets.length === 0 || !hasContent) return undefined;

  const bytes = buildXlsx(sheets);
  const manifest = buildWorkbookManifest(sheets);
  return {
    filename: safeWorkbookFilename(spec.filename, productTitle),
    base64: bytes.toString('base64'),
    sheetNames: sheets.map((s) => s.name),
    computational: true,
    ...manifest,
  };
}

/**
 * Produce the FULL product for Stage 3, Monetise-style:
 *   1. OUTLINE — one call: derive the product's ordered section plan from the
 *      Stage-2 Blueprint (bounded by FACTORY_BUILD_MAX_SECTIONS).
 *   2. FILL — one call PER section (serialized): generate each section's real,
 *      buyer-usable content as markdown, given the blueprint + the full outline.
 *   3. ASSEMBLE — in code: stitch H1 + intro + every section into one complete
 *      markdown product. No model call; deterministic.
 *
 * A FIX re-produce (fixDeltas present) re-runs the same full pipeline with the
 * deltas threaded into both the outline and the section prompts — the gate loop
 * keeps full structural control and the product stays complete after a fix.
 */
async function produceBuildArtifact(input: ProduceInput): Promise<BuildArtifact> {
  const { seed, priorArtifacts, fixDeltas } = input;
  const maxSections = buildMaxSections();
  const prior = priorBlock(priorArtifacts);
  const structureHint = blueprintStructureHint(priorArtifacts);
  const fix = fixBlock(fixDeltas);

  // ── 1. OUTLINE ──────────────────────────────────────────────────────────────
  const outlineSystem =
    'You are the Stage 3 Build producer (OUTLINE phase). You generate REAL, ' +
    'complete, done-for-you digital products — never a sample or a 1-page proof. ' +
    'From the approved Stage-2 Blueprint, plan the FULL product as an ordered list ' +
    'of sections/modules that, once each is written out in full, IS the finished, ' +
    'sellable product (e.g. for a Divorce Organizer: every organizer section — ' +
    'document inventory, deadlines/timeline tracker, finances, custody logistics, ' +
    'legal milestones, emotional check-ins, how-to-use, etc.). Cover the WHOLE ' +
    'product, not one representative slice. Each section needs a clear title and a ' +
    'one-line scope of exactly what its filled content must contain. Plan no more ' +
    `than ${maxSections} sections — if the product needs more, merge the smallest ` +
    'into coherent modules so the most important content is never dropped. Also ' +
    'give the product its real title (the FULL product, not a proof) and a short ' +
    'intro paragraph for under the title.';
  const outlineUser =
    `Plan the FULL product for Stage 3 (Build).\n\nOPERATOR SEED:\n${seed}` +
    prior +
    structureHint +
    fix +
    `\n\nReturn the product title, an intro paragraph, and up to ${maxSections} ordered ` +
    'sections (title + scope). The sections together must constitute the COMPLETE product.';

  const outline = await callClaudeJSON<BuildOutline>({
    system: outlineSystem,
    user: outlineUser,
    schema: OUTLINE_SCHEMA,
    maxTokens: 4000,
  });

  // Defensive bound: never fill more than the ceiling even if the model overshoots.
  const planned = (outline.sections ?? []).filter(
    (s) => s && typeof s.title === 'string' && s.title.trim(),
  );
  const toFill = planned.slice(0, maxSections);
  if (toFill.length === 0) {
    throw new Error('Stage 3 OUTLINE returned no usable sections — cannot build product.');
  }

  const outlineList = toFill.map((s, i) => `${i + 1}. ${s.title} — ${s.scope}`).join('\n');

  // ── 2. FILL (serialized — one call per section; subscription rate caps) ───────
  const fillSystem =
    'You are the Stage 3 Build producer (FILL phase). You write ONE section of a ' +
    'larger product to its FINAL, buyer-usable quality — real content a paying ' +
    'customer can use immediately, NOT a placeholder, summary, or outline. Match ' +
    "the product's tone and the Stage-2 offer. Output ONLY this section's body as " +
    'markdown (tables, checklists, fillable fields, prompts, step-by-steps as the ' +
    'scope requires). Do NOT add a top-level H1 for the whole product and do NOT ' +
    'restate other sections — the assembler places your section under its heading. ' +
    'Stay strictly within THIS section\'s scope so the assembled product has no gaps ' +
    'or overlaps.';

  const filled: BuildSection[] = [];
  for (let i = 0; i < toFill.length; i++) {
    const s = toFill[i];
    const fillUser =
      `Write the FULL content for ONE section of this product.\n\n` +
      `PRODUCT: ${outline.productTitle}\n` +
      `OPERATOR SEED:\n${seed}\n\n` +
      `FULL SECTION PLAN (for context — write ONLY the target section):\n${outlineList}\n\n` +
      `TARGET SECTION (#${i + 1}): ${s.title}\n` +
      `SECTION SCOPE: ${s.scope}` +
      prior +
      fix +
      `\n\nReturn this section's title and its complete markdown body.`;

    // Serial await — never parallel: the subscription rate wall (llm.ts) trips on
    // ~9-10 concurrent heavy calls. callClaudeJSON already retries flakes/throttle.
    const section = await callClaudeJSON<BuildSection>({
      system: fillSystem,
      user: fillUser,
      schema: SECTION_SCHEMA,
      maxTokens: 8000,
    });
    filled.push({
      title: (section.title && section.title.trim()) || s.title,
      markdown: typeof section.markdown === 'string' ? section.markdown.trim() : '',
    });
  }

  // ── 3. ASSEMBLE (deterministic — no model call) ──────────────────────────────
  const productTitle = (outline.productTitle && outline.productTitle.trim()) || 'Product';
  const introText = (outline.intro && outline.intro.trim()) || '';
  const parts: string[] = [`# ${productTitle}`];
  if (introText) parts.push(introText);
  for (const sec of filled) {
    parts.push(`## ${sec.title}`);
    parts.push(sec.markdown || '_(section intentionally left empty)_');
  }
  const markdown = parts.join('\n\n').trim();

  // ── 4. WORKBOOK (additive — one extra call; skipped for non-computational) ──
  // After the markdown deliverable is complete, attempt a live-formula .xlsx.
  // produceWorkbook returns undefined for prose products or on any flake, so the
  // markdown build above is the guaranteed deliverable and this never fails it.
  const workbook = await produceWorkbook(
    productTitle,
    seed,
    prior,
    structureHint,
    outlineList,
  );

  return {
    title: productTitle,
    markdown,
    sections: filled.map((s) => s.title),
    totalChars: markdown.length,
    ...(workbook ? { workbook } : {}),
  };
}
