/**
 * map-category.ts — "map sidebar" taxonomy + 2-level category-group tree.
 *
 * Wave79 (2026-06-07): introduced a curated, short map-sidebar taxonomy so the
 * left rail stays scannable next to the map (the raw Auction.category taxonomy
 * is 18 labels — too long for a flat rail).
 *
 * Wave92+ (2026-06-08, FORGE category-groups): promoted the flat curated list
 * into a TWO-LEVEL tree:
 *
 *   Inmuebles    → Vivienda · Garaje/Trastero · Solar/Terreno · Local comercial
 *                  · Finca rústica · Nave industrial · Otros inmuebles
 *   Vehículos    → Coche/Turismo · Moto · Camión · Barco/Embarcación
 *                  · Otros vehículos
 *   Otros bienes → Maquinaria · Joyas · Arte · Otros (off-taxonomy catch-all)
 *
 * The single `vehiculos` bucket was split into per-type LEAVES so each vehicle
 * type is its own selectable row, while a whole-"Vehículos" group filter is
 * still expressible (see `categoryGroupToDbLabels`). Maquinaria/Joyas/Arte were
 * promoted from the server-side `otros` catch-all into named leaves so they get
 * honest counts + their own chip; the bare `otros` key remains the true
 * off-taxonomy / null catch-all leaf under "Otros bienes".
 *
 * NO MIGRATION — this is a pure UI-grouping/display layer over the existing
 * Auction.category string taxonomy. No Prisma, no DB, no scheduler.
 *
 * Single source of truth for:
 *   - the `/api/auctions/counts?groupBy=mapCategory` aggregator (iterates the
 *     reverse-lookup fold, so the finer leaf keys are emitted automatically)
 *   - the `?mapCategory=<key>` filter on /api/auctions and /api/auctions/map
 *   - the 2-level group tree the sidebar UI renders (Pixel consumes
 *     CATEGORY_GROUPS + CATEGORY_GROUP_IDS)
 *
 * Invariant: Σ(counts across all leaf keys including "otros") === Σ(all rows
 * matched by the rest of the filter set). Every DB label routes to exactly one
 * leaf; nothing silently vanishes.
 *
 * Reuse note: the vehicle leaves' DB labels MUST stay the SUBSET of MOVABLE
 * that are road/water/air vehicles (NOT Maquinaria/Joyas/Arte, which are their
 * own leaves now). Keep in sync if the upstream taxonomy widens (e.g. a new
 * "Aeronaves" label) — add a leaf, wire it into the right group's children.
 */

/**
 * Curated leaf keys the chip emits on `?mapCategory=<key>`.
 * (Never includes "otros" — that's the server-side catch-all fallback only.)
 *
 * Wave92+: the former single `vehiculos` key was split into
 * coche/moto/camion/barco/otros-vehiculos, and maquinaria/joyas/arte were
 * promoted from the `otros` catch-all into first-class leaves.
 */
export type MapCategoryKey =
  // Inmuebles
  | 'vivienda'
  | 'garaje-trastero'
  | 'solar-terreno'
  | 'local-comercial'
  | 'finca-rustica'
  | 'nave-industrial'
  | 'otros-inmuebles'
  // Vehículos (split out of the legacy single `vehiculos` bucket)
  | 'coche'
  | 'moto'
  | 'camion'
  | 'barco'
  | 'otros-vehiculos'
  // Otros bienes (promoted from the server `otros` catch-all)
  | 'maquinaria'
  | 'joyas'
  | 'arte';

/** Server-side catch-all key for rows that don't match any curated leaf. */
export const MAP_CATEGORY_OTROS = 'otros' as const;

/** Curated leaf key → exact DB Auction.category labels (UNION semantics). */
export const MAP_CATEGORY_TO_DB_LABELS: Readonly<Record<MapCategoryKey, readonly string[]>> = {
  // Inmuebles
  vivienda: ['Viviendas'],
  'garaje-trastero': ['Garajes', 'Trasteros'],
  'solar-terreno': ['Terrenos'],
  'local-comercial': ['Locales'],
  'finca-rustica': ['Fincas rústicas'],
  'nave-industrial': ['Naves industriales'],
  'otros-inmuebles': ['Otros inmuebles'],
  // Vehículos — each leaf is one selectable vehicle type. `camion` folds the
  // legacy `Vehículos Industriales` label in with `Camiones` (same row class).
  coche: ['Turismos'],
  moto: ['Motocicletas'],
  camion: ['Camiones', 'Vehículos Industriales'],
  barco: ['Barcos', 'Embarcaciones'],
  'otros-vehiculos': ['Otros vehículos'],
  // Otros bienes — now named leaves (were silently bucketed into `otros`).
  maquinaria: ['Maquinaria'],
  joyas: ['Joyas'],
  arte: ['Arte'],
};

