/**
 * Single source of truth for the "properties-first" category priority used by
 * default-sorted feeds (home carousel + /api/auctions default sort).
 *
 * Mirrors the in-route constant introduced on `sa/promote-properties-sort`
 * (commit b58ba53) — pulled out into a shared lib so /api/auctions/recent can
 * reuse it without duplicating the rank table. When `sa/promote-properties-sort`
 * lands, the inline `export const CATEGORY_RANK` in
 * `src/app/api/auctions/route.ts` should be replaced with an import from this
 * module (one source of truth, one tier-tweak edit point).
 *
 * Tiering — keep as a SINGLE source of truth so re-tiering is one-line:
 *   0 = Viviendas (hero)
 *   1 = Other real-estate (Otros inmuebles, Locales, Naves industriales,
 *       Oficinas, Fincas rústicas, Terrenos)
 *   2 = Low-priority real-estate (Garajes, Trasteros)
 *   3 = Everything else (vehicles + arte + any unknown category)
 *
 * Category labels are the exact accented Spanish strings as stored in DB
 * (Auction.category) — see OFFICIAL_CATEGORIES in src/lib/constants.ts.
 */

export const CATEGORY_RANK: Record<string, number> = {
  // Tier 0 — hero
  'Viviendas': 0,
  // Tier 1 — other real-estate
  'Otros inmuebles': 1,
  'Locales': 1,
  'Naves industriales': 1,
  'Oficinas': 1,
  'Fincas rústicas': 1,
  'Terrenos': 1,
  // Tier 2 — low-priority real-estate
  'Garajes': 2,
  'Trasteros': 2,
  // Tier 3 — vehicles + misc (listed explicitly so the CASE / lookup is
  // self-documenting; unknown categories fall through to DEFAULT = 3)
  'Turismos': 3,
  'Motocicletas': 3,
  'Camiones': 3,
  'Barcos': 3,
  'Embarcaciones': 3,
  'Arte y antigüedades': 3,
};

export const CATEGORY_RANK_DEFAULT = 3;

/** Resolve the priority rank for a (possibly unknown) category string. */
export function categoryRankOf(category: string | null | undefined): number {
  if (!category) return CATEGORY_RANK_DEFAULT;
  const r = CATEGORY_RANK[category];
  return typeof r === 'number' ? r : CATEGORY_RANK_DEFAULT;
}

/**
 * Build the SQL `CASE` expression that maps `category` → rank for use in
 * `ORDER BY`. Generated from CATEGORY_RANK so re-tiering only requires editing
 * the constant. Category literals are hardcoded (NOT user input) — but we
 * single-quote-escape defensively in case a future entry contains an
 * apostrophe.
 */
export function buildCategoryRankCaseSql(): string {
  const whenClauses = Object.entries(CATEGORY_RANK)
    .map(([cat, rank]) => `WHEN '${cat.replace(/'/g, "''")}' THEN ${rank}`)
    .join(' ');
  return `(CASE category ${whenClauses} ELSE ${CATEGORY_RANK_DEFAULT} END)`;
}
