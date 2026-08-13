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
 *   id 0 .. PUBLISHED_AGGREGATION_CHILDREN-1
 *                                     → AGGREGATION (home, /subastas, 52
 *                                       provinces, active towns, tipos, dense
 *                                       categories, the /resultados archive
 *                                       tree, guides, noticias), 20k/file.
 *   next ACTIVE_CHUNKS ids            → ACTIVE auction details, 20k/file
 *                                       (skip/take, orderBy id asc).
 *   next PUBLISHED_CONCLUDED_CHILDREN → SCOPED CONCLUDED details, 20k/file,
 *                                       orderBy soldDate DESC (freshest 20k in
 *                                       the band's first child).
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

// ===========================================================================
// THE AGGREGATION BAND — chunked as of 2026-08-13 (Ken's ruling, v4 P3)
// ===========================================================================

/**
 * ⭐ THE ONE KNOB. If you turn nothing else in this file, turn this.
 *
 * ── WHAT IT DOES ──────────────────────────────────────────────────────────
 * The maximum number of `/resultados` ARCHIVE URLs the sitemap advertises. The
 * archive tree currently contains 19,193 URLs; this caps how many of them we
 * submit to Google, so we ask for the re-crawl in controlled weekly steps
 * instead of dropping the whole tree on Googlebot at once.
 *
 * ── HOW TO TURN IT ────────────────────────────────────────────────────────
 * It is an ENVIRONMENT VARIABLE on the `dnksubastas` compose service. Set it,
 * restart the service, done. NO REBUILD, NO REDEPLOY, and it is reversible in
 * the same 30 seconds it took to set.
 *
 *     SITEMAP_ARCHIVE_MAX_URLS=35405
 *
 * ── THE SCHEDULE (Ken, 2026-08-13) ────────────────────────────────────────
 * The ramp starts ONE WEEK AFTER the `URL_V4_SWITCH` flip, not on flip day.
 * Flip week is a SHAPE change, not a volume change: the default below is the
 * archive URL count Google is already being served today, so on flip day the
 * sitemap swaps the superseded shapes for their v4 replacements at unchanged
 * volume. Then, and only then, the volume ramp begins.
 *
 *   flip day       leave this UNSET      → 15,405 archive URLs (today's volume)
 *   flip + 1 week  set to 35405          → the whole 19,193-URL tree
 *   thereafter     +20000 per week       → no-op; the tree is fully submitted
 *
 * ⭐ NEXT VALUE TO SET: **35405** (= 15405 + 20000). That single step completes
 * the tree, because the tree is smaller than one weekly increment. If GSC looks
 * unhappy after the flip, do not raise it — leave it, or lower it; lowering is
 * safe in the sense that nothing 404s, but see the warning below first.
 *
 * ── WHY THE DEFAULT IS 15,405 AND NOT A ROUND NUMBER ──────────────────────
 * MEASURED, not estimated. `https://subastasactivas.com/sitemap/0.xml` on
 * 2026-08-13 served 16,507 `<loc>`s, of which 15,405 were `/resultados` and
 * 1,102 were not. Holding the archive volume at exactly what Google already has
 * is what makes flip day a pure shape change — the property we actually want to
 * be able to state, rather than a round number that happens to be near it.
 *
 * ── ⚠️ RAISE, DON'T LOWER ─────────────────────────────────────────────────
 * The archive list is in a STABLE order (`compareArchiveUrls`), so raising this
 * only ever APPENDS: nothing already submitted moves or disappears. That is the
 * same "growing cap, never a rotating window" property the concluded band has,
 * and it is the reason an already-indexed page can never churn out of the
 * sitemap. LOWERING it un-advertises pages Google has already been told about —
 * not fatal (they still serve, and they are still reachable by link), but it is
 * a retraction, so do it deliberately.
 *
 * Clamped to >= 1: a 0 or a garbage value must not silently unpublish the whole
 * archive band.
 */
export const SITEMAP_ARCHIVE_MAX_URLS = ((): number => {
  const raw = process.env.SITEMAP_ARCHIVE_MAX_URLS;
  if (raw == null || raw.trim() === '') return 15_405;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 15_405;
  return n;
})();

/**
 * Aggregation children, DERIVED FROM THE URLS THAT ACTUALLY EXIST.
 *
 * ⛔ NEVER PUBLISH AN EMPTY CHILD. That is the D2 defect — `/sitemap/2.xml`
 * served an empty `<urlset>` to Google, a self-inflicted "couldn't fetch / no
 * URLs" signal on the one index we are trying to get Google to trust — and the
 * ACTIVE_CHUNKS block below condemns it at length for the same reason.
 *
 * ⭐ WHICH IS WHY THIS TAKES AN ARGUMENT INSTEAD OF BEING A CONSTANT. Every
 * previous empty child in this file came from a band whose SIZE was set by hand
 * against an estimate while its CONTENT came from a query — ACTIVE_CHUNKS was 2
 * against 1,154 rows, PUBLISHED_CONCLUDED_CHILDREN was 9 against 26,800. Both
 * were fixed by re-measuring, which fixes the instance and leaves the mechanism.
 *
 * Here the count is computed from `aggregationUrls.length` — the very list that
 * fills the children. `ceil(n/20000)` children each hold at least one URL for
 * any n >= 1, so an empty aggregation child is not a thing an operator can cause
 * by turning a knob wrong, including by setting SITEMAP_ARCHIVE_MAX_URLS far
 * past the tree's real size. That is the difference between a guard and a
 * property.
 *
 * The cost is that the sitemap INDEX has to know the list length, so the layout
 * became async — see `sitemap.xml/route.ts`. That is one cached read for a route
 * that already does DB work, and it buys a defect class.
 */
export function aggregationChildCount(aggregationUrlCount: number): number {
  return Math.max(1, Math.ceil(aggregationUrlCount / CHILD_SITEMAP_SIZE));
}

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

/**
 * The published child layout, for a given aggregation-band size.
 *
 * ⭐ BAND ORDER IS FIXED AND THE AGGREGATION BAND IS FIRST. Adding a chunked
 * aggregation band shifts the active and concluded ids again — the third time
 * this has happened — so the same proof ACTIVE_CHUNKS carries is required, and
 * it is the same proof: `classify()` derives a child's content purely from its
 * `(kind, skip)` pair, and every non-empty pair still maps to exactly one
 * published child. Ids move; the union of `<loc>` does not.
 *
 *   band         before (1 aggregation child)   after (2 aggregation children)
 *   aggregation  id 0 → skip 0                  id 0 → skip 0
 *                                               id 1 → skip 20000   ← NEW
 *   active       id 1 → skip 0                  id 2 → skip 0
 *   concluded    id 2 → skip 0                  id 3 → skip 0
 *                id 3 → skip 20000              id 4 → skip 20000
 *
 * No `(kind, skip)` pair is lost and none is duplicated, so the delta is exactly
 * the URLs the new aggregation child adds — nothing is dropped by the renumber.
 */
export interface SitemapLayout {
  readonly aggregationChunks: number;
  readonly totalChildren: number;
  /** Ordered id list for the index AND the child route's range check. */
  ids(): number[];
  /** Absolute child sitemap URLs for the sitemap index. */
  urls(site: string): string[];
  /** id → what it contains + its skip offset. Pure. */
  classify(id: number): ChunkKind;
}

export function buildSitemapLayout(aggregationUrlCount: number): SitemapLayout {
  const aggregationChunks = aggregationChildCount(aggregationUrlCount);
  const totalChildren = aggregationChunks + ACTIVE_CHUNKS + PUBLISHED_CONCLUDED_CHILDREN;
  const ids = () => Array.from({ length: totalChildren }, (_, i) => i);
  return {
    aggregationChunks,
    totalChildren,
    ids,
    urls: (site: string) => ids().map((id) => `${site}/sitemap/${id}.xml`),
    classify: (id: number) => classifyChunkIn(id, aggregationChunks),
  };
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
  | { kind: 'aggregation'; skip: number }
  | { kind: 'active'; skip: number }
  | { kind: 'concluded'; skip: number };

/**
 * Map a child id → what it contains + its skip offset. Pure, no DB. Defensive
 * for out-of-range ids (Next can invoke the route for any id): ids past the
 * active band are treated as concluded with the corresponding offset, so a
 * direct hit on an un-advertised concluded child still returns valid data
 * rather than erroring — it's simply not linked from robots/index.
 *
 * `aggregationChunks` is passed in rather than read from a constant, because
 * the aggregation band's width is derived from its own content — see
 * `aggregationChildCount`. Prefer `buildSitemapLayout(n).classify(id)`.
 */
export function classifyChunkIn(id: number, aggregationChunks: number): ChunkKind {
  const agg = Math.max(1, aggregationChunks);
  if (id <= 0) return { kind: 'aggregation', skip: 0 };
  if (id < agg) return { kind: 'aggregation', skip: id * CHILD_SITEMAP_SIZE };
  const afterAgg = id - agg; // 0-based within the active band
  if (afterAgg < ACTIVE_CHUNKS) {
    return { kind: 'active', skip: afterAgg * CHILD_SITEMAP_SIZE };
  }
  return { kind: 'concluded', skip: (afterAgg - ACTIVE_CHUNKS) * CHILD_SITEMAP_SIZE };
}
