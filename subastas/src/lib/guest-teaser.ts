/**
 * Guest-teaser field policy — the ONE place the anonymous ⇄ registered field
 * boundary for the LIST / collection feeds is expressed.
 *
 * Context (Forge 2026-07-12, guest-teaser-gate): the auction DETAIL endpoint
 * (`/api/auctions/[id]`) already gates logged-out viewers to a teaser (see its
 * header comment + the "NOT contain" PII list). The list/collection feeds
 * (`/api/auctions`, `/api/auctions/recent`, `/api/auctions/carousel-mix`) had
 * drifted OPEN — a leftover "LOGIN DISABLED: show everything unlocked" switch
 * routed GUESTs to the full-access shape, leaking `generalInfo` (VIN / plate /
 * ITV / cargas), `address`, `cadastralRef`, `chargesDetail`,
 * `propertyDescription`, `lotDescription`, exact coords, and BOE source links
 * to anonymous callers. This module re-asserts the SAME boundary the detail
 * teaser uses so list-teaser == detail-teaser.
 *
 * WALLED for guests (require login):
 *   exact address, cadastralRef, chargesDetail (+ derived `warning`),
 *   generalInfo / propertyDescription / lotDescription full text,
 *   the valuation/bid BREAKDOWN (currentBid, minimumBid, claimedAmount,
 *   depositAmount, live currentBidAmount), BOE source links
 *   (boeLink / edictUrl / pdfUrl), court fields (courtName, procedureNumber,
 *   courtReference), the precise map URLs, and EXACT coordinates.
 *
 * KEPT public (teaser — SEO card + enticement):
 *   id, address-led title, category, province, municipality, status,
 *   auctionType, propertyType, imageUrl/hasImage, source, the date fields,
 *   the reference valuations (appraisalValue + valorSubasta — same two the
 *   detail teaser exposes), vehicleMake/Model/Year, surfaceM2 + €/m²,
 *   hasDocuments (boolean), pujaStatus/occupancy badges, and COARSE
 *   (town-level) coordinates so the public card map-pin thumbnail still
 *   renders without revealing the exact parcel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DENNIS-FLIPPABLE KNOBS. Each recommended default is set below; flipping any
 * one is a single-line change here (no route edits needed).
 */

/**
 * Coordinate exposure for the guest teaser.
 *
 *   'coarse'  (DEFAULT) — round lat/lng to COORD_COARSE_DECIMALS places so the
 *                         card map-pin lands in the right town (~1 km) but the
 *                         exact location is not derivable. Preserves the
 *                         property-card map thumbnail (resolveCardImage rung-2
 *                         rebuilds the pin from these client coords).
 *   'hidden'            — null out lat/lng entirely (strict mirror of the
 *                         detail teaser). Property cards then fall back to the
 *                         category-SVG placeholder instead of a map pin.
 *   'exact'             — pass coords through unchanged (pre-fix behaviour).
 *
 * Recommended: 'coarse' — keeps SEO/enticement pins, walls exact location.
 */
export const GUEST_COORD_MODE: 'coarse' | 'hidden' | 'exact' = 'coarse';

/**
 * Decimal places kept when GUEST_COORD_MODE === 'coarse'. 2 dp ≈ 1.1 km grid
 * (town-level). Lower = coarser. Dennis-flippable.
 */
export const COORD_COARSE_DECIMALS = 2;

/**
 * Keep BOTH reference valuations (appraisalValue + valorSubasta) public on the
 * teaser, matching the detail teaser. Judicial rows frequently have
 * Tasación=NULL but valorSubasta>0, so keeping both guarantees the SEO card
 * always shows a price signal. Set false to expose ONLY appraisalValue (a
 * stricter "ONE headline figure" posture) — the card may then show no price on
 * judicial rows. Dennis-flippable.
 */
export const GUEST_KEEP_VALOR_SUBASTA = true;

/**
 * Round a single coordinate for the guest teaser per GUEST_COORD_MODE.
 * Returns null for null/non-finite input in every mode.
 */
export function coarseCoord(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (GUEST_COORD_MODE === 'hidden') return null;
  if (GUEST_COORD_MODE === 'exact') return n;
  const f = 10 ** COORD_COARSE_DECIMALS;
  return Math.round(n * f) / f;
}
