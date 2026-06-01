/**
 * boe-link — single source of truth for per-auction BOE Portal URLs.
 *
 * Why this exists (Ken-confirmed 2026-06-01 against live PG):
 *   - The active pool has 1,699 rows; only 630 carry a non-null `boeLink`.
 *   - Every surface that emits `auction.boeLink` previously passed the stored
 *     value through verbatim, so 63% of cards rendered the homepage fallback
 *     `?? "https://subastas.boe.es"` — exactly the "BOE link goes to the
 *     homepage" bug Dennis reported.
 *   - Every row HAS a `boeId`, and the BOE per-auction URL is deterministic:
 *       https://subastas.boe.es/detalleSubasta.php?idSub=<boeId>
 *     This matches the format already stored in the 630 populated rows AND
 *     the URL the scraper constructs in scraper/scheduler.py + scraper logs.
 *
 * Construct, don't backfill: the DB column stays as-is (Ghost owns writes);
 * the API projection layer derives the link from boeId at read time. Every
 * projection that emits `boeLink` to the client MUST funnel through here so
 * a client never receives null when a boeId exists.
 */

const BOE_DETAIL_BASE = "https://subastas.boe.es/detalleSubasta.php";

/**
 * Resolve the BOE link a client should follow for this auction.
 *
 * Order of preference:
 *   1. The stored `boeLink` if present (already canonical per Ken's check).
 *   2. A deterministic `?idSub=<boeId>` URL constructed from `boeId`.
 *   3. null — only when there is genuinely nothing to link to.
 *
 * boeId is URL-encoded defensively even though every known boeId is
 * alphanumeric + hyphens (e.g. `SUB-AT-2026-22R4786001051`).
 */
export function boeLinkFor(
  boeId: string | null | undefined,
  stored: string | null | undefined,
): string | null {
  const trimmedStored = typeof stored === "string" ? stored.trim() : "";
  if (trimmedStored) return trimmedStored;
  const trimmedBoeId = typeof boeId === "string" ? boeId.trim() : "";
  if (!trimmedBoeId) return null;
  return `${BOE_DETAIL_BASE}?idSub=${encodeURIComponent(trimmedBoeId)}`;
}
