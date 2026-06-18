/**
 * Stage producers — generate each stage's artifact from (seed + prior artifacts)
 * via ONE structured LLM call. These are thin PRODUCER prompts authored here;
 * the EXPERT prompts (vendored) are for GATING, not producing (ORCHESTRATION
 * §2). v1 keeps producers deliberately small — the point of the slice is to
 * prove the produce→gate→advance loop, not to ship the full 30-page pack.
 *
 * Each producer returns a JSON artifact whose shape matches the reference
 * artifact for that stage (BLUEPRINT §1). Stage 3 (build) ships a SMALL real
 * 1-page markdown artifact in v1 — flagged reduced scope; the full build is a
 * later phase.
 */

import { callClaudeJSON } from './llm';
import { getStage } from './types';

export interface ProduceInput {
  stage: number;
  seed: string;
  priorArtifacts: Record<number, unknown>;
  /** If this is a fix re-produce, the deltas the new artifact must address. */
  fixDeltas?: string[];
}

function priorBlock(priorArtifacts: Record<number, unknown>): string {
  if (Object.keys(priorArtifacts).length === 0) return '';
  return `\n\nAPPROVED PRIOR-STAGE ARTIFACTS (build on these, stay consistent):\n${JSON.stringify(
    priorArtifacts,
    null,
    2,
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
  3: {
    system:
      'You are the Stage 3 Build producer. v1 SCOPE (reduced, flagged): produce a SMALL but REAL ' +
      "1-page product artifact in markdown — enough to prove the build+gate loop, NOT the full pack. " +
      'It must be genuinely usable content for the buyer (not a placeholder), matching the Stage 2 ' +
      'production spec as far as a 1-pager allows. List which spec files this 1-pager represents and ' +
      'which are deferred to the full build phase.',
    maxTokens: 12000,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        markdown: { type: 'string' },
        representsFiles: { type: 'array', items: { type: 'string' } },
        deferredFiles: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'markdown', 'representsFiles', 'deferredFiles'],
    },
  },
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
