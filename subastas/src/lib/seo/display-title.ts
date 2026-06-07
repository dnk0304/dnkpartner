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
 * Source-name / placeholder garbage we MUST NEVER surface as a title token.
 *
 * Some scrapers (notably PLABI and SEGSOCIAL) write a stub like "Plabi" /
 * "Segsocial" / "No Consta" / "Sin Descripcion" into `Auction.title` when
 * the source page doesn't expose a clean property descriptor. The wave-A
 * helper then echoed that stub as the H1 / <title> last-resort fallback
 * ("Plabi", "Subasta de Plabi"). QC P2 flagged the result — these are now
 * normalised to NULL so the helper falls through to the "Subasta de {tipo}
 * en {muni}" branch, which always produces a sensible title.
 *
 * Match is case-insensitive on a trimmed copy. Extend the list if a future
 * scraper introduces a new garbage stub; do NOT remove entries — they're
 * each backed by a concrete row Dennis flagged.
 */
const TITLE_GARBAGE = new Set<string>([
  'plabi',
  'segsocial',
  'seg social',
  'seg-social',
  'seguridad social',
  'tgss',
  'boe',
  'no consta',
  'sin descripcion',
  'sin descripción',
  'desconocido',
  'desconocida',
  'sin titulo',
  'sin título',
]);

function isTitleGarbage(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const norm = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!norm) return true;
  return TITLE_GARBAGE.has(norm);
}

/**
 * Resolve the "tipo" token shown after "Subasta de ". Order of preference:
 *   propertyType (specific bien type from BOE) → auctionType (enum) → category.
 * Falls back to "Inmueble" — the safest generic that mirrors the competitor
 * phrasing and never appears as "Subasta de  en …".
 *
 * Garbage stubs ("Plabi", "Segsocial", "No Consta") are normalised to NULL
 * at each rung so they never get titlecased and rendered as the type label.
 */
export function resolveTipo(input: DisplayTitleInput): string {
  const propertyType = cleanString(input.propertyType);
  if (propertyType && !isTitleGarbage(propertyType)) return titleCase(propertyType);
  const auctionType = cleanString(input.auctionType);
  if (auctionType && !isTitleGarbage(auctionType)) return titleCase(auctionType);
  const category = cleanString(input.category);
  if (category && !isTitleGarbage(category)) return titleCase(category);
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
  //    stable). Skip garbage stubs ("Plabi", "Segsocial", "No Consta", …)
  //    that some scrapers write when the source row lacks a descriptor —
  //    those are NEVER acceptable as the public H1 / <title>. Falls through
  //    to the generic "Subasta de {tipo}" so the headline never collapses
  //    or surfaces the source-name as if it were a property descriptor.
  const rawTitle = cleanString(input.title);
  if (rawTitle && !isTitleGarbage(rawTitle)) return rawTitle;
  return `Subasta de ${tipo}`;
}

/**
 * Card-headline variant — compact "{Tipo} en {dirección}" / "{Tipo} en {town}"
 * for the carousel + listing card surfaces. Drops the "Subasta de " prefix the
 * detail H1 uses (cards are tight, the prefix is redundant in context) and
 * forces the vehicle path through municipality only (a vehicle "address" from
 * BOE is usually a yard/depot code Dennis doesn't want surfaced; the wave-E
 * vehicleMake/Model/Year fields will replace this once shipped).
 *
 * Inputs are the same as `auctionDisplayTitle` plus a `categoryGroup` hint so
 * the helper can pick the right path without re-running the REAL_ESTATE /
 * MOVABLE category match per call. When `categoryGroup` is omitted we infer
 * from `category` against OFFICIAL_CATEGORIES.MOVABLE — same predicate the
 * carousel uses client-side.
 *
 * @example
 *   auctionCardTitle({ propertyType: 'Vivienda', address: 'Calle Tollo, 19',
 *                     municipality: 'Ontur', categoryGroup: 'real_estate' })
 *   // → "Vivienda en Calle Tollo, 19, Ontur"
 *
 *   auctionCardTitle({ propertyType: 'Turismo', municipality: 'Murcia',
 *                     categoryGroup: 'movable' })
 *   // → "Turismo en Murcia"
 *
 *   auctionCardTitle({ category: 'Motocicletas', municipality: 'Calahorra',
 *                     province: 'La Rioja', categoryGroup: 'movable' })
 *   // → "Motocicleta en Calahorra"
 *
 *   // Wave E2 (2026-06-07) — vehicle make+model present:
 *   auctionCardTitle({ propertyType: 'Turismo', municipality: 'Murcia',
 *                     vehicleMake: 'SEAT', vehicleModel: 'León',
 *                     categoryGroup: 'movable' })
 *   // → "Turismo - SEAT León en Murcia"
 *
 *   auctionCardTitle({ category: 'Motocicletas', municipality: 'Calahorra',
 *                     vehicleMake: 'Honda', vehicleModel: 'CBR 600',
 *                     categoryGroup: 'movable' })
 *   // → "Motocicleta - Honda CBR 600 en Calahorra"
 */
