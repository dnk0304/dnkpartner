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
 * Fixed number of ACTIVE-detail children (20k each).
 *
 * ── WAS 2. CORRECTED TO 1, 2026-08-12 (Forge). ────────────────────────────
 * The old value was set against a "~5k active" estimate that was never true.
 * MEASURED LIVE on prod 2026-08-12, running the EXACT child-query predicate
 * (`status IN ('PROXIMA_APERTURA','CELEBRANDOSE') AND inScope = true`):
 *
 *     active rows = 1,154   →   ceil(1,154 / 20,000) = 1
 *
 * With ACTIVE_CHUNKS = 2, child id 2 took `skip = 20_000` against a 1,154-row
 * set and therefore served an **empty `<urlset>`** to Google — confirmed live:
 * `/sitemap/2.xml` returned `200` with zero `<loc>`.
 *
 * This is the exact failure mode the comment block below already condemns for
 * the CONCLUDED band ("a self-inflicted 'couldn't fetch / no URLs' signal on a
 * sitemap index we are actively trying to get Google to trust"). The fix was
 * applied to concluded on 2026-08-03 and never to active. It is applied here now.
 *
 * ── NO `<loc>` IS LOST BY THE RENUMBER (proof, not assertion) ─────────────
 * Dropping to 1 shifts the concluded children's ids down by one. The URL SET is
 * nevertheless bit-identical, because `classifyChunk` derives a child's content
 * purely from its `skip` offset, and every offset is preserved:
 *
 *   band       before (ACTIVE_CHUNKS=2)      after (ACTIVE_CHUNKS=1)
 *   active     id 1 → skip 0     (1,154)     id 1 → skip 0     (1,154)
 *              id 2 → skip 20000 (0 — EMPTY) (child no longer published)
 *   concluded  id 3 → skip 0                 id 2 → skip 0
 *              id 4 → skip 20000             id 3 → skip 20000
 *
 * Every non-empty (kind, skip) pair still has exactly one published child. The
 * only child that disappears is the one that contained nothing. Union of `<loc>`
 * before == union after; the delta is 0 URLs.
 *
 * Bump this ONLY against a re-run of the measurement above, and only if active
 * inventory actually approaches 20,000. Do not raise it for "headroom" — an
 * over-provisioned band publishes empty children, which is strictly worse than
 * being one deploy late.
 */
export const ACTIVE_CHUNKS = 1;

/**
 * Concluded children published to the index (freshest-first). FULL EXPOSURE —
 * the phased ramp was overridden by Dennis on 2026-07-20 (manual GSC control).
 *
 * ── RE-DERIVED 2026-08-03 (post recency-floor), was 9 ─────────────────────
 * The old `9` came from a PRE-FLOOR measurement (172,133 outcome-qualifying rows
 * off the public /resultados registry, ceil(172,133/20,000)=9). The 24-month
 * recency floor added to `concludedIndexableWhere()` (concluded-indexable.ts,
 * SEO_CONCLUDED_MAX_AGE_MONTHS) changes that number completely.
 *
 * MEASURED LIVE against prod on 2026-08-03, running the EXACT predicate:
 *   without the floor : 171,483 rows
 *   with  the floor   :  26,800 rows   (Δ −144,683, −84.4%)
 * ceil(26,800 / 20,000) = 2. Publishing 9 would have served SEVEN empty
 * <urlset> children into GSC — a self-inflicted "couldn't fetch / no URLs"
 * signal on a sitemap index we are actively trying to get Google to trust.
 *
 * ⚠️ This is no longer a purely GROWING cap. The floor is a ROLLING 24-month
 * window, so the concluded set is now steady-state, not monotonic: ~11–15k rows
 * conclude per year and an equal volume ages out of the tail. Expect this to sit
 * around 26–32k indefinitely. Headroom on 2 children = 40,000 URLs.
 * BUMP TO 3 if the measured post-floor count ever exceeds ~38,000.
 *
 * Re-measure with the same query before changing this constant — do NOT
 * eyeball it off the /resultados registry, which does not apply the floor.
 *
 * ── OPERATOR-CONTROLLED FROM 2026-08-12 (Forge) ───────────────────────────
 * Paired with `SEO_CONCLUDED_MAX_AGE_MONTHS` (concluded-indexable.ts), which is
 * now also env-driven so Ken can run the sitemap widening as a phased rollout
 * without a rebuild per step. THE TWO MUST MOVE TOGETHER:
 *
 *   floor 24mo (default) → ~26,800 rows → 2 children   ← today, unchanged
 *   floor 60mo           → re-measure   → set to ceil(measured / 20,000)
 *   floor off (=0)       → ~171,483     → 9 children
 *
 * Raising the floor WITHOUT raising this is inert (extra rows qualify but are
 * never published). Raising this WITHOUT the measurement publishes EMPTY
 * children — the exact defect fixed in ACTIVE_CHUNKS above. Always re-run the
 * count query with the live predicate before setting it.
 *
 *   PUBLISHED_CONCLUDED_CHILDREN unset → 2 (no-op default)
 *
 * Clamped to >= 1: a 0 or garbage value must not silently unpublish the entire
 * concluded band, which would de-index every concluded page already submitted.
 */
export const PUBLISHED_CONCLUDED_CHILDREN = ((): number => {
  const raw = process.env.PUBLISHED_CONCLUDED_CHILDREN;
  if (raw == null || raw.trim() === '') return 2;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 2;
  return n;
})();

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
