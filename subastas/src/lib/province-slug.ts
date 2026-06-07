/**
 * province-slug.ts — single resolver from any incoming "province"-shaped string
 * (canonical SEO slug, alias slug, raw DB label) to the canonical
 * `{label, key}` row in `spain-provinces.ts`.
 *
 * Why this exists (Wave79, 2026-06-07):
 * The multi-select ProvinceTownTree emits `PROVINCE_DB_KEY_TO_SLUG[key]` slugs
 * (so "A Coruña" → "a-coruna", "Illes Balears" → "baleares", "Álava" →
 * "araba-alava", "Gipuzkoa" → "gipuzkoa", etc.) into the
 * `?provincias=a-coruna,baleares` query param.
 *
 * The counts + listing routes used to resolve those slugs by calling
 * `toCanonicalProvince(slug)` which does only `normalize(s)` — lowercase +
 * accent strip. That folds `"A Coruña"` → `"a coruna"` (with a SPACE), but
 * the incoming slug is `"a-coruna"` (with a HYPHEN), so the alias map lookup
 * missed and the predicate fell through to a SQL row-by-row compare that
 * also missed (DB label `"Illes Balears"` folds to `"illes balears"` ≠
 * `"baleares"`). Result: `?provincias=a-coruna` and `?provincias=baleares`
 * returned 0 rows even though the count sidebar correctly showed 2783 etc.
 *
 * Fix: resolve via the SEO slug grammar FIRST (the same `PROVINCE_SLUG_TO_DB_KEY`
 * + `PROVINCE_ALIAS_TO_CANONICAL` maps the SEO router and the chip emitter
 * both consume), then fall back to the raw-label resolver for backward
 * compatibility (single `?province=Madrid` still works without a re-slugify).
 *
 * One source of truth for province slugs: `seo/slugs.ts` (52 canonical slugs
 * + ~10 alias slugs). One source of truth for DB labels: `spain-provinces.ts`
 * (52 canonical {label,key} rows). This helper is the bridge.
 */

import {
  PROVINCE_SLUG_TO_DB_KEY,
  PROVINCE_ALIAS_TO_CANONICAL,
  slugify,
} from './seo/slugs';
import {
  SPAIN_PROVINCES,
  toCanonicalProvince,
  type CanonicalProvince,
} from './spain-provinces';

// DB key → canonical row lookup (built once at module load).
const DB_KEY_TO_ROW: Map<string, CanonicalProvince> = (() => {
  const m = new Map<string, CanonicalProvince>();
  for (const p of SPAIN_PROVINCES) m.set(p.key, p);
  return m;
})();

/**
 * Normalize an incoming slug-like token: trim, lowercase, accent-fold,
 * ñ → n, replace every non-alphanum run with a single hyphen, trim
 * leading/trailing hyphens. Idempotent on already-canonical slugs.
 *
 * Accepts whatever shape the URL had:
 *   "A Coruña"     → "a-coruna"
 *   "a coruna"     → "a-coruna"
 *   "a-coruna"     → "a-coruna"
 *   "A-Coruña"     → "a-coruna"
 *   "  A_CORUÑA "  → "a-coruna"
 *
 * This is intentionally the same algorithm as `seo/slugs#slugify`, exposed
 * so callers can normalize without importing both modules.
 */
export function foldToSlug(input: string | null | undefined): string {
  if (!input) return '';
  return slugify(input);
}

/**
 * Resolve any incoming "province"-shaped string to its canonical
 * `{label, key}` row in `spain-provinces.ts`, or null if it can't be
 * resolved.
 *
 * Resolution order (first match wins):
 *  1. Folded slug → canonical slug map (52 provinces).
 *  2. Folded slug → alias map → canonical slug → canonical row
 *     (handles legacy URL spellings: la-coruna, alava, vizcaya, etc.).
 *  3. Raw-string fallback via `toCanonicalProvince` so a bare DB label
 *     ("Madrid", "Illes Balears") or a normalize-only fold ("a coruna")
 *     still resolves — keeps the single-?province=Madrid path
 *     unchanged.
 *
 * Returns null for off-taxonomy junk ("CP 28013", "Unknown", "").
 */
export function resolveProvinceSlugToCanonical(
  input: string | null | undefined,
): CanonicalProvince | null {
  if (!input) return null;

  // 1. Folded slug → canonical DB key (52 provinces).
  const folded = foldToSlug(input);
  if (folded) {
    const dbKey = PROVINCE_SLUG_TO_DB_KEY[folded];
    if (dbKey) {
      const row = DB_KEY_TO_ROW.get(dbKey);
      if (row) return row;
    }

    // 2. Alias slug → canonical slug → DB key.
    const aliasTarget = PROVINCE_ALIAS_TO_CANONICAL[folded];
    if (aliasTarget) {
      const dbKey2 = PROVINCE_SLUG_TO_DB_KEY[aliasTarget];
      if (dbKey2) {
        const row = DB_KEY_TO_ROW.get(dbKey2);
        if (row) return row;
      }
    }
  }

  // 3. Raw-string fallback (handles bare DB labels + normalize-only folds).
  return toCanonicalProvince(input);
}
