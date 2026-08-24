/**
 * AUCTION URL RESOLVER — the ONE place that decides what a detail page's URL is.
 *
 * ## Why this module exists
 *
 * Before it, three call sites independently re-derived the detail URL by
 * calling `buildAuctionSlug`:
 *
 *   1. the page canonical + OpenGraph  (`app/subastas/subasta/[slug]/page.tsx`)
 *   2. the JSON-LD `pageUrl`           (`lib/seo/json-ld.ts` — `@id`, `url`,
 *                                       breadcrumb item, place, offer)
 *   3. the sitemap                     (`lib/seo/sitemap-entries.ts`, both the
 *                                       active and the concluded band)
 *
 * Ken's ruling was: *"Canonical and URL must agree on the same render. A page
 * whose canonical disagrees with the URL it was reached by is worse than either
 * choice alone. Check them together, not separately."*
 *
 * Three independent derivations cannot be *checked* into agreement — a switch
 * that lands on two of the three is a page that contradicts itself, and the
 * test that would have caught it is a test someone has to remember to write.
 * So instead of checking, this module removes the possibility: all three read
 * from here, and the switch moves all three or none of them.
 *
 * ## The rule
 *
 *   switch OFF  →  legacy `/subastas/subasta/{buildAuctionSlug(row)}`
 *   no v3 row   →  legacy `/subastas/subasta/{buildAuctionSlug(row)}`
 *   otherwise   →  the minted `auction_url_v3.url`
 *
 * ## ⭐ Absence of a row IS the "don't touch this one" signal
 *
 * There is no exception list and no flag column, because there does not need to
 * be one. 48,303 of the 240,892 rows have no `auction_url_v3` row at all:
 *
 *   | class                        | rows   | why it has no v3 url                |
 *   |------------------------------|--------|-------------------------------------|
 *   | hex legacy                   | 12,346 | deliberately never minted           |
 *   | held (identifying-detail loss)|  1,713 | withheld until the `address` fix    |
 *   | degraded → province page     | 13,964 | town could not be resolved honestly |
 *   | quarantined                  | 20,279 | never votes, never mints            |
 *
 * Each of them keeps its old URL and serves 200, because there is nothing to
 * redirect it to. That makes Ken's *"every old URL must resolve, never a 404"*
 * invariant true **by construction** instead of by a predicate that a future
 * edit could get wrong — and it is also why releasing the 1,713 held rows later
 * needs **no second switchover**: minting their rows is the entire change,
 * since this resolver reads the table live on every render.
 *
 * ## Query cost
 *
 * Every read below is guarded on the switch AT THE CALL SITE, not filtered
 * after the fact. With the switch off the app issues zero extra queries, so the
 * dark deploy cannot show up as load.
 *
 * Reads go through raw SQL (`@/lib/db`) rather than Prisma on purpose:
 * `auction_url_v3` is deliberately absent from `prisma/schema.prisma`. Deploys
 * run `prisma migrate deploy` (see the Dockerfile CMD), which never touches an
 * unmanaged table, so the 192,589 live rows are safe where they are. Adding a
 * Prisma model would mean shipping a migration that tries to CREATE a table
 * that already exists and is full.
 */

import { query, queryOne } from '@/lib/db';
import { buildAuctionSlug, type AuctionForSlug } from '@/lib/seo/auction-slug';
import { isUrlV3SwitchOn } from '@/lib/seo/url-v3-switch';

/** The legacy detail path. Unchanged, and still the default answer. */
export function legacyAuctionPath(row: AuctionForSlug): string {
  return `/subastas/subasta/${buildAuctionSlug(row)}`;
}

/**
 * The path this auction should be served at, given whatever v3 url we found.
 *
 * Pure and synchronous — the DB read is a separate step so a caller that has
 * already batched its lookups (the sitemap) does not pay for a second one, and
 * so this decision is unit-testable without a database.
 */