export type CardCategoryGroup = 'real_estate' | 'movable';

export interface CardTitleInput extends DisplayTitleInput {
  categoryGroup?: CardCategoryGroup | null;
  /** Wave E2 (2026-06-07) — vehicle fields. When categoryGroup is 'movable'
   *  and BOTH make and model are present, the card title becomes
   *  "{Tipo} - {make} {model} en {town}". Either field missing → fall
   *  through to the existing "{Tipo} en {town}" phrasing. Year is accepted
   *  but NOT included in the card-title surface (cards are tight; the year
   *  surfaces on the detail page's "Datos del vehículo" block instead). */
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  /** C2 (2026-06-07, batch-c) — when true AND categoryGroup === 'real_estate'
   *  AND `shortStreetName(address)` parses cleanly, the card title becomes
   *  "{Tipo} – {short street}" (en-dash) instead of the long
   *  "{Tipo} en {full address}, {town}" phrasing. Falls through to the
   *  existing logic if the short-street parse returns null. Vehicles are
   *  untouched — they take the `movable` branch above. */
  useShortStreet?: boolean | null;
}

/**
 * C2 (2026-06-07): Extract just the street NAME from a full BOE-format address.
 *
 * BOE addresses are dirty. The common patterns we see in production:
 *   "Cl La Ermita 18 J 00 2, Agüimes"                         → "Calle La Ermita"
 *   "Av Pere Mas I Reus, De 25 Es:1 Pl:03 Pt:09, Alcudia"     → "Avenida Pere Mas i Reus"
 *   "Calle Tollo, 19, 3-A"                                    → "Calle Tollo"
 *   "C/ del Pino 4, 2º D"                                     → "Calle del Pino"
 *   "Avenida de Madrid, 47"                                   → "Avenida de Madrid"
 *   "Pza. Mayor, s/n"                                         → "Plaza Mayor"
 *   "Camino Real km 4,2"                                      → "Camino Real"
 *   "Carretera N-340, km 12"                                  → "Carretera N-340"  (street-name = code is OK)
 *
 * Algorithm:
 *   1. Normalise the leading street-type token via {@link VIA_TYPE_MAP}
 *      (handles the 13 Spanish abbreviations we've actually seen in BOE feeds:
 *      cl, c/, calle, av, avda, av., avenida, pl, pza, plaza, pº, paseo,
 *      camino, cmno, ctra, carretera, travesía, urb, urbanización,
 *      ronda, glorieta, pasaje, callejón, via/vía).
 *   2. After consuming the via-type, capture the street-name tokens UP TO
 *      the first separator that introduces non-name content:
 *        - comma                (",")
 *        - any digit at a word boundary  ("\b\d")  → strips house numbers
 *        - "s/n" / "S/N"        (no-number marker)
 *        - "km <num>"           (highway km)
 *   3. Title-case the street-name tokens (Spanish-aware: "de", "del",
 *      "la", "los", "las", "el", "y", "i" stay lowercase between words).
 *   4. Return "{Via} {Street}". On a parse failure (no recognised via-type
 *      OR an empty street name after stripping), return NULL so the caller
 *      can fall back to the existing "{Tipo} en {town}" phrasing.
 *
 * NEVER returns the full address. NEVER returns the municipality. Conservative
 * on failure — honest NULL beats a wrong shorter title.
 */
