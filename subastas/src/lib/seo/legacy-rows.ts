/**
 * legacy-rows — single source of truth for the "legacy junk auction" predicate.
 *
 * Background (Ken brief, 2026-06-02 — DISPATCH-BRIEF-noindex-retire-legacy.md):
 * A January first-gen import produced ~13.5k auction rows whose stored BOE
 * link is built from an internal `0x…hex` code, not a real `SUB-` id. The link
 * is therefore dead. All such rows are in finished states
 * (CONCLUIDA_PORTAL / CANCELADA / SUSPENDIDA), already excluded from the
 * sitemap, and already `noindex` on the detail page. To make Google fully drop
 * them we serve **HTTP 410 Gone** on the detail URL instead of 200 + noindex.
 *
 * Predicate (mirrors scraper-side `legacy_rows.py` — keep in sync):
 *   boeId  ~ '^0x'                  OR
 *   id     ~ '^c[a-z0-9]{24}$'      (25-char cuid)
 *
 * URL-only shortcut: the auction id is the trailing token of the detail slug
 * (`{tipo}-{provincia}-{municipio}-{id}`). When the trailing id matches the
 * cuid shape we can declare the row legacy WITHOUT a DB hit — middleware uses
 * this to issue 410 at the edge. Rows where boeId starts with `0x` but id is a
 * UUID still need a DB lookup; the page-side check handles those by calling
 * notFound() (404) — both 410 and 404 satisfy Ken's "make Google drop it".
 *
 * Keep this regex aligned with scraper/database/legacy_rows.py — same source.
 */

/** cuid v1 shape — `c` + 24 lowercase alnum chars (25 total). */
export const LEGACY_CUID_RE = /^c[a-z0-9]{24}$/;

/** Internal-code BOE id shape — `0x` + hex. */
export const LEGACY_BOE_ID_RE = /^0x/i;

/**
 * Decide if an auction id is the cuid shape used by the January junk import.
 * Fast, URL-only — safe to use in middleware (edge runtime, no DB).
 */
export function isLegacyCuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return LEGACY_CUID_RE.test(id);
}

/**
 * Decide if an auction row is "legacy junk" by DB shape.
 * Use this server-side once the row has been loaded.
 */
export function isLegacyRow(row: { id: string; boeId?: string | null }): boolean {
  if (LEGACY_CUID_RE.test(row.id)) return true;
  if (row.boeId && LEGACY_BOE_ID_RE.test(row.boeId)) return true;
  return false;
}
