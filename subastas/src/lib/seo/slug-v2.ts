/**
 * src/lib/seo/slug-v2.ts — CATEGORY-FIRST auction slug engine (Dennis-final,
 * 2026-08-03). Produces the descriptive, human-readable URL that REPLACES the
 * opaque `{tipo}-{provincia}-{municipio}-{cuid}` form.
 *
 * NEW URL SHAPE (no /subastas/subasta prefix):
 *   /{province}/{town}/{category}-{descriptor}-{shortId}
 *   e.g.  /madrid/mostoles/vivienda-avenida-portugal-16-pl4-c-1abxyz
 *         /valencia/valencia/coche-bmw-serie-5-520d-2011-9f2k0q
 *
 * ── WHY THE SUFFIX IS ALWAYS PRESENT (v2.1, Ken audit 2026-08-03) ──────────
 * The first cut short-circuited on `if (descriptor) return kw + '-' + descriptor`
 * before ever appending a disambiguator, which made COLLISIONS REACHABLE: the
 * province and town are already in the path, so ANY two auctions at one address
 * emitted a byte-identical URL. Live, reachable cases in this corpus: a property
 * re-auctioned after a DESIERTA, several garage/trastero lots in one building
 * with no unit token, and any two lots on a street whose address lacks a number.
 *
 * Two ways out were considered:
 *   (a) suffix-on-detected-collision — prettier URLs, but needs a global
 *       uniqueness pass, which this module CANNOT have: it must stay pure so the
 *       sitemap route remains request-time (07 §4) and so a slug is stable across
 *       processes and crawls. Worse, it is not stable over TIME: auction A takes
 *       the bare URL, then months later a re-auction B lands at the same address
 *       — either B collides, or A gets renamed. We have NO redirect machinery
 *       and ~200k pages in the blast radius.
 *   (b) ALWAYS-SUFFIX — uniformly, slightly uglier; unique BY CONSTRUCTION
 *       (the suffix derives from the unique `Auction.id`); never changes once
 *       minted, because nothing about it depends on the rest of the corpus.
 *
 * ⭐ (b) CHOSEN. With no redirects, a URL that changes later is far worse than a
 * URL that is slightly uglier now. Proven over the full live corpus — see
 * slug-v2.samples.md for the measured duplicate count.
 *
 * ── DATA REALITY (measured against prod 2026-08-03, do not "optimise" away) ──
 *   • `title` is EMPTY on 219,623 / 240,890 rows (91.2%). The previous docstring
 *     claimed it was "100%-populated"; it is not. `address` (90.4% populated) is
 *     the workhorse for properties; title is a secondary fallback only.
 *   • Vehicles: `title` empty on 5,099/5,539 (92.1%) — the old vehicleDescriptor
 *     parsed the title and was therefore dead code in practice. It now reads the
 *     real `vehicleMake`/`vehicleModel`/`vehicleYear` columns. Those are only
 *     populated on 274/5,539 rows (4.9%), so ~95% of vehicles legitimately land
 *     on the `{kw}-{town}-{shortId}` fallback today. That improves for free as
 *     Ghost backfills the vehicle extract — no slug churn for existing rows,
 *     because the suffix is already there either way.
 *
 * PURE + deterministic: same row → same slug across crawls. No DB, no `now`.
 */

import { PROVINCE_DB_KEY_TO_SLUG, RESERVED_SEGMENTS, slugify } from './slugs';

/**
 * DB `Auction.category` label → Spanish URL keyword. VERBATIM DB labels on the
 * left (a typo silently drops a category to the generic fallback). Kept in sync
 * with SEO_CONCLUDED_INDEXABLE_CATEGORIES + the live category distribution.
 * `piso` is a Viviendas subtype we cannot distinguish from the row, so all
 * dwellings map to `vivienda` (the broader, higher-volume keyword).
 */
export const CATEGORY_DB_LABEL_TO_URL_KEYWORD: Readonly<Record<string, string>> = {
  // Property
  Viviendas: 'vivienda',
  'Otros inmuebles': 'inmueble',
  Garajes: 'garaje',
  Locales: 'local',
  Oficinas: 'oficina',
  'Naves industriales': 'nave',
  'Fincas rústicas': 'finca',
  Terrenos: 'terreno',
  Trasteros: 'trastero',
  // Vehicles
  Turismos: 'coche',
  Motocicletas: 'moto',
  'Vehículos Industriales': 'camion',
  Camiones: 'camion',
  Barcos: 'barco',
  Embarcaciones: 'barco',
  Bicicletas: 'bici',
  // Other movable
  Maquinaria: 'maquinaria',
  Joyas: 'joya',
  'Arte y antigüedades': 'arte',
  Mobiliario: 'mobiliario',
};

