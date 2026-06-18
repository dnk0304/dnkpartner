/**
 * Etsy draft-listing adapter — the honest boundary of v1.
 *
 * ⚠ GROUND TRUTH: we have Etsy READ only. The WRITE endpoint
 * (createDraftListing) needs an OAuth2 user-token with `listings_w` scope that
 * Dennis has NOT provisioned. So v1 ends at a persisted, schema-valid draft
 * OBJECT — it does NOT call Etsy. The publish POST sits behind ETSY_WRITE_ENABLED
 * (default OFF) and throws a clear, non-faking error until the token lands.
 * NEVER fake a published listing — that honesty is the whole point of this
 * project vs Monetise.
 *
 * Etsy field constraints baked in (agent-memory patterns_etsy_digital_listing_create):
 *   - title <= 140 chars
 *   - <= 13 tags, each <= 20 chars
 *   - digital listing: price + description + attached file
 */

const TITLE_MAX = 140;
const MAX_TAGS = 13;
const TAG_MAX = 20;

export interface EtsyDraftListing {
  title: string;
  description: string;
  tags: string[];
  /** Price as a string (e.g. "12.00") — kept as authored; Etsy inventory sets the real money. */
  price: string;
  /** The build file the buyer receives (reference/path from the build stage). */
  attachedFile: string;
  /** "digital" — v1 produces digital products. */
  listingType: 'digital';
  /** Always 'draft' in v1 — never published. */
  state: 'draft';
  /** Provenance/audit notes (what was clamped, what's deferred). */
  notes: string[];
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * Build a schema-valid Etsy draft-listing object from the run's stage artifacts.
 * Pulls primarily from the Stage 8 launch artifact, falling back to Stage 7
 * storefront. Clamps title/tags to Etsy limits and records every clamp in
 * `notes` so the operator sees exactly what was adjusted (no silent edits).
 */
export function buildDraftListing(
  priorArtifacts: Record<number, unknown>,
): EtsyDraftListing {
  const launch = asRecord(priorArtifacts[8]);
  const storefront = asRecord(priorArtifacts[7]);
  const notes: string[] = [];

  // Title: prefer the Stage 8 SEO listing title, fall back to Stage 7.
  let title = str(launch.listingTitle, str(storefront.title, 'Untitled product'));
  if (title.length > TITLE_MAX) {
    notes.push(`Title clamped from ${title.length} to ${TITLE_MAX} chars for Etsy.`);
    title = title.slice(0, TITLE_MAX).trim();
  }

  const description = str(
    launch.listingDescription,
    str(storefront.description, ''),
  );

  // Tags: from Stage 8, fall back to Stage 7. Dedupe, clamp each to 20 chars,
  // cap the list at 13.
  const rawTags = Array.isArray(launch.listingTags)
    ? (launch.listingTags as unknown[])
    : Array.isArray(storefront.tags)
    ? (storefront.tags as unknown[])
    : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of rawTags) {
    let tag = str(t);
    if (!tag) continue;
    if (tag.length > TAG_MAX) {
      tag = tag.slice(0, TAG_MAX).trim();
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  if (rawTags.length > tags.length) {
    notes.push(`Tags reduced from ${rawTags.length} to ${tags.length} (Etsy max 13, <=20 chars each).`);
  }

  const price = str(launch.price, str(storefront.price, '0.00'));
  const attachedFile = str(
    launch.attachedFile,
    str(storefront.attachedFile, 'build-artifact.md'),
  );

  notes.push('state=draft — Etsy write token not connected; this object is NOT published.');

  return {
    title,
    description,
    tags,
    price,
    attachedFile,
    listingType: 'digital',
    state: 'draft',
    notes,
  };
}

/** Whether the live Etsy write path is enabled. Default OFF (token not provisioned). */
export function isEtsyWriteEnabled(): boolean {
  return process.env.ETSY_WRITE_ENABLED === 'true';
}

/**
 * Publish-gate copy for the operator panel. Honest about the missing token.
 */
export function publishGateMessage(): string {
  return isEtsyWriteEnabled()
    ? 'Etsy write token connected — one-click publish is available.'
    : 'Etsy write token not connected — connect to enable one-click publish.';
}

/**
 * The real Etsy createDraftListing POST — STUBBED OFF for v1. Throws a clear,
 * non-faking error unless ETSY_WRITE_ENABLED is true AND a token path is wired.
 * This is the typed seam: when Dennis provisions the listings_w OAuth token,
 * the live POST is implemented here behind the same flag. Until then we NEVER
 * report a published listing.
 */
export async function publishDraft(_draft: EtsyDraftListing): Promise<never> {
  throw new Error(
    'Etsy publish is disabled: no listings_w OAuth write token is connected. ' +
      'The draft is persisted as draft_ready; publishing requires Dennis to provision ' +
      'the Etsy write token and ETSY_WRITE_ENABLED=true. Refusing to fake a publish.',
  );
}
