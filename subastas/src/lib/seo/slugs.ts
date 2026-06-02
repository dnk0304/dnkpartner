/**
 * SEO slug grammar — deterministic, accent-folded, ñ→n, alias 301s.
 *
 * Spec: marketing/PROJECTS/dnksubastas/content-seo/07-SEO-URL-ARCHITECTURE.md §2.
 *
 * Build-time constants only — NO migration. The algorithm is fixed and the
 * province/tipo/category sets are stable, so a stored slug table would only
 * add deploy coordination cost.
 *
 * Three slug spaces:
 *  - PROVINCE_SLUG_TO_DB_KEY   — 52 provinces (slug → exact DB Auction.province key)
 *  - TIPO_SLUG_TO_DB_KEYS      — 5 auction types (slug → DB auctionType labels, plural+legacy)
 *  - CATEGORY_SLUG_TO_DB_LABEL — 15 OFFICIAL_CATEGORIES (slug → exact DB Auction.category label)
 *
 * Plus alias maps (legacy/alt spellings → canonical) that the middleware uses
 * to emit 301 redirects so cannibalisation never happens.
 *
 * Reserved-word guard (07 §1.6): the {categoria} slot at /subastas/{slug} must
 * reject any token that belongs to a different grammar (provincia, tipo,
 * municipio, subasta, en, guia, page, api, studio).
 */

import { SPAIN_PROVINCES, type CanonicalProvince } from '../spain-provinces';

// ---------------------------------------------------------------------------
// Generic slugify — accent-fold, ñ→n, lowercase, hyphenate, collapse repeats.
// ---------------------------------------------------------------------------

export function slugify(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// ---------------------------------------------------------------------------
// Reserved words (07 §1.6). Includes `subasta` (07 §1.7).
// ---------------------------------------------------------------------------

export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  'provincia',
  'tipo',
  'municipio',
  'subasta',
  'en',
  'guia',
  'page',
  'api',
  'studio',
  'admin',
  'auth',
  'login',
  'register',
  'pagina',
  'sitemap',
  'robots',
]);

// ---------------------------------------------------------------------------
// PROVINCE slugs — canonical map + alias 301 map.
// Derived from SPAIN_PROVINCES (single source of truth) with the spec's
// special-case slugs (07 §2.4) honoured explicitly.
// ---------------------------------------------------------------------------

/** Special canonical slug overrides — by DB key. */
const PROVINCE_SLUG_OVERRIDES: Record<string, string> = {
  'A Coruña': 'a-coruna',
  'Álava': 'araba-alava',          // canonical = araba-alava per spec
  'Illes Balears': 'baleares',     // most-searched form
  'Gipuzkoa': 'gipuzkoa',
  'Bizkaia': 'bizkaia',
  'Las Palmas': 'las-palmas',
  'Santa Cruz de Tenerife': 'santa-cruz-de-tenerife',
};

function buildProvinceSlug(p: CanonicalProvince): string {
  return PROVINCE_SLUG_OVERRIDES[p.key] ?? slugify(p.label);
}

/** Canonical province-slug → DB Auction.province key. */
export const PROVINCE_SLUG_TO_DB_KEY: Readonly<Record<string, string>> = (() => {
  const m: Record<string, string> = {};
  for (const p of SPAIN_PROVINCES) m[buildProvinceSlug(p)] = p.key;
  return m;
})();

/** DB key → canonical province slug (reverse). */
export const PROVINCE_DB_KEY_TO_SLUG: Readonly<Record<string, string>> = (() => {
  const m: Record<string, string> = {};
  for (const p of SPAIN_PROVINCES) m[p.key] = buildProvinceSlug(p);
  return m;
})();

/** All canonical province slugs (52). */
export const PROVINCE_SLUGS: ReadonlyArray<string> = Object.keys(PROVINCE_SLUG_TO_DB_KEY);