/** Display label per curated leaf key (+ the otros catch-all). */
export const MAP_CATEGORY_LABEL: Readonly<Record<MapCategoryKey | typeof MAP_CATEGORY_OTROS, string>> = {
  // Inmuebles
  vivienda: 'Vivienda',
  'garaje-trastero': 'Garaje/Trastero',
  'solar-terreno': 'Solar/Terreno',
  'local-comercial': 'Local comercial',
  'finca-rustica': 'Finca rústica',
  'nave-industrial': 'Nave industrial',
  'otros-inmuebles': 'Otros inmuebles',
  // Vehículos
  coche: 'Coche/Turismo',
  moto: 'Moto',
  camion: 'Camión',
  barco: 'Barco/Embarcación',
  'otros-vehiculos': 'Otros vehículos',
  // Otros bienes
  maquinaria: 'Maquinaria',
  joyas: 'Joyas',
  arte: 'Arte',
  otros: 'Otros',
};

/** All curated leaf keys in display order (grouped by top-level group). */
export const MAP_CATEGORY_KEYS: ReadonlyArray<MapCategoryKey> = [
  // Inmuebles
  'vivienda',
  'garaje-trastero',
  'solar-terreno',
  'local-comercial',
  'finca-rustica',
  'nave-industrial',
  'otros-inmuebles',
  // Vehículos
  'coche',
  'moto',
  'camion',
  'barco',
  'otros-vehiculos',
  // Otros bienes
  'maquinaria',
  'joyas',
  'arte',
];

// ───────────────────────────────────────────────────────────────────────────
// TOP-LEVEL GROUP TREE (Wave92+, FORGE category-groups)
// ───────────────────────────────────────────────────────────────────────────

/** The three top-level category groups. */
export type CategoryGroupId = 'inmuebles' | 'vehiculos' | 'otros-bienes';

/**
 * A leaf entry inside a group's `children` array. `kind: 'leaf'` rows expand
 * to a deterministic DB IN-list; `kind: 'otros'` is the off-taxonomy catch-all
 * (no IN-list — filtered via the `isMapCategoryOtros` NOT-IN path).
 */
export type CategoryGroupChild =
  | { kind: 'leaf'; key: MapCategoryKey }
  | { kind: 'otros'; key: typeof MAP_CATEGORY_OTROS };

/**
 * Top-level group → ordered children (leaves + the otros catch-all).
 *
 * Filtering contract for the UI (Pixel):
 *   - A LEAF click sends the existing `?mapCategory=<key>` (single curated key).
 *   - A whole-GROUP click sends the existing multi-`categories=<csv>` param,
 *     where the CSV is `categoryGroupToDbLabels(groupId)` (the union of every
 *     named leaf's DB labels). NO new API param is needed.
 *   - The `otros` catch-all under "Otros bienes" is a LEAF the user can pick
 *     individually via `?mapCategory=otros`; it is NOT part of the whole-group
 *     `categories=` CSV (it has no deterministic IN-list — see
 *     `categoryGroupToDbLabels`).
 */
export const CATEGORY_GROUPS: Readonly<
  Record<CategoryGroupId, { label: string; children: ReadonlyArray<CategoryGroupChild> }>
> = {
  inmuebles: {
    label: 'Inmuebles',
    children: [
      { kind: 'leaf', key: 'vivienda' },
      { kind: 'leaf', key: 'garaje-trastero' },
      { kind: 'leaf', key: 'solar-terreno' },
      { kind: 'leaf', key: 'local-comercial' },
      { kind: 'leaf', key: 'finca-rustica' },
      { kind: 'leaf', key: 'nave-industrial' },
      { kind: 'leaf', key: 'otros-inmuebles' },
    ],
  },
  vehiculos: {
    label: 'Vehículos',
    children: [
      { kind: 'leaf', key: 'coche' },
      { kind: 'leaf', key: 'moto' },
      { kind: 'leaf', key: 'camion' },
      { kind: 'leaf', key: 'barco' },
      { kind: 'leaf', key: 'otros-vehiculos' },
    ],
  },
  'otros-bienes': {
    label: 'Otros bienes',
    children: [
      { kind: 'leaf', key: 'maquinaria' },
      { kind: 'leaf', key: 'joyas' },
      { kind: 'leaf', key: 'arte' },
      { kind: 'otros', key: MAP_CATEGORY_OTROS },
    ],
  },
};

