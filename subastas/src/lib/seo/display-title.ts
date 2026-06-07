/**
 * display-title — read-time derivation of an auction's human display title.
 *
 * Why this exists (wave-A overhaul, 2026-06-07):
 *   The scraped `Auction.title` is the BOE listing's reference/category code
 *   (e.g. "SUB-NE-2025-12345" / "Inmueble") — fine for our internal id, ugly
 *   as an H1. Competitors (alertasubastas, ibancar) lead with the real STREET
 *   address: "Subasta de Inmueble en calle Tollo, 19, Ontur". Dennis wants
 *   the same — and now that wave-A makes the detail page fully public, the
 *   address is safe to surface in the H1 and the <title> tag.
 *
 *   Read-time derivation = ZERO migration. Every existing row uses its
 *   `address` if present, falls back gracefully when it isn't.
 *
 * Inputs are intentionally permissive (null-safe everywhere): the same helper
 * is consumed by `generateMetadata` (server) and the SSR teaser (server)
 * against partial selects.
 *
 * Fallback ladder:
 *   1. address present              → "Subasta de {tipo} en {address}"
 *   2. address missing, municipality present
 *                                   → "Subasta de {tipo} en {municipality}, {province}"
 *                                   (vehicle/land case — no street, but town is known)
 *   3. nothing useful               → original title (the reference code)
 *
 * NEVER returns "Unknown" / "Untitled" / blank. The last-resort code is ugly
 * but stable and indexable.
 *
 * `tipo` resolution: propertyType (BOE bien-heading) → auctionType (vehicle /
 * inmueble enum) → category (legacy). Lowercased + capitalised once for
 * readability ("inmueble" not "INMUEBLE", "Vivienda" not "vivienda").
 */

export interface DisplayTitleInput {
  address?: string | null;
  propertyType?: string | null;
  auctionType?: string | null;
  category?: string | null;
  municipality?: string | null;
  province?: string | null;
  /** The raw scraped title (reference/category code). Used only as last resort. */
  title?: string | null;
}

const titleCase = (raw: string): string => {
  const t = raw.trim().toLowerCase();
  if (!t) return raw;
  // Capitalise first letter of each whitespace-separated token; leave the rest
  // lowercase so "INMUEBLE" → "Inmueble", "calle TOLLO" → "Calle Tollo".
  return t.replace(/(^|\s)(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
};

const cleanString = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

/**
 * Resolve the "tipo" token shown after "Subasta de ". Order of preference:
 *   propertyType (specific bien type from BOE) → auctionType (enum) → category.
 * Falls back to "Inmueble" — the safest generic that mirrors the competitor
 * phrasing and never appears as "Subasta de  en …".
 */
export function resolveTipo(input: DisplayTitleInput): string {
  const propertyType = cleanString(input.propertyType);
  if (propertyType) return titleCase(propertyType);
  const auctionType = cleanString(input.auctionType);
  if (auctionType) return titleCase(auctionType);
  const category = cleanString(input.category);
  if (category) return titleCase(category);
  return 'Inmueble';
}

/**
 * Build the address-led display title.
 *
 * @example
 *   auctionDisplayTitle({ address: 'Calle Tollo, 19', propertyType: 'inmueble',
 *                        municipality: 'Ontur', province: 'Albacete' })
 *   // → "Subasta de Inmueble en Calle Tollo, 19, Ontur"
 *
 *   auctionDisplayTitle({ propertyType: 'vehículo',
 *                        municipality: 'Madrid', province: 'Madrid', title: 'SUB-…' })
 *   // → "Subasta de Vehículo en Madrid, Madrid"
 *
 *   auctionDisplayTitle({ title: 'SUB-NE-2025-12345' })
 *   // → "SUB-NE-2025-12345"  (last resort, never blank)
 */
export function auctionDisplayTitle(input: DisplayTitleInput): string {
  const tipo = resolveTipo(input);
  const address = cleanString(input.address);
  const municipality = cleanString(input.municipality);
  const province = cleanString(input.province);

  // 1. Street address present — competitor-style phrasing.
  if (address) {
    // Append municipality after the address when it isn't already in it
    // (BOE addresses commonly omit the town: "Calle Tollo, 19" — the town
    // belongs at the end so the H1 reads cleanly). Avoid dup when the address
    // already ends with the municipality token.
    const lowerAddr = address.toLowerCase();
    const muniSuffix =
      municipality && !lowerAddr.includes(municipality.toLowerCase())
        ? `, ${titleCase(municipality)}`
        : '';
    return `Subasta de ${tipo} en ${titleCase(address)}${muniSuffix}`;
  }

  // 2. No street, but town/province known (vehicle, land, BOE without bien).
  if (municipality) {
    const provSuffix = province ? `, ${titleCase(province)}` : '';
    return `Subasta de ${tipo} en ${titleCase(municipality)}${provSuffix}`;
  }
  if (province) {
    return `Subasta de ${tipo} en ${titleCase(province)}`;
  }

  // 3. Last resort — original scraped title (a reference code is ugly but
  //    stable). Never return empty string; if even title is missing, surface
  //    a generic "Subasta" so the H1 / <title> never collapse.
  return cleanString(input.title) ?? `Subasta de ${tipo}`;
}

/**
 * <title>-tag variant. Same body, with a short site suffix and a hard 70-char
 * clamp so the SERP-displayed title never gets truncated by Google mid-word.
 */
export function auctionMetaTitle(
  input: DisplayTitleInput,
  opts: { suffix?: string; maxLength?: number } = {},
): string {
  const suffix = opts.suffix ?? 'SubastasActivas';
  const max = opts.maxLength ?? 70;
  const body = auctionDisplayTitle(input);
  const candidate = `${body} | ${suffix}`;
  if (candidate.length <= max) return candidate;
  // Suffix doesn't fit — drop it and clamp the body, but keep word boundaries
  // where possible (slice at last space before the limit).
  if (body.length <= max) return body;
  const sliced = body.slice(0, max);
  const lastSpace = sliced.lastIndexOf(' ');
  return lastSpace > 30 ? sliced.slice(0, lastSpace) : sliced;
}