/**
 * Via-type patterns. Each entry: [regex matching the leading token + ANY
 * trailing separator (dot, slash, whitespace), label].
 *
 * Pattern shape: `^<form>(?:\.|\b)\s*` — the `(?:\.|\b)` consumes either a
 * trailing dot (for abbreviations like "Avda.", "Pza.") OR a word boundary
 * (for full forms like "Avenida"). The trailing `\s*` then eats whatever
 * whitespace separates the via-type from the street name so the consumer
 * gets a clean "rest" string.
 *
 * Order matters: longer/multi-word forms first so "Travesía" doesn't get
 * half-eaten by a "Trav" prefix, and "Avenida" is preferred over "Av".
 */
const VIA_TYPE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/^urbanizaci[oó]n(?:\.|\b)\s*/i, 'Urbanización'],
  [/^urb(?:\.|\b)\s*/i, 'Urbanización'],
  [/^carretera(?:\.|\b)\s*/i, 'Carretera'],
  [/^ctra(?:\.|\b)\s*/i, 'Carretera'],
  [/^avenida(?:\.|\b)\s*/i, 'Avenida'],
  [/^avda(?:\.|\b)\s*/i, 'Avenida'],
  [/^av(?:\.|\b)\s*/i, 'Avenida'],
  [/^travesía(?:\.|\b)\s*/i, 'Travesía'],
  [/^travesia(?:\.|\b)\s*/i, 'Travesía'],
  [/^trav(?:\.|\b)\s*/i, 'Travesía'],
  [/^callej[oó]n(?:\.|\b)\s*/i, 'Callejón'],
  [/^calle(?:\.|\b)\s*/i, 'Calle'],
  [/^c\/\s*/i, 'Calle'],
  [/^cl(?:\.|\b)\s*/i, 'Calle'],
  // Bare "C." (must NOT match "C/" which was caught above). Require a
  // following dot or whitespace so we don't swallow a word that starts with c.
  [/^c\.\s*/i, 'Calle'],
  [/^c\s+/i, 'Calle'],
  [/^plaza(?:\.|\b)\s*/i, 'Plaza'],
  [/^pza(?:\.|\b)\s*/i, 'Plaza'],
  [/^pl(?:\.|\b)\s*/i, 'Plaza'],
  [/^paseo(?:\.|\b)\s*/i, 'Paseo'],
  // "Pº" / "Po." / "P°" — abbreviation for Paseo. The character after "p"
  // is a non-word ordinal/degree mark, so `\b` won't fire — explicit `\s*`
  // is the only reliable separator after consuming the mark.
  [/^p[ºo°]\.?\s*/i, 'Paseo'],
  [/^camino(?:\.|\b)\s*/i, 'Camino'],
  [/^cmno(?:\.|\b)\s*/i, 'Camino'],
  [/^cno(?:\.|\b)\s*/i, 'Camino'],
  [/^ronda(?:\.|\b)\s*/i, 'Ronda'],
  [/^glorieta(?:\.|\b)\s*/i, 'Glorieta'],
  [/^pasaje(?:\.|\b)\s*/i, 'Pasaje'],
  [/^v[ií]a(?:\.|\b)\s*/i, 'Vía'],
];

/**
 * Tokens that ALWAYS stay lowercase when not at position 0:
 * Spanish/Catalan prepositions + connectors (de / del / da / do / y / i).
 * The Spanish ARTICLES (la / las / los / el) are handled separately —
 * they only go lowercase when preceded by a connector (e.g. "de la"),
 * NOT when they're the head of a proper place name ("La Ermita",
 * "Los Olivos", "Las Palmas").
 */
const SPANISH_CONNECTOR_TOKENS = new Set<string>([
  'de', 'del', 'y', 'i', 'da', 'do', 'das', 'dos',
]);
const SPANISH_ARTICLE_TOKENS = new Set<string>([
  'la', 'las', 'los', 'el',
]);