/** Categories whose descriptor is a street address, not a make+model. */
const PROPERTY_KEYWORDS = new Set([
  'vivienda', 'inmueble', 'garaje', 'local', 'oficina', 'nave', 'finca', 'terreno', 'trastero',
]);

/**
 * Max length of the DESCRIPTOR portion, in characters, truncated on a hyphen
 * (word) boundary. Without this the segment is unbounded: a slugified Spanish
 * cadastral address routinely runs past 120 chars ("C/. POETA JOSÉ CERVERA I
 * GRIPOL Nº 14-BLOQUE 7-13ª-77ª, VALENCIA"). 48 keeps the full path comfortably
 * inside the range Google renders in a SERP breadcrumb and well inside every
 * practical URL limit, while still carrying street + number + unit.
 */
export const MAX_DESCRIPTOR_LEN = 48;

export type AuctionForSlugV2 = {
  id: string;
  category: string | null;
  province: string | null;
  municipality: string | null;
  address: string | null;
  /** Free-text title. EMPTY on ~91% of live rows — secondary fallback only. */
  title: string | null;
  /** Vehicle extract columns (populated on ~5% of vehicle rows today). */
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
};

/** Category segment — mapped keyword, else a slugified fallback of the raw label. */
export function categoryKeyword(category: string | null): string {
  if (!category) return 'subasta';
  return CATEGORY_DB_LABEL_TO_URL_KEYWORD[category] ?? (slugify(category) || 'subasta');
}

/**
 * Province URL segment — canonical slug, else slugified, else `espana`.
 *
 * ⚠️ RESERVED-SEGMENT GUARD (07 §1.6). The v2 shape puts the province at the
 * ROOT (`/{province}/…`), sharing a namespace with `/guia`, `/noticias`,
 * `/api`, `/studio`, `/subastas`, … A province slug that equalled one of those
 * would shadow a real route. None of the 52 canonical province slugs does (a
 * test asserts this and will fail loudly if the province registry ever moves),
 * but the fallback path slugifies arbitrary DB text, so the guard is applied
 * unconditionally rather than assumed.
 */
export function provinceSegment(province: string | null): string {
  if (!province) return 'espana';
  const s = PROVINCE_DB_KEY_TO_SLUG[province] ?? (slugify(province) || 'espana');
  return RESERVED_SEGMENTS.has(s) ? `provincia-${s}` : s;
}

/** Town URL segment — slugified municipality, else `sin-municipio`. */
export function townSegment(municipality: string | null): string {
  const s = (municipality && slugify(municipality)) || 'sin-municipio';
  return RESERVED_SEGMENTS.has(s) ? `municipio-${s}` : s;
}

/**
 * Compact address noise: the scraped address carries verbose cadastral unit
 * tokens ("es 1 pl 3 pt d" = escalera 1, planta 3, puerta d). We drop the
 * escalera token, keep planta+puerta, and fuse them (`pl 3 pt d` → `pl3-d`) so
 * the slug reads like Dennis's target `…-45-3b` rather than a data dump.
 */
