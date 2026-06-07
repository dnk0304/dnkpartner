/**
 * alert-prefill — derive a sensible "Crear alerta" pre-fill payload from an
 * Auction row. The detail page passes this to the AlertsModal so the popup
 * lands with the auction's province / municipality / type / price-band
 * already populated.
 *
 * Shape is intentionally close to the modal's existing `initial*` props so
 * the modal seeds its form state without further translation.
 */

type AuctionLike = {
  province?: string | null;
  municipality?: string | null;
  propertyType?: string | null;
  auctionType?: string | null;
  category?: string | null;
  source?: string | null;
  appraisalValue?: number | null;
  valorSubasta?: number | null;
};

export type AlertPrefill = {
  initialProvince?: string;
  initialMunicipality?: string;
  /** Best-effort category — propertyType > category. */
  initialCategory?: string;
  /** Scraper source token (BOE / SEGSOCIAL / TEJU). */
  initialSource?: string;
  /** Lowercase auctionType slug (judicial / notarial / aeat / …). */
  initialAuctionType?: string;
  /** Floor of the suggested price band (€). Never negative. */
  initialMinPrice?: number;
  /** Ceiling of the suggested price band (€). */
  initialMaxPrice?: number;
};

/**
 * Derive a +/- 30% price band around the auction's reference value.
 * Returns null when no positive reference value exists (honest-NULL —
 * don't fabricate a "0 – 0" band).
 */
function deriveBand(
  reference: number | null | undefined,
): { min: number; max: number } | null {
  if (reference == null) return null;
  const n = Number(reference);
  if (!Number.isFinite(n) || n <= 0) return null;
  const min = Math.max(0, Math.round(n * 0.7));
  const max = Math.round(n * 1.3);
  return { min, max };
}

export function buildAlertPrefill(auction: AuctionLike): AlertPrefill {
  const out: AlertPrefill = {};

  if (auction.province && auction.province.trim()) {
    out.initialProvince = auction.province.trim();
  }
  if (auction.municipality && auction.municipality.trim()) {
    out.initialMunicipality = auction.municipality.trim();
  }

  // Prefer the BOE bien-heading propertyType; fall back to category.
  const cat = (auction.propertyType ?? auction.category ?? "").trim();
  if (cat) out.initialCategory = cat;

  if (auction.source && auction.source.trim()) {
    out.initialSource = auction.source.trim();
  }
  if (auction.auctionType && auction.auctionType.trim()) {
    out.initialAuctionType = auction.auctionType.trim().toLowerCase();
  }

  // Price band — appraisalValue first (it's the more-populated column), then
  // valorSubasta. Skip cleanly when neither is positive.
  const band =
    deriveBand(auction.appraisalValue) ?? deriveBand(auction.valorSubasta);
  if (band) {
    out.initialMinPrice = band.min;
    out.initialMaxPrice = band.max;
  }

  return out;
}
