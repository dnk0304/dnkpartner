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
 * Strategy: the trailing token after the last `-` is the auction.id (cuid).
 * cuids contain only [a-z0-9] so this is unambiguous as long as the id has no
 * dashes — Prisma's cuid() guarantees that.
 *
 * Returns null on malformed slugs (no trailing id token).
 */
export function resolveAuctionIdFromSlug(slug: string): string | null {
  if (!slug) return null;
  const lastDash = slug.lastIndexOf('-');
  if (lastDash < 0) {
    // Slug with no dashes — treat the whole thing as a candidate id.
    return /^[a-z0-9]+$/i.test(slug) ? slug : null;
  }
  const tail = slug.substring(lastDash + 1);
  return /^[a-z0-9]+$/i.test(tail) && tail.length >= 6 ? tail : null;
}
