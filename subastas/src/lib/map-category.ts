/**
 * map-category.ts — simplified "map sidebar" taxonomy.
 *
 * Wave79 (2026-06-07). The map page's left rail wants a curated, short list
 * of categories so the sidebar is scannable next to the map and so the
 * (relatively long) Auction.category taxonomy doesn't bleed into 15+ rows.
 *
 * Curated keys (8):
 *   - vivienda            ← Viviendas
 *   - garaje-trastero     ← Garajes, Trasteros
 *   - solar-terreno       ← Terrenos
 *   - local-comercial     ← Locales
 *   - finca-rustica       ← Fincas rústicas
 *   - nave-industrial     ← Naves industriales
 *   - otros-inmuebles     ← Otros inmuebles
 *   - vehiculos           ← Turismos, Motocicletas, Vehículos Industriales,
 *                            Camiones, Barcos, Embarcaciones, Otros vehículos
 *
 * Catch-all (server-side, never sent from the chip):
 *   - otros               ← everything else (Maquinaria, Joyas, Arte,
 *                            off-taxonomy strings)
 *
 * Single source of truth for:
 *   - the `/api/auctions/counts?groupBy=mapCategory` aggregator
 *   - the `?mapCategory=<key>` filter on /api/auctions and /api/auctions/map
 *
 * Invariant: Σ(counts across all keys including "otros") === Σ(all rows
 * matched by the rest of the filter set). Nothing silently vanishes.
 *
 * Reuse note: the `vehiculos` set MUST match the carousel-mix MOVABLE vehicle
 * subset (see `OFFICIAL_CATEGORIES.MOVABLE` in `lib/constants.ts`). Vehicles
 * are the SUBSET of MOVABLE that are road/water/air vehicles — NOT all of
 * MOVABLE (which also contains Maquinaria/Joyas/Arte). Keep the two in sync
 * if the upstream taxonomy widens (e.g. new "Aeronaves" label).
 */

/** Curated keys the chip emits (never includes "otros" — server-side fallback only). */
export type MapCategoryKey =
  | 'vivienda'
  | 'garaje-trastero'
  | 'solar-terreno'
  | 'local-comercial'
  | 'finca-rustica'
  | 'nave-industrial'
  | 'otros-inmuebles'
  | 'vehiculos';

/** Server-side catch-all key for rows that don't match any curated key. */
export const MAP_CATEGORY_OTROS = 'otros' as const;

/** Curated key → exact DB Auction.category labels (UNION semantics). */
export const MAP_CATEGORY_TO_DB_LABELS: Readonly<Record<MapCategoryKey, readonly string[]>> = {
  vivienda: ['Viviendas'],
  'garaje-trastero': ['Garajes', 'Trasteros'],
  'solar-terreno': ['Terrenos'],
  'local-comercial': ['Locales'],
  'finca-rustica': ['Fincas rústicas'],
  'nave-industrial': ['Naves industriales'],
  'otros-inmuebles': ['Otros inmuebles'],
  // Vehicles only — Maquinaria / Joyas / Arte fall into "otros".
  vehiculos: [
    'Turismos',
    'Motocicletas',
    'Vehículos Industriales',
    'Camiones',
    'Barcos',
    'Embarcaciones',
    'Otros vehículos',
  ],
};

/** Display label per curated key (used by the sidebar legend if it asks). */
export const MAP_CATEGORY_LABEL: Readonly<Record<MapCategoryKey | typeof MAP_CATEGORY_OTROS, string>> = {
  vivienda: 'Vivienda',
  'garaje-trastero': 'Garaje/Trastero',
  'solar-terreno': 'Solar/Terreno',
  'local-comercial': 'Local comercial',
  'finca-rustica': 'Finca rústica',
  'nave-industrial': 'Nave industrial',
  'otros-inmuebles': 'Otros inmuebles',
  vehiculos: 'Vehículos',
  otros: 'Otros',
};

/** All curated keys in display order. */
export const MAP_CATEGORY_KEYS: ReadonlyArray<MapCategoryKey> = [
  'vivienda',
  'garaje-trastero',
  'solar-terreno',
  'local-comercial',
  'finca-rustica',
  'nave-industrial',
  'otros-inmuebles',
  'vehiculos',
];

/** Reverse lookup: DB label → curated key. Off-taxonomy labels return null. */
const DB_LABEL_TO_MAP_KEY: Map<string, MapCategoryKey> = (() => {
  const m = new Map<string, MapCategoryKey>();
  for (const key of MAP_CATEGORY_KEYS) {
    for (const label of MAP_CATEGORY_TO_DB_LABELS[key]) m.set(label, key);
  }
  return m;
})();

/**
 * Map a raw DB category string to its curated key, or `'otros'` for
 * anything off-taxonomy / null / blank. Used by the counts aggregator.
 */
export function dbCategoryToMapKey(raw: string | null | undefined): MapCategoryKey | typeof MAP_CATEGORY_OTROS {
  if (!raw) return MAP_CATEGORY_OTROS;
  return DB_LABEL_TO_MAP_KEY.get(raw) ?? MAP_CATEGORY_OTROS;
}

/**
 * Resolve a curated key (as sent on `?mapCategory=<key>`) to the DB
 * category labels it expands to. Returns null for "otros" (no
 * deterministic SQL IN-list — see `isMapCategoryOtros` below) and null
 * for unknown keys (caller should ignore the filter rather than send
 * `1=0`).
 */
export function mapCategoryToDbLabels(key: string | null | undefined): readonly string[] | null {
  if (!key) return null;
  if (key === MAP_CATEGORY_OTROS) return null;
  const labels = (MAP_CATEGORY_TO_DB_LABELS as Record<string, readonly string[] | undefined>)[key];
  return labels ?? null;
}

/** True when the caller asked specifically for the "otros" catch-all bucket. */
export function isMapCategoryOtros(key: string | null | undefined): boolean {
  return key === MAP_CATEGORY_OTROS;
}

/** All DB labels that DO map to a curated key (used for the NOT IN list of "otros"). */
export const MAP_CATEGORY_ALL_KNOWN_DB_LABELS: ReadonlyArray<string> = (() => {
  const set = new Set<string>();
  for (const key of MAP_CATEGORY_KEYS) {
    for (const label of MAP_CATEGORY_TO_DB_LABELS[key]) set.add(label);
  }
  return Array.from(set);
})();
