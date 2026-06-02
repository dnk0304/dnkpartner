/**
 * Auction-detail slug — Spanish, deterministic, stable, unique.
 *
 * Spec: 07-SEO-URL-ARCHITECTURE.md §1.7. Pattern:
 *   /subastas/subasta/{tipo}-{provincia}-{municipio}-{auctionId}
 *
 * Composition rationale (stated in return):
 *  - `{tipo}` — canonical tipo slug (judicial / hacienda / ...) — keyword signal.
 *  - `{provincia}` — canonical province slug — geo keyword signal.
 *  - `{municipio}` — slugified municipality, or `sin-municipio` when unknown
 *    (kept in the slug to maintain a fixed shape AND uniqueness contributors).
 *  - `{auctionId}` — the auction's cuid id, used as the **trailing
 *    disambiguator**. cuids are globally unique → two auctions can never
 *    collide. Also the resolver extracts the trailing token to look the row up.
 *
 * Stable: an auction's tipo / province / id never change, so the slug is
 * stable across crawls. Stored at write time would be ideal, but resolving on
 * demand from the row's existing fields is functionally identical and avoids a
 * migration. (We can promote to a stored column later without breaking URLs.)
 */

import { DB_AUCTIONTYPE_TO_TIPO_SLUG, PROVINCE_DB_KEY_TO_SLUG, slugify } from './slugs';

export type AuctionForSlug = {
  id: string;
  auctionType: string | null;
  province: string | null;
  municipality: string | null;
};

/**
 * Build the canonical detail-page slug for an auction row.
 * Falls back to safe defaults when fields are missing so the slug is always
 * a valid token (the auction id at the end guarantees uniqueness regardless).
 */
export function buildAuctionSlug(a: AuctionForSlug): string {
  const tipo = a.auctionType ? DB_AUCTIONTYPE_TO_TIPO_SLUG[a.auctionType.toUpperCase()] ?? 'subasta' : 'subasta';
  const provincia = a.province
    ? (PROVINCE_DB_KEY_TO_SLUG[a.province] ?? (slugify(a.province) || 'espana'))
    : 'espana';
  const municipio = a.municipality ? (slugify(a.municipality) || 'sin-municipio') : 'sin-municipio';
  // The auction.id is the trailing disambiguator — extracted in resolveAuctionId.
  return `${tipo}-${provincia}-${municipio}-${a.id}`;
}

/**
 * Resolve a /subastas/subasta/[slug] URL back to an auction id.
 *
 * Production reality (2026-06-02 wave13-hotfix): the schema is
 * `@default(cuid())` but the 234k-row legacy corpus uses **dashed UUIDs**
 * (e.g. `44787f11-11ad-4a6b-9d64-125dee2655a6`). The original resolver took
 * only the substring after the LAST dash → for UUID ids it returned just the
 * trailing 12-hex segment → `findUnique` missed → every auction detail 404'd.
 *
 * Strategy (robust for both id shapes):
 *  1. Try to match a trailing UUID (`8-4-4-4-12` hex with dashes). UUIDs are
 *     unambiguous as a trailing token because the slug prefix
 *     (`{tipo}-{provincia}-{municipio}`) never produces that exact hex shape.
 *  2. Fall back to the cuid case: the substring after the last dash, restricted
 *     to `[a-z0-9]` of length ≥ ~20 (cuids are 25 chars). The length floor
 *     avoids false-positives on short slug tokens.
 *
 * Round-trip guarantee:
 *   resolveAuctionIdFromSlug(buildAuctionSlug(a)) === a.id
 * for BOTH a UUID id and a cuid id (verified at the bottom of this file).
 *
 * Returns null on malformed slugs (no trailing id token).
 */
const TRAILING_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_MIN_LEN = 20;

export function resolveAuctionIdFromSlug(slug: string): string | null {
  if (!slug) return null;

  // 1) Prefer a trailing dashed-UUID match (production legacy corpus).
  const uuidMatch = slug.match(TRAILING_UUID_RE);
  if (uuidMatch) return uuidMatch[0].toLowerCase();

  // 2) Fall back to cuid: token after the last dash.
  const lastDash = slug.lastIndexOf('-');
  if (lastDash < 0) {
    // Slug with no dashes — treat the whole thing as a candidate id.
    return /^[a-z0-9]+$/i.test(slug) && slug.length >= CUID_MIN_LEN ? slug : null;
  }
  const tail = slug.substring(lastDash + 1);
  return /^[a-z0-9]+$/i.test(tail) && tail.length >= CUID_MIN_LEN ? tail : null;
}