function compactUnit(folded: string): string {
  return folded
    .replace(/\bes-\d+\b/g, '') // drop escalera token (low search value)
    .replace(/\bpl-(-?\d+)\b/g, 'pl$1') // pl 3 → pl3
    .replace(/\bpt-([a-z0-9]+)\b/g, '$1') // pt d → d
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Truncate an already-slugified string to `max` chars on a hyphen (word)
 * boundary, so we never cut a word in half or leave a dangling hyphen. If the
 * first token alone exceeds the cap it is hard-cut (a single 60-char token is
 * junk data, not a word worth preserving).
 */
export function capDescriptor(seg: string, max: number = MAX_DESCRIPTOR_LEN): string {
  if (seg.length <= max) return seg;
  const cut = seg.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

/**
 * Drop a trailing town/province token from a descriptor. Spanish auction
 * addresses and titles almost always append the locality ("calle praofuentes,
 * Colmenarejo" / "…Nº 16-3º-23ª, XIRIVELLA") — and the locality is ALREADY the
 * preceding path segment, so repeating it is pure keyword duplication. Only a
 * TRAILING match is stripped: a street genuinely named after the town
 * ("calle valencia 12" in Valencia) keeps its street name.
 */
function stripTrailingLocality(seg: string, ...localities: string[]): string {
  let out = seg;
  for (const loc of localities) {
    if (!loc || loc === 'sin-municipio') continue;
    if (out === loc) return ''; // descriptor was ONLY the town — carries nothing
    if (out.endsWith(`-${loc}`)) out = out.slice(0, -(loc.length + 1));
  }
  return out.replace(/-+$/, '');
}

/** Property descriptor: street from `address` (primary), else parsed from the title. */
function propertyDescriptor(a: AuctionForSlugV2, town: string, province: string): string {
  let street = '';
  if (a.address && a.address.trim().length > 3 && a.address.trim().toLowerCase() !== 'unknown') {
    street = a.address;
  } else if (a.title) {
    // ⚠️ ANCHORED to the house style "Subasta de {Tipo} en {street}, {town}".
    // The first cut used a bare /\ben\s+(.+)$/ — which happily matched the word
    // "en" buried in a paragraph of boilerplate and produced descriptors like
    // `vivienda-cuya-pagina-podran-verificarse-cuantos-datos-e-…` on real live
    // rows. `title` is free text on 91% of the corpus; only the 12,092
    // "Subasta …" rows follow the house style, so ONLY those are parsed. Also
    // non-greedy up to the FIRST " en " and stopping at the first comma, which
    // is where the street ends in that template.
    const m = a.title.trim().match(/^subasta\b.*?\ben\s+([^,]+)/i);
    if (m) street = m[1];
  }
  const folded = compactUnit(slugify(street));
  return capDescriptor(stripTrailingLocality(folded, town, province));
}

/**
 * Vehicle descriptor: make + model (+ year) from the STRUCTURED columns. The
 * previous version slugified the free-text `title`, which is empty on 92% of
 * vehicle rows — it never produced anything. Returns '' when the extract has
 * not run for this row, which is the honest signal to use the town fallback.
 */
function vehicleDescriptor(a: AuctionForSlugV2): string {
  const make = slugify((a.vehicleMake ?? '').trim());
  const model = slugify((a.vehicleModel ?? '').trim());
  if (!make && !model) return '';
  const y = a.vehicleYear;
  const year = typeof y === 'number' && y > 1900 && y < 2100 ? String(y) : '';
  return capDescriptor([make, model, year].filter(Boolean).join('-'));
}

/**
 * Length of the id-derived disambiguator suffix.
 *
 * ⚠️ 8, NOT 6 — sized against the real corpus, do not shrink for prettiness.
 * `Auction.id` is NOT uniformly cuid: a large slice of the corpus carries UUIDs,
 * whose tail is HEX only (16 symbols), not base36. Measured over all 240,890
 * live rows: a 6-char tail is reused by 1,501 ids, and 55,254 rows (22.9%) sit
 * in a bare-slug group where the province+town+category+descriptor are already
 * identical (largest group: 629 rows, `/barcelona/barcelona/coche-barcelona`).
 * 6 chars survives TODAY by luck of the draw; at ~50k new rows/yr it would start
 * producing real collisions, and a collision here is unrecoverable (two auctions
 * on one URL, no redirect machinery, one page silently unreachable).
 * 8 hex chars = 4.3e9 space → the expected collision count stays negligible for
 * the life of the dataset, for the price of two characters.
 */
export const SHORT_ID_LEN = 8;

/**
 * Short, stable disambiguator drawn from the row id (last SHORT_ID_LEN chars).
 * Derived from `Auction.id` (UNIQUE), so it is stable for the life of the row
 * and independent of every other row — no global pass, no renaming, ever.
 */
export function shortId(id: string): string {
  const cleaned = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return cleaned.slice(-SHORT_ID_LEN) || 'x';
}

/**
 * Build the category-first slug SEGMENT (the part after /{province}/{town}/).
 * ALWAYS ends in `-{shortId}` — see the always-suffix rationale in the header.
 * Shapes:
 *   with descriptor : {category}-{descriptor}-{shortId}
 *   without         : {category}-{town}-{shortId}
 */
export function buildAuctionSlugV2Segment(a: AuctionForSlugV2): string {
  const kw = categoryKeyword(a.category);
  const town = townSegment(a.municipality);
  const province = provinceSegment(a.province);
  const descriptor = PROPERTY_KEYWORDS.has(kw)
    ? propertyDescriptor(a, town, province)
    : vehicleDescriptor(a);
  const sid = shortId(a.id);
  // Fallback — no usable descriptor: keep it findable with the town.
  return descriptor ? `${kw}-${descriptor}-${sid}` : `${kw}-${town}-${sid}`;
}

/** Full path: /{province}/{town}/{category}-{descriptor}-{shortId}. */
export function buildAuctionPathV2(a: AuctionForSlugV2): string {
  return `/${provinceSegment(a.province)}/${townSegment(a.municipality)}/${buildAuctionSlugV2Segment(a)}`;
}
