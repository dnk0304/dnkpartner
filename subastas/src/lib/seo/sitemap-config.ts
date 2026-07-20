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
 * ── Concluded exposure (FULL — phased ramp overridden 2026-07-20) ──────────
 * Dennis took manual GSC control and overrode the phased ramp: expose the ENTIRE
 * scoped-concluded set now (sold-price teaser is live, so the pages carry real
 * content). This is still a growing cap, NOT a rotating window: children are only
 * ADDED, never removed, so an already-indexed page never churns out of the
 * sitemap (no de-index risk). `soldDate DESC` ordering means child #1 is always
 * the freshest 20k. Sizing rationale for the current value lives on the constant.
 */

/** URLs per child sitemap file. FIRM (Dennis). Under the 50k spec cap. */
export const CHILD_SITEMAP_SIZE = 20_000;

/**
 * Fixed number of ACTIVE-detail children (20k each). Active set is ~5k today;
 * 2 chunks = 40k headroom. Bump if active inventory ever approaches 40k.
 */
export const ACTIVE_CHUNKS = 2;

/**
 * Concluded children published to the index (freshest-first). FULL EXPOSURE —
 * the phased ramp was overridden by Dennis on 2026-07-20 (manual GSC control).
 *
 * Sizing (measured live 2026-07-20 from the public /resultados registry):
 * adjudicadas 87,290 + desiertas 84,843 = 172,133 outcome-qualifying rows. This
 * is an UPPER BOUND on concludedIndexableWhere() — that predicate further filters
 * to the 12 property+vehicle categories + resultCheckedAt NOT NULL, so the true
 * count is ≤ 172,133. ceil(172,133 / 20,000) = 9 children covers the full set with
 * zero URLs dropped; the last child(ren) may be short/empty if the category filter
 * trims below a 20k boundary (an empty child is still a valid 200 <urlset>).
 * Growing cap only — bump if the concluded set ever exceeds 180k rows.
 */
export const PUBLISHED_CONCLUDED_CHILDREN = 9;

/** Total published children = aggregation + active + published concluded. */
export const TOTAL_CHILDREN = 1 + ACTIVE_CHUNKS + PUBLISHED_CONCLUDED_CHILDREN;

/** Ordered id list for generateSitemaps() AND robots.txt. */
export function sitemapChildIds(): number[] {
  return Array.from({ length: TOTAL_CHILDREN }, (_, i) => i);
}

/** Absolute child sitemap URLs for robots.txt / the sitemap index. */
export function sitemapChildUrls(site: string): string[] {
  return sitemapChildIds().map((id) => `${site}/sitemap/${id}.xml`);
}

/**
 * Canonical sitemap-INDEX path. This is the single URL Dennis submits to GSC;
 * Google follows it to every child. Served by `src/app/sitemap.xml/route.ts`
 * as a <sitemapindex> (Next's generateSitemaps() emits the children at
 * /sitemap/{id}.xml but does NOT emit a top-level index — that gap is the
 * route handler's whole reason to exist). Single-sourced here so robots.ts and
 * the route can't drift.
 */
export const SITEMAP_INDEX_PATH = '/sitemap.xml';

/** Absolute canonical sitemap-index URL (what robots.txt advertises). */
export function sitemapIndexUrl(site: string): string {
  return `${site}${SITEMAP_INDEX_PATH}`;
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
