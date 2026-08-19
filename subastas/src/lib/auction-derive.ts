/**
 * src/lib/auction-derive.ts — shared read-time derivations for the card payload.
 *
 * Forge (2026-06-19, property-card-redesign). The €/m² figure is DERIVED at
 * read time, NOT stored — Ghost's recommendation, so it can never go stale
 * relative to valorSubasta / appraisalValue / surfaceM2 edits. One helper,
 * imported by every card-feeding route (`/api/auctions`, `/api/auctions/recent`,
 * `/api/auctions/carousel-mix`) so the rule lives in exactly one place.
 */

/**
 * Coerce a possibly-stringy numeric DB value (pg returns NUMERIC as a string,
 * Float/Int as a number) into a finite JS number, else null. Mirrors the
 * defensive coercion the price helpers already use.
 */
export function coerceFiniteNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive €/m² for a card.
 *
 * Rule (Ken-locked, 2026-06-19):
 *   - surfaceM2 must be a finite number > 0 (guards div-by-zero / null / NaN)
 *     AND within the dwelling plausibility band (guards surface-parse garbage).
 *   - numerator = valorSubasta if present and > 0, ELSE appraisalValue if
 *     present and > 0, ELSE null. (currentBid/minimumBid are NEVER used.)
 *   - result = round(numerator / surfaceM2) — whole euros/m².
 *   - Honest-NULL: null when surfaceM2 invalid/implausible OR numerator null.
 *     The card omits the €/m² pill entirely on null — never renders 0, never "—".
 */

/**
 * Plausibility band for a DWELLING surface (m²). Outside this, a surfaceM2 is a
 * parse error, not a home — a "90" truncated to "9", or a land/annex area grabbed
 * from the wrong sentence. €/m² MUST NOT be computed on an implausible area: a
 * bad "9 m²" once rendered "9 m² · 7.587 €/m²" on a card. The m² itself may still
 * DISPLAY (that is the data-side quarantine's call — Ghost); this guard only
 * suppresses the DERIVED €/m². Ken-locked, m²-plausibility dispatch 2026-08-19.
 *
 * Single source of truth: the benchmark pool derives every €/m² through this
 * same helper (toBenchmarkSample → derivePricePerM2), so the pool inherits the
 * band automatically — no second threshold definition.
 */
export const PLAUSIBILITY_MIN_SURFACE_M2 = 10;
export const PLAUSIBILITY_MAX_SURFACE_M2 = 10_000;

export function derivePricePerM2(
  valorSubasta: number | null | undefined,
  appraisalValue: number | null | undefined,
  surfaceM2: number | null | undefined,
): number | null {
  const surface = coerceFiniteNumber(surfaceM2);
  if (surface == null || surface <= 0) return null;
  // Plausibility band: an implausible area (parse error) must not produce a €/m².
  if (surface < PLAUSIBILITY_MIN_SURFACE_M2 || surface > PLAUSIBILITY_MAX_SURFACE_M2) return null;

  const valor = coerceFiniteNumber(valorSubasta);
  const appraisal = coerceFiniteNumber(appraisalValue);
  const numerator =
    valor != null && valor > 0
      ? valor
      : appraisal != null && appraisal > 0
        ? appraisal
        : null;
  if (numerator == null) return null;

  return Math.round(numerator / surface);
}