/** All top-level group ids in display order. */
export const CATEGORY_GROUP_IDS: ReadonlyArray<CategoryGroupId> = [
  'inmuebles',
  'vehiculos',
  'otros-bienes',
];

/** Display label per top-level group. */
export const CATEGORY_GROUP_LABEL: Readonly<Record<CategoryGroupId, string>> = {
  inmuebles: 'Inmuebles',
  vehiculos: 'Vehículos',
  'otros-bienes': 'Otros bienes',
};

/**
 * Expand a top-level group → all of its DB labels (the union of every NAMED
 * leaf child's `MAP_CATEGORY_TO_DB_LABELS`). The `otros` catch-all child is
 * EXCLUDED — it has no deterministic IN-list (same rule as
 * `mapCategoryToDbLabels` returning null for "otros"); a user who wants the
 * true-otros rows picks that leaf individually via `?mapCategory=otros`.
 *
 * This is exactly the CSV the UI sends as `categories=<labels.join(',')>` for a
 * whole-group filter — `/api/auctions` already does `category IN (...)` over it.
 */
export function categoryGroupToDbLabels(group: CategoryGroupId): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const child of CATEGORY_GROUPS[group].children) {
    if (child.kind !== 'leaf') continue;
    for (const label of MAP_CATEGORY_TO_DB_LABELS[child.key]) {
      if (!seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }
  }
  return out;
}

/** The leaf keys (excluding the otros catch-all) belonging to a group. */
export function categoryGroupLeafKeys(group: CategoryGroupId): readonly MapCategoryKey[] {
  return CATEGORY_GROUPS[group].children
    .filter((c): c is { kind: 'leaf'; key: MapCategoryKey } => c.kind === 'leaf')
    .map((c) => c.key);
}

// ───────────────────────────────────────────────────────────────────────────
// Reverse lookups + filter helpers (unchanged contract, finer keys)
// ───────────────────────────────────────────────────────────────────────────

/** Reverse lookup: DB label → curated leaf key. Off-taxonomy labels return null. */
const DB_LABEL_TO_MAP_KEY: Map<string, MapCategoryKey> = (() => {
  const m = new Map<string, MapCategoryKey>();
  for (const key of MAP_CATEGORY_KEYS) {
    for (const label of MAP_CATEGORY_TO_DB_LABELS[key]) {
      // Defensive: each DB label must route to exactly one leaf. A double-map
      // would corrupt the count=list invariant, so fail loud in dev.
      if (m.has(label)) {
        throw new Error(`map-category: DB label "${label}" mapped to multiple leaf keys`);
      }
      m.set(label, key);
    }
  }
  return m;
})();

/**
 * Map a raw DB category string to its curated leaf key, or `'otros'` for
 * anything off-taxonomy / null / blank. Used by the counts aggregator.
 */
export function dbCategoryToMapKey(raw: string | null | undefined): MapCategoryKey | typeof MAP_CATEGORY_OTROS {
  if (!raw) return MAP_CATEGORY_OTROS;
  return DB_LABEL_TO_MAP_KEY.get(raw) ?? MAP_CATEGORY_OTROS;
}

/**
 * Resolve a curated leaf key (as sent on `?mapCategory=<key>`) to the DB
 * category labels it expands to. Returns null for "otros" (no deterministic
 * SQL IN-list — see `isMapCategoryOtros`) and null for unknown keys (caller
 * should ignore the filter rather than send `1=0`).
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

/** All DB labels that DO map to a curated leaf key (used for the NOT IN list of "otros"). */
export const MAP_CATEGORY_ALL_KNOWN_DB_LABELS: ReadonlyArray<string> = (() => {
  const set = new Set<string>();
  for (const key of MAP_CATEGORY_KEYS) {
    for (const label of MAP_CATEGORY_TO_DB_LABELS[key]) set.add(label);
  }
  return Array.from(set);
})();