/** Display label for a province slug (proper-cased, accented). */
export function provinceLabelForSlug(slug: string): string | null {
  const key = PROVINCE_SLUG_TO_DB_KEY[slug];
  if (!key) return null;
  const row = SPAIN_PROVINCES.find((p) => p.key === key);
  return row ? row.label : null;
}

/** Alias → canonical province slug. 301s. */
export const PROVINCE_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
  'la-coruna': 'a-coruna',
  'alava': 'araba-alava',
  'illes-balears': 'baleares',
  'mallorca': 'baleares',
  'guipuzcoa': 'gipuzkoa',
  'vizcaya': 'bizkaia',
  'gerona': 'girona',
  'lerida': 'lleida',
  'orense': 'ourense',
  'la-rioja': 'la-rioja',
};

// ---------------------------------------------------------------------------
// TIPO slugs — 5 auction types. Slug → DB auctionType keys (covers legacy).
// ---------------------------------------------------------------------------

export type TipoSlug = 'judicial' | 'hacienda' | 'otras-tributarias' | 'notarial' | 'administrativas';

export const TIPO_SLUGS: ReadonlyArray<TipoSlug> = [
  'judicial',
  'hacienda',
  'otras-tributarias',
  'notarial',
  'administrativas',
];

/** Slug → DB auctionType labels to query (covers legacy singular forms). */
export const TIPO_SLUG_TO_DB_KEYS: Readonly<Record<TipoSlug, string[]>> = {
  judicial: ['JUDICIAL'],
  hacienda: ['AEAT'],
  'otras-tributarias': ['OTRAS_TRIBUTARIAS', 'TRIBUTARIA'],
  notarial: ['NOTARIAL'],
  administrativas: ['ADMINISTRATIVAS', 'ADMINISTRATIVA'],
};

/** DB auctionType → canonical tipo slug (for reverse / auction-slug generation). */
export const DB_AUCTIONTYPE_TO_TIPO_SLUG: Readonly<Record<string, TipoSlug>> = {
  JUDICIAL: 'judicial',
  AEAT: 'hacienda',
  OTRAS_TRIBUTARIAS: 'otras-tributarias',
  TRIBUTARIA: 'otras-tributarias',
  NOTARIAL: 'notarial',
  ADMINISTRATIVAS: 'administrativas',
  ADMINISTRATIVA: 'administrativas',
};

/** Spanish plural label for the tipo (for titles/H1 — see 07 §3.1). */
export const TIPO_LABEL_PLURAL: Readonly<Record<TipoSlug, string>> = {
  judicial: 'judiciales',
  hacienda: 'de Hacienda (AEAT)',
  'otras-tributarias': 'tributarias',
  notarial: 'notariales',
  administrativas: 'administrativas',
};

/** Tipo alias map (legacy URL spellings). */
export const TIPO_ALIAS_TO_CANONICAL: Readonly<Record<string, TipoSlug>> = {
  aeat: 'hacienda',
  tributaria: 'otras-tributarias',
  administrativa: 'administrativas',
};

// ---------------------------------------------------------------------------
// CATEGORY slugs — the OFFICIAL_CATEGORIES allowlist (15 items).
// Slug → EXACT DB Auction.category label (per Forge flag (a)).
// NO data-layer "vehiculo" rollup. Each canonical slug maps to its real label.
// ---------------------------------------------------------------------------

export type CategorySlug =
  | 'vivienda'
  | 'otros-inmuebles'
  | 'garaje'
  | 'nave-industrial'
  | 'finca-rustica'
  | 'terreno'
  | 'local'
  | 'trastero'
  | 'turismo'
  | 'motocicleta'
  | 'vehiculo-industrial'
  | 'barco'
  | 'maquinaria'
  | 'joya'
  | 'arte';

/**
 * Canonical category slug → EXACT DB Auction.category label.
 *
 * Forge flag (a): the URL is the pretty slug; the query MUST hit the exact
 * stored label or the page returns zero. NO collapsing into a "vehiculo"
 * super-category at the data layer.
 *
 * Forge flag (b): this is the OFFICIAL_CATEGORIES allowlist. Anything outside
 * it (stray `Oficinas` etc.) → noindex.
 */
