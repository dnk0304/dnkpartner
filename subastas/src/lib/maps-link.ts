/**
 * Shared, plain-TS helper that builds a FREE Google Maps "search" link for an
 * auction. No Google API, no API key, zero cost — it is just a hyperlink of the
 * form `https://www.google.com/maps/search/?api=1&query=<encoded>`.
 *
 * Used by THREE surfaces (must not drift):
 *   - src/components/observatory/AuctionListCard.tsx   (website grid card)
 *   - src/components/observatory/AuctionResultRow.tsx  (website row card)
 *   - src/lib/email-templates.ts                       (alert email, HTML + text)
 *
 * This module is server- AND client-safe: pure string building, no React, no
 * browser globals.
 *
 * Query-value precedence (honest-NULL — never fabricate a location):
 *   1. address present     → `[address, municipality, province].filter(Boolean).join(', ')`
 *   2. lat AND lng finite  → `${latitude},${longitude}`
 *   3. only town/province  → `[municipality, province].filter(Boolean).join(', ')`
 *   4. nothing             → returns null (callers omit the link)
 */

export interface MapsLinkInput {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  municipality?: string | null;
  province?: string | null;
}

const BASE = 'https://www.google.com/maps/search/?api=1&query=';

/**
 * Build the query VALUE (un-encoded) per the locked precedence, or null when
 * there is no usable location. Exposed for testing / reasoning.
 */
export function googleMapsQuery(input: MapsLinkInput): string | null {
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const municipality =
    typeof input.municipality === 'string' ? input.municipality.trim() : '';
  const province = typeof input.province === 'string' ? input.province.trim() : '';

  // 1. Address-first (most precise + human-readable).
  if (address) {
    return [address, municipality, province].filter(Boolean).join(', ');
  }

  // 2. Coordinates — both must be finite numbers.
  const lat = input.latitude;
  const lng = input.longitude;
  if (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  ) {
    return `${lat},${lng}`;
  }

  // 3. Town-level fallback.
  const town = [municipality, province].filter(Boolean).join(', ');
  if (town) {
    return town;
  }

  // 4. Honest-NULL — no location, no link.
  return null;
}

/**
 * Build the full FREE Google Maps search URL, or null when there is no usable
 * location. Callers render the link only when this is non-null.
 */
export function googleMapsSearchUrl(input: MapsLinkInput): string | null {
  const q = googleMapsQuery(input);
  if (q === null) {
    return null;
  }
  return `${BASE}${encodeURIComponent(q)}`;
}
