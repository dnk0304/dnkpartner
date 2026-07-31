/**
 * src/lib/official-url.ts — the SINGLE source of truth for an auction's
 * OFFICIAL-AUCTION URL (the outbound "go place your bid" link: BOE
 * `detalleSubasta.php`, or the PLABI / SEGSOCIAL portal URL).
 *
 * Why this file exists (wave169, participate-gate):
 *   This resolution logic used to live INLINE in three render surfaces
 *   (DetailStatusPanel primary CTA, the mobile bottom-bar, the "Fuente
 *   oficial" block). Each copy could drift. It is now extracted here and
 *   consumed by exactly ONE place: the server-side redirect route
 *   `GET /api/participar/[id]`.
 *
 * CRITICAL DESIGN INVARIANT (do not break):
 *   The official-auction URL is resolved ENTIRELY server-side and only ever
 *   leaves the server inside the 302 `Location` header of /api/participar/[id].
 *   It must NEVER be projected into any card/detail client payload, RSC
 *   hydration stream, or crawlable `<a href>`. Keeping the resolver in a
 *   server-only lib (no "use client") and calling it only from the API route
 *   is what upholds that invariant. If you find yourself importing this into a
 *   client component or a card projection, STOP — that reintroduces the leak
 *   this whole feature exists to close.
 *
 * This is the "official-auction ACTION" URL only. Document PDFs (edicto /
 * anuncio / nota simple — `verDocumento.php`) are auction INFORMATION and are
 * NOT resolved here; they stay public in the Documentos section.
 */

export type OfficialUrlRow = {
  /** Free-string source label: "BOE" | "TEJU" | "PLABI" | "SEGSOCIAL" | ... */
  source?: string | null;
  /**
   * The BOE per-auction link. Callers SHOULD pass the value already resolved
   * through `boeLinkFor(boeId, boeLink)` (lib/boe-link.ts) so a row that only
   * carries a `boeId` still yields the deterministic detalleSubasta URL.
   */
  boeLink?: string | null;
  /** Upstream portal URL for non-BOE sources (PLABI / SEGSOCIAL scraped URL). */
  originalSource?: string | null;
};

/**
 * Resolve the official-auction URL for a row.
 *
 * Semantics are byte-for-byte the pre-existing inline logic:
 *   - BOE family (source ∈ {BOE, TEJU, ''})  → boeLink, else the BOE homepage
 *     fallback `https://subastas.boe.es` (BOE family NEVER returns null — the
 *     portal homepage is always a valid last resort).
 *   - Otherwise (PLABI / SEGSOCIAL / …)      → originalSource ?? boeLink ?? null
 *     (may be null when a non-BOE row has no upstream URL → route 404s).
 */
export function officialAuctionUrl(row: OfficialUrlRow): string | null {
  const upper = (row.source ?? '').trim().toUpperCase();
  const isBoeFamily = upper === 'BOE' || upper === 'TEJU' || upper === '';
  if (isBoeFamily) {
    return row.boeLink ?? 'https://subastas.boe.es';
  }
  return row.originalSource ?? row.boeLink ?? null;
}