export const CATEGORY_SLUG_TO_DB_LABEL: Readonly<Record<CategorySlug, string>> = {
  vivienda: 'Viviendas',
  'otros-inmuebles': 'Otros inmuebles',
  garaje: 'Garajes',
  'nave-industrial': 'Naves industriales',
  'finca-rustica': 'Fincas rústicas',
  terreno: 'Terrenos',
  local: 'Locales',
  trastero: 'Trasteros',
  turismo: 'Turismos',
  motocicleta: 'Motocicletas',
  'vehiculo-industrial': 'Vehículos Industriales',
  barco: 'Barcos',
  maquinaria: 'Maquinaria',
  joya: 'Joyas',
  arte: 'Arte',
};

/** Reverse: DB category label → canonical slug. Used by auction-slug builder. */
export const DB_CATEGORY_LABEL_TO_SLUG: Readonly<Record<string, CategorySlug>> = (() => {
  const m: Record<string, CategorySlug> = {};
  for (const [slug, label] of Object.entries(CATEGORY_SLUG_TO_DB_LABEL)) {
    m[label] = slug as CategorySlug;
  }
  return m;
})();

/** OFFICIAL_CATEGORIES allowlist — Forge flag (b). */
export const OFFICIAL_CATEGORIES: ReadonlySet<string> = new Set(
  Object.values(CATEGORY_SLUG_TO_DB_LABEL),
);

/** All canonical category slugs. */
export const CATEGORY_SLUGS: ReadonlyArray<CategorySlug> = Object.keys(
  CATEGORY_SLUG_TO_DB_LABEL,
) as CategorySlug[];

/** Spanish plural display label for a category slug (titles/H1). */
export const CATEGORY_LABEL_PLURAL: Readonly<Record<CategorySlug, string>> = {
  vivienda: 'viviendas',
  'otros-inmuebles': 'otros inmuebles',
  garaje: 'garajes',
  'nave-industrial': 'naves industriales',
  'finca-rustica': 'fincas rústicas',
  terreno: 'terrenos',
  local: 'locales',
  trastero: 'trasteros',
  turismo: 'turismos',
  motocicleta: 'motocicletas',
  'vehiculo-industrial': 'vehículos industriales',
  barco: 'barcos',
  maquinaria: 'maquinaria',
  joya: 'joyas',
  arte: 'piezas de arte',
};

/** Category alias map (legacy URL spellings). */
export const CATEGORY_ALIAS_TO_CANONICAL: Readonly<Record<string, CategorySlug>> = {
  viviendas: 'vivienda',
  pisos: 'vivienda',
  piso: 'vivienda',
  casa: 'vivienda',
  casas: 'vivienda',
  garajes: 'garaje',
  parking: 'garaje',
  trasteros: 'trastero',
  locales: 'local',
  naves: 'nave-industrial',
  nave: 'nave-industrial',
  'fincas-rusticas': 'finca-rustica',
  terrenos: 'terreno',
  solar: 'terreno',
  solares: 'terreno',
  vehiculo: 'turismo',
  vehiculos: 'turismo',
  coches: 'turismo',
  coche: 'turismo',
  turismos: 'turismo',
  motos: 'motocicleta',
  moto: 'motocicleta',
  motocicletas: 'motocicleta',
  barcos: 'barco',
  joyas: 'joya',
};

// ---------------------------------------------------------------------------
// Indexability gates (07 §6.1).
// ---------------------------------------------------------------------------

/** Inventory threshold for a category page to be indexed. */
export const CATEGORY_INDEX_THRESHOLD = 5;

/**
 * Is this category label one we will EVER index?
 * Flag (b): off-taxonomy labels (like stray "Oficinas") stay noindex.
 */
export function isOfficialCategory(dbLabel: string | null | undefined): boolean {
  return Boolean(dbLabel) && OFFICIAL_CATEGORIES.has(dbLabel as string);
}
