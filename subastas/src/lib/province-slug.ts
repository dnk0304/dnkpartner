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
  PROVINCE_DB_KEY_TO_SLUG,
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
 * Hyphen-insensitive province-slug index (Wave89 — town-route slug recovery).
 *
 * Maps the DE-HYPHENATED form of every canonical AND alias province slug to its
 * canonical slug. So `laspalmas` → `las-palmas`, `santacruzdetenerife` →
 * `santa-cruz-de-tenerife`, `acoruna` → `a-coruna`, `illesbalears` → `baleares`
 * (the alias `illes-balears` de-hyphenates to `illesbalears`). Lets a user who
 * dropped the hyphens in a province slug still recover via a 301 instead of a
 * dead 404. Built once at module load; canonical slugs win over alias slugs on
 * key collision (insertion order: canonical first).
 */
const DEHYPHENATED_TO_CANONICAL_SLUG: Map<string, string> = (() => {
  const m = new Map<string, string>();
  // Canonical slugs first (they win any collision).
  for (const slug of Object.keys(PROVINCE_SLUG_TO_DB_KEY)) {
    const bare = slug.replace(/-/g, '');
    if (!m.has(bare)) m.set(bare, slug);
  }
  // Then alias slugs → their canonical target.
  for (const [alias, canonical] of Object.entries(PROVINCE_ALIAS_TO_CANONICAL)) {
    const bare = alias.replace(/-/g, '');
    if (!m.has(bare)) m.set(bare, canonical);
  }
  return m;
})();

/**
 * Resolve any incoming "province"-shaped slug to its CANONICAL province SLUG
 * (e.g. `laspalmas` → `las-palmas`, `vizcaya` → `bizkaia`, `Las Palmas` →
 * `las-palmas`), or null if it can't be resolved to a known province.
 *
 * Resolution order (first match wins):
 *  1. Already a canonical slug → return as-is.
 *  2. Alias slug → canonical slug (legacy spellings: vizcaya, gerona, …).
 *  3. De-hyphenated form of a canonical/alias slug (laspalmas, acoruna, …).
 *  4. Raw-string fallback via the {label,key} resolver → its canonical slug
 *     (handles bare DB labels like "Las Palmas" / "A Coruña").
 *
 * Returns the canonical slug string so the caller can build a redirect target.
 * Distinct from `resolveProvinceSlugToCanonical` (which returns the DB row).
 */
export function resolveProvinceSlugToCanonicalSlug(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const folded = foldToSlug(input);
  if (folded) {
    // 1. Canonical slug.
    if (folded in PROVINCE_SLUG_TO_DB_KEY) return folded;
    // 2. Alias slug.
    const alias = PROVINCE_ALIAS_TO_CANONICAL[folded];
    if (alias) return alias;
    // 3. De-hyphenated form (no-hyphen province slug recovery).
    const bare = folded.replace(/-/g, '');
    const deHyphen = DEHYPHENATED_TO_CANONICAL_SLUG.get(bare);
    if (deHyphen) return deHyphen;
  }
  // 4. Raw-label fallback → canonical slug via DB key.
  const row = toCanonicalProvince(input);
  if (row) {
    const slug = PROVINCE_DB_KEY_TO_SLUG[row.key];
    if (slug) return slug;
  }
  return null;
}

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