function titleCaseStreetName(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const lowers = tokens.map((t) => t.toLowerCase());
  return tokens
    .map((tok, idx) => {
      const lower = lowers[idx];
      const prevLower = idx > 0 ? lowers[idx - 1] : null;

      // Spanish connectors ("de"/"del"/"y"/"i"/Catalan "i") ALWAYS stay
      // lowercase — including at idx 0, because they connect the via-type
      // (which we already render above) to the street name proper:
      //   "Calle de Madrid"           → "Calle de Madrid"  (idx 0 "de")
      //   "Pº de la Castellana"       → "Paseo de la Castellana"
      //   "Pere Mas i Reus"           → "Pere Mas i Reus"
      // They're never the head of a place name on their own.
      if (SPANISH_CONNECTOR_TOKENS.has(lower)) return lower;

      // Spanish articles ("la"/"las"/"los"/"el") only go lowercase when
      // preceded by a connector — they're then part of a contracted form
      // like "de la / de los / del el". Otherwise they're the head of a
      // proper place name and MUST stay capitalised:
      //   "Calle La Ermita"           — idx 1 "la", prev "calle"      → "La"
      //   "Urbanización Los Olivos"   — idx 1 "los", prev "urbanización" → "Los"
      //   "Avenida de la Constitución"— idx 2 "la",  prev "de"        → "la"
      //   "Pº de los Reyes"           — idx 2 "los", prev "de"        → "los"
      if (
        idx > 0 &&
        SPANISH_ARTICLE_TOKENS.has(lower) &&
        prevLower !== null &&
        SPANISH_CONNECTOR_TOKENS.has(prevLower)
      ) {
        return lower;
      }

      // Tokens with internal hyphens (e.g. "N-340") — uppercase each part.
      if (lower.includes('-')) {
        return lower
          .split('-')
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
          .join('-');
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function shortStreetName(address: string | null | undefined): string | null {
  const raw = cleanString(address);
  if (!raw) return null;

  // Strip any leading "Subasta de " noise (not a real BOE prefix but safer to
  // handle than to surface) and collapse whitespace.
  const collapsed = raw.replace(/\s+/g, ' ').trim();

  // Find the via-type prefix. If none matches, we have no signal — return NULL.
  let viaLabel: string | null = null;
  let rest = collapsed;
  for (const [pattern, label] of VIA_TYPE_MAP) {
    const match = pattern.exec(collapsed);
    if (match) {
      viaLabel = label;
      rest = collapsed.slice(match[0].length).trim();
      break;
    }
  }
  if (!viaLabel) return null;

  // Now consume the street-name tokens up to the first cutoff. We slice the
  // remaining string at the EARLIEST of:
  //   - comma
  //   - " s/n" (case-insensitive, with separator)
  //   - " km <digit>" (highway km marker)
  //   - any token starting with a digit (house number / floor)
  // Whichever cutoff comes first wins. We walk tokens to be defensive about
  // mid-name digits that aren't house numbers (e.g. "Calle 20 de Junio" —
  // but those are rare in our corpus; leading-digit token cut is the right
  // heuristic for BOE addresses dominated by "<name> <number>" patterns).
  const commaIdx = rest.indexOf(',');
  const slashNIdx = rest.search(/\bs\s*\/\s*n\b/i);
  const kmIdx = rest.search(/\bkm\s+\d/i);

  // Find first leading-digit token (house number). Walk word-by-word so we
  // capture compound names like "Pere Mas I Reus" before the digit "25" hits.
  let firstDigitTokenIdx = -1;
  {
    const tokenRe = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(rest)) !== null) {
      // A token is a "digit token" if its FIRST character is a digit. This
      // is the strongest signal for a house number in a Spanish address.
      if (/^\d/.test(m[0])) {
        firstDigitTokenIdx = m.index;
        break;
      }
    }
  }

  const candidates = [commaIdx, slashNIdx, kmIdx, firstDigitTokenIdx]
    .filter((v) => v >= 0);
  const cutoff = candidates.length > 0 ? Math.min(...candidates) : rest.length;

  const streetTokensRaw = rest.slice(0, cutoff).trim();
  // Trim trailing punctuation/separators that crept in.
  const streetTokens = streetTokensRaw.replace(/[,;:.\s]+$/, '').trim();
  if (!streetTokens) return null;

  const streetName = titleCaseStreetName(streetTokens);
  if (!streetName) return null;
  return `${viaLabel} ${streetName}`;
}

/** Tiny category-group predicate kept local so this module has no constants.ts
 *  dependency (display-title is consumed by server projections that load early
 *  in the bundle). Mirrors `OFFICIAL_CATEGORIES.MOVABLE` exactly. */
const MOVABLE_LABELS = new Set<string>([
  'Turismos',
  'Motocicletas',
  'Vehículos Industriales',
  'Camiones',
  'Barcos',
  'Embarcaciones',
  'Otros vehículos',
  'Maquinaria',
  'Joyas',
  'Arte',
]);

function inferCategoryGroup(category: string | null | undefined): CardCategoryGroup | null {
  const c = cleanString(category);
  if (!c) return null;
  return MOVABLE_LABELS.has(c) ? 'movable' : 'real_estate';
}

export function auctionCardTitle(input: CardTitleInput): string {
  const tipo = resolveTipo(input);
  const group = input.categoryGroup ?? inferCategoryGroup(input.category);
  const address = cleanString(input.address);
  const municipality = cleanString(input.municipality);
  const province = cleanString(input.province);

  // Garbage-title guard — when the row carries a stub like "Plabi" /
  // "Segsocial" / "No Consta", we must NOT surface it on cards either.
  // The municipality/province path below catches it; if neither exists,
  // fall through to the bare tipo (never the stub) below.

  // VEHICLES (movable) — Dennis-locked 2026-06-07: address is skipped (BOE
  // depot codes / yard refs aren't user-meaningful). When wave-E vehicle
  // make+model are BOTH present, render the richer "{Tipo} - {make} {model}
  // en {town}" phrasing (e.g. "Turismo - SEAT León en Murcia"). Either
  // field missing → fall through to the bare "{Tipo} en {town}" so we never
  // surface an orphan dash like "Turismo -  en Murcia".
  if (group === 'movable') {
    const make = cleanString(input.vehicleMake);
    const model = cleanString(input.vehicleModel);
    // titleCase the user-facing tokens; raw scraped make/model come from BOE
    // as either ALL-CAPS ("SEAT LEON") or freeform — normalise so a single
    // carousel doesn't mix "SEAT LEON" + "Seat León" rows.
    const vehicleToken = make && model ? `${titleCase(make)} ${titleCase(model)}` : null;
    if (municipality) {
      return vehicleToken
        ? `${tipo} - ${vehicleToken} en ${titleCase(municipality)}`
        : `${tipo} en ${titleCase(municipality)}`;
    }
    if (province) {
      return vehicleToken
        ? `${tipo} - ${vehicleToken} en ${titleCase(province)}`
        : `${tipo} en ${titleCase(province)}`;
    }
    return vehicleToken ? `${tipo} - ${vehicleToken}` : tipo;
  }

  // REAL ESTATE (or unknown group — default to property phrasing).
  //
  // C2 (2026-06-07): short-street mode. When the caller passes
  // `useShortStreet=true` and the address parses cleanly into a street name,
  // collapse the title to "{Tipo} – {street name}" (en-dash) so the card
  // surface stays tight. A null parse → fall through to the existing
  // address phrasing OR the municipality fallback below. Vehicle group is
  // handled earlier; this branch only fires for real-estate / unknown.
  if (input.useShortStreet === true) {
    const short = shortStreetName(address);
    if (short) return `${tipo} – ${short}`;
    // No parseable street — fall through to the municipality fallback so the
    // card shows "{Tipo} en {town}" instead of the long raw address.
    if (municipality) {
      const provSuffix = province ? `, ${titleCase(province)}` : '';
      return `${tipo} en ${titleCase(municipality)}${provSuffix}`;
    }
    if (province) {
      return `${tipo} en ${titleCase(province)}`;
    }
    return tipo;
  }

  if (address) {
    const lowerAddr = address.toLowerCase();
    const muniSuffix =
      municipality && !lowerAddr.includes(municipality.toLowerCase())
        ? `, ${titleCase(municipality)}`
        : '';
    return `${tipo} en ${titleCase(address)}${muniSuffix}`;
  }
  if (municipality) {
    const provSuffix = province ? `, ${titleCase(province)}` : '';
    return `${tipo} en ${titleCase(municipality)}${provSuffix}`;
  }
  if (province) {
    return `${tipo} en ${titleCase(province)}`;
  }
  // No location at all — fall back to tipo alone (never the BOE ref).
  return tipo;
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