export function resolveAuctionPath(
  row: AuctionForSlug,
  v3Url: string | null | undefined,
): string {
  if (!isUrlV3SwitchOn()) return legacyAuctionPath(row);
  if (!v3Url) return legacyAuctionPath(row);
  return v3Url;
}

/**
 * The minted v3 url for one auction, or null.
 *
 * Keyed on `auction_url_v3_pkey` (PRIMARY KEY on `auction_id`), so this is a
 * single index probe on the render path.
 *
 * Returns null immediately when the switch is off — the point is that the dark
 * deploy adds no query load at all, not that it adds a little.
 */
export async function fetchV3Url(auctionId: string): Promise<string | null> {
  if (!isUrlV3SwitchOn()) return null;
  const row = await queryOne<{ url: string }>(
    'SELECT url FROM auction_url_v3 WHERE auction_id = ?',
    [auctionId],
  );
  return row?.url ?? null;
}

/**
 * v3 urls for many auctions in ONE query.
 *
 * The sitemap walks 20,000 rows per chunk; a per-row lookup there would be a
 * textbook N+1 against a 192,589-row table. `= ANY(...)` keeps it to a single
 * round trip per chunk and still uses the primary key.
 *
 * Missing ids are simply absent from the map — the caller falls back to the
 * legacy path for them, which is the correct answer for a held / degraded /
 * quarantined / hex-legacy row.
 */
export async function fetchV3UrlsBatch(
  auctionIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isUrlV3SwitchOn()) return out;
  if (auctionIds.length === 0) return out;
  const rows = await query<{ auction_id: string; url: string }>(
    'SELECT auction_id, url FROM auction_url_v3 WHERE auction_id = ANY(?)',
    [[...auctionIds]],
  );
  for (const r of rows) out.set(r.auction_id, r.url);
  return out;
}

/**
 * Reverse lookup: which auction does this v3 path belong to?
 *
 * Keyed on `auction_url_v3_url_key` (UNIQUE on `url`), so the v3 route resolves
 * a request with one index probe and **no path parsing at all** — the minted
 * string is matched whole. Parsing the descriptor back into parts would be a
 * second, drifting definition of the URL grammar; there is exactly one place
 * that grammar is written down (`buildAuctionPathV3`) and it is the writer.
 *
 * ⚠️ NOT switch-guarded, on purpose. The v3 route must be able to serve while
 * the switch is off — that is what makes the dark code verifiable in a browser
 * before anyone flips anything (Ken: "new routes may exist and serve").
 */
export async function fetchAuctionIdByV3Url(url: string): Promise<string | null> {
  const row = await queryOne<{ auction_id: string }>(
    'SELECT auction_id FROM auction_url_v3 WHERE url = ?',
    [url],
  );
  return row?.auction_id ?? null;
}

/**
 * MISS-PATH ALIAS RESOLVE: given an OLD url that no longer matches any current
 * `auction_url_v3.url`, return the auction's CURRENT url to 301 to — or null.
 *
 * One indexed join: `auction_url_v3_alias.old_url` (PK) -> `auction_url_v3`
 * (PK on auction_id). Runs ONLY when `fetchAuctionIdByV3Url` already missed, so
 * the happy path (url still current) never pays for it.
 *
 * ⚠️ NOT switch-guarded, matching `fetchAuctionIdByV3Url`: the alias must be
 * resolvable while the switch is off so the redirect is verifiable in a browser
 * before anything is flipped. Returns the current url (never the old one) so a
 * caller cannot accidentally build a redirect loop.
 */
export async function resolveV3Alias(oldUrl: string): Promise<string | null> {
  const row = await queryOne<{ url: string }>(
    `SELECT v.url AS url
       FROM auction_url_v3_alias a
       JOIN auction_url_v3 v ON v.auction_id = a.auction_id
      WHERE a.old_url = ?`,
    [oldUrl],
  );
  // Guard against a degenerate self-alias (old == current): never redirect a
  // url to itself.
  if (!row || row.url === oldUrl) return null;
  return row.url;
}
