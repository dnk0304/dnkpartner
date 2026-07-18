/**
 * src/lib/seo/sitemap-config.ts — the sitemap CHUNK LAYOUT, shared by
 * `src/app/sitemap.ts` (which generates the children) and `src/app/robots.ts`
 * (which advertises them). Defining the layout ONCE here is what guarantees
 * robots.txt's sitemap lines == generateSitemaps() output == the actual child
 * routes — they can never drift (07 §4; the old hardcoded `/sitemap/0..3.xml`
 * in robots.ts drifted from the code and is the bug this replaces).
 *
 * ── URL-per-file cap ──────────────────────────────────────────────────────
 * CHILD_SITEMAP_SIZE = 20_000 is FIRM (Dennis's explicit spec). He knows the
 * sitemaps.org cap is 50k URLs/file — he wants 20k: smaller files, gentler
 * crawl on a young domain. Do NOT bump to 45k/50k.
 *
 * ── Layout (fixed IDs — NO DB call to enumerate, so the route stays fully
 *    request-time, never build-time; 07 §4) ─────────────────────────────────
 *   id 0                              → aggregation (home, /subastas, 52
 *                                       provinces, active towns, tipos, dense
 *                                       categories, guides, noticias) — ~3-5k.
 *   id 1 .. ACTIVE_CHUNKS             → ACTIVE auction details, 20k/file
 *                                       (skip/take, orderBy id asc).
 *   id ACTIVE_CHUNKS+1 .. +N          → SCOPED CONCLUDED details, 20k/file,
 *                                       orderBy soldDate DESC (freshest 20k in
 *                                       child #1), where N = PUBLISHED_CONCLUDED_CHILDREN.
 *
 * ── PHASED ramp (Ken/Dennis decision) ─────────────────────────────────────
 * We publish only the top `PUBLISHED_CONCLUDED_CHILDREN` concluded children —
 * the freshest / most valuable sold pages first — and RAMP it up as GSC shows
 * the earlier batch getting indexed. This is a growing cap, NOT a rotating
 * window: children are only ADDED, never removed, so an already-indexed page
 * never churns out of the sitemap (no de-index risk). Bump this one constant
 * over weeks. `soldDate DESC` ordering means child #1 is always the freshest
 * 20k, so a low cap still exposes the highest-intent pages.
 */

/** URLs per child sitemap file. FIRM (Dennis). Under the 50k spec cap. */
export const CHILD_SITEMAP_SIZE = 20_000;

/**
 * Fixed number of ACTIVE-detail children (20k each). Active set is ~5k today;
 * 2 chunks = 40k headroom. Bump if active inventory ever approaches 40k.
 */
export const ACTIVE_CHUNKS = 2;

/**
 * PHASED ramp dial — how many concluded children (freshest-first) are published
 * to the index right now. Start conservative to protect the young domain's
 * crawl budget; Ken/Dennis bump as GSC indexes the earlier batch. Growing cap
 * only — never rotates. Full scoped concluded set is ~9 children (~178k), so
 * this can climb toward ~9 once the domain has proven it can absorb the batch.
 */
export const PUBLISHED_CONCLUDED_CHILDREN = 2;

/** Total published children = aggregation + active + published concluded. */
export const TOTAL_CHILDREN = 1 + ACTIVE_CHUNKS + PUBLISHED_CONCLUDED_CHILDREN;

/** Ordered id list for generateSitemaps() AND robots.txt. */
export function sitemapChildIds(): number[] {
  return Array.from({ length: TOTAL_CHILDREN }, (_, i) => i);
}

/** Absolute child sitemap URLs for robots.txt. */
export function sitemapChildUrls(site: string): string[] {
  return sitemapChildIds().map((id) => `${site}/sitemap/${id}.xml`);
}

export type ChunkKind =
  | { kind: 'aggregation' }
  | { kind: 'active'; skip: number }
  | { kind: 'concluded'; skip: number };

/**
 * Map a child id → what it contains + its skip offset. Pure, no DB. Defensive
 * for out-of-range ids (Next can invoke the route for any id): ids past the
 * active band are treated as concluded with the corresponding offset, so a
 * direct hit on an un-advertised concluded child still returns valid data
 * rather than erroring — it's simply not linked from robots/index.
 */
export function classifyChunk(id: number): ChunkKind {
  if (id <= 0) return { kind: 'aggregation' };
  if (id <= ACTIVE_CHUNKS) {
    return { kind: 'active', skip: (id - 1) * CHILD_SITEMAP_SIZE };
  }
  const concludedIndex = id - 1 - ACTIVE_CHUNKS; // 0-based
  return { kind: 'concluded', skip: concludedIndex * CHILD_SITEMAP_SIZE };
}
