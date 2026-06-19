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
      'You are the Stage 4 Audit producer. Benchmark the built artifact against the 3 named live ' +
      'competitors from Stage 2 on completeness, perceived value, presentation, and price-to-value. ' +
      'Return a verdict (ship | improve-then-ship | kill) and, if improve, the exact deltas.',
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

/** The final stage-3 artifact. Keeps {title, markdown} for the viewer; adds visibility fields. */
interface BuildArtifact {
  title: string;
  markdown: string;
  /** The section titles that were generated and assembled, in order. */
  sections: string[];
  /** Total markdown character count of the assembled product (assembler-computed). */
  totalChars: number;
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

  return {
    title: productTitle,
    markdown,
    sections: filled.map((s) => s.title),
    totalChars: markdown.length,
  };
}
