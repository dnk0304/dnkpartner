/**
 * Filter taxonomy + URL <-> state helpers used by SimpleFilters,
 * AdvancedFiltersSheet, and the list page.
 *
 * Source of truth for "what does a filter look like" — keeps the simple
 * sidebar, the advanced sheet, and the chip strip from drifting.
 */

import { AuctionCategory, AuctionStatus, AuctionType } from "@/types";

/** Broad category → list of underlying AuctionCategory values. */
export const SIMPLE_KIND_OPTIONS: Array<{
  id: "todo" | "vivienda" | "vehiculo" | "local" | "terreno";
  label: string;
  /** Categories from the source taxonomy this bucket maps onto. */
  categories: AuctionCategory[];
}> = [
  { id: "todo", label: "Todo", categories: [] },
  {
    id: "vivienda",
    label: "Vivienda",
    categories: ["Viviendas", "Otros inmuebles"],
  },
  {
    id: "vehiculo",
    label: "Vehículo",
    categories: ["Turismos", "Motocicletas", "Vehículos Industriales", "Barcos"],
  },
  {
    id: "local",
    label: "Local",
    categories: ["Locales", "Naves industriales", "Garajes", "Trasteros"],
  },
  {
    id: "terreno",
    label: "Terreno",
    categories: ["Terrenos", "Fincas rústicas"],
  },
];

/** Simple "¿Cuándo?" buckets — map onto the API's `statuses` param. */
export const SIMPLE_WHEN_OPTIONS: Array<{
  id: "activas" | "proximas" | "finalizadas";
  label: string;
  statuses: AuctionStatus[];
}> = [
  { id: "activas", label: "Activas ahora", statuses: ["celebrandose"] },
  { id: "proximas", label: "Próximas", statuses: ["proxima-apertura"] },
  {
    id: "finalizadas",
    label: "Finalizadas",
    statuses: ["concluida-portal", "finalizada-autoridad", "cancelada"],
  },
];

/** The full 6 BOE statuses for the advanced sheet. */
export const ALL_STATUSES: Array<{ id: AuctionStatus; label: string }> = [
  { id: "proxima-apertura", label: "Próxima apertura" },
  { id: "celebrandose", label: "Celebrándose" },
  { id: "suspendida", label: "Suspendida" },
  { id: "cancelada", label: "Cancelada" },
  { id: "concluida-portal", label: "Concluida (Portal)" },
  { id: "finalizada-autoridad", label: "Finalizada (Autoridad)" },
];

/**
 * All auction types — Spanish labels + short (chip-friendly) labels.
 *
 * Order matches BOE "Tipo de subasta" listing density: judicial is by far the
 * largest family (~1.1k active), then AEAT, then otras tributarias, notarial,
 * administrativas. Bancaria is reserved for a future source.
 *
 * Legacy singular ids (`tributaria` / `administrativa`) are intentionally
 * omitted from this list — the API folds them into the canonical plural ids
 * before they ever reach the UI. Including them here would mean two chips
 * for the same BOE family.
 */
export const ALL_TYPES: Array<{
  id: AuctionType;
  /** Long form — e.g. used inside the Advanced Filters sheet. */
  label: string;
  /** Short form — used on chips + card badges where space is tight. */
  shortLabel: string;
}> = [
  { id: "judicial",          label: "Judicial",                 shortLabel: "Judicial" },
  { id: "aeat",              label: "Hacienda (AEAT)",          shortLabel: "Hacienda" },
  { id: "otras_tributarias", label: "Otras tributarias",        shortLabel: "Otras trib." },
  { id: "notarial",          label: "Notarial",                 shortLabel: "Notarial" },
  { id: "administrativas",   label: "Administrativas",          shortLabel: "Admin." },
  { id: "bancaria",          label: "Bancaria",                 shortLabel: "Bancaria" },
];

/** Quick lookup by id — used by chips/badges to render Spanish labels. */
export const AUCTION_TYPE_LABEL: Record<string, { label: string; shortLabel: string }> = (() => {
  const m: Record<string, { label: string; shortLabel: string }> = {};
  for (const t of ALL_TYPES) m[t.id] = { label: t.label, shortLabel: t.shortLabel };
  // Fold legacy singular ids onto the same canonical label, in case a stale
  // URL or older API response still carries them.
  m["tributaria"] = m["otras_tributarias"];
  m["administrativa"] = m["administrativas"];
  return m;
})();

/** Sort options — match Forge's whitelisted values on /api/auctions. */
export type SortValue = "category_rank" | "endsAt_asc" | "published_desc" | "price_asc" | "price_desc";
export const SORT_OPTIONS: Array<{ id: SortValue; label: string }> = [
  { id: "category_rank", label: "Destacados" },
  { id: "endsAt_asc", label: "Termina antes" },
  { id: "published_desc", label: "Más recientes" },
  { id: "price_asc", label: "Precio: menor a mayor" },
  { id: "price_desc", label: "Precio: mayor a menor" },
];
/** Server default — must match Forge's API default so SSR/CSR agree. */
export const DEFAULT_SORT: SortValue = "category_rank";

/** All precise categories. */
export const ALL_CATEGORIES: AuctionCategory[] = [
  "Viviendas",
  "Locales",
  "Garajes",
  "Trasteros",
  "Terrenos",
  "Fincas rústicas",
  "Naves industriales",
  "Otros inmuebles",
  "Turismos",
  "Motocicletas",
  "Vehículos Industriales",
  "Barcos",
  "Maquinaria",
  "Joyas",
  "Arte",
];

export type ObservatoryFilters = {
  search: string;
  /** Broad simple bucket id. "todo" means no restriction. */
  kind: "todo" | "vivienda" | "vehiculo" | "local" | "terreno";
  /** Province (single — UX vision says one at a time). */
  province: string;
  /** Municipality (depends on province). */
  municipality: string;
  /** Simple when-bucket id. */
  when: "activas" | "proximas" | "finalizadas";
  /** Min/max price (puja actual). */
  priceMin: number | null;
  priceMax: number | null;
  // --- Advanced ---
  /** Precise category list (overrides broad kind when non-empty). */
  categories: AuctionCategory[];
  /** Precise status list (overrides simple when-bucket when non-empty). */
  statuses: AuctionStatus[];
  /** Auction type list. */
  types: AuctionType[];
  /** Sort order — defaults to endsAt_asc (server default too). */
  sort: SortValue;
  /** When true, show the full SimpleFilters/AdvancedFilters surface; when false, only PresetRow + ActiveFilterChips. */
  advanced: boolean;
  // --- P1 advanced filter params (Forge-backed) ---
  /** Max % of appraisal (currentBid/appraisal*100). e.g. 70 → "≤70% tasación". */
  pctTasacionMax: number | null;
  /** ISO timestamp — only auctions ending before this date. */
  endsBefore: string | null;
  /** When true, restrict to rows that have a real photo. */
  hasImage: boolean;
};

export const DEFAULT_FILTERS: ObservatoryFilters = {
  search: "",
  kind: "todo",
  province: "",
  municipality: "",
  when: "activas",
  priceMin: null,
  priceMax: null,
  categories: [],
  statuses: [],
  types: [],
  sort: DEFAULT_SORT,
  advanced: false,
  pctTasacionMax: null,
  endsBefore: null,
  hasImage: false,
};

const VALID_SORTS: SortValue[] = ["category_rank", "endsAt_asc", "published_desc", "price_asc", "price_desc"];

/** Read an ObservatoryFilters from URLSearchParams. */
export function filtersFromParams(p: URLSearchParams): ObservatoryFilters {
  const num = (v: string | null): number | null => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    search: p.get("search") ?? "",
    kind: (p.get("kind") as ObservatoryFilters["kind"]) || "todo",
    province: p.get("province") ?? "",
    municipality: p.get("municipality") ?? "",
    when: (p.get("when") as ObservatoryFilters["when"]) || "activas",
    priceMin: num(p.get("priceMin")),
    priceMax: num(p.get("priceMax")),
    categories: (p.get("categories")?.split(",").filter(Boolean) as AuctionCategory[]) ?? [],
    statuses: (p.get("statuses")?.split(",").filter(Boolean) as AuctionStatus[]) ?? [],
    types: (p.get("types")?.split(",").filter(Boolean) as AuctionType[]) ?? [],
    sort: ((): SortValue => {
      const raw = p.get("sort");
      return raw && (VALID_SORTS as string[]).includes(raw) ? (raw as SortValue) : DEFAULT_SORT;
    })(),
    advanced: p.get("advanced") === "1",
    pctTasacionMax: num(p.get("pctTasacionMax")),
    endsBefore: p.get("endsBefore") || null,
    hasImage: p.get("hasImage") === "true",
  };
}

/** Serialize an ObservatoryFilters back into URLSearchParams (only non-defaults). */
export function paramsFromFilters(f: ObservatoryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("search", f.search);
  if (f.kind !== "todo") p.set("kind", f.kind);
  if (f.province) p.set("province", f.province);
  if (f.municipality) p.set("municipality", f.municipality);
  if (f.when !== "activas") p.set("when", f.when);
  if (f.priceMin != null) p.set("priceMin", String(f.priceMin));
  if (f.priceMax != null) p.set("priceMax", String(f.priceMax));
  if (f.categories.length) p.set("categories", f.categories.join(","));
  if (f.statuses.length) p.set("statuses", f.statuses.join(","));
  if (f.types.length) p.set("types", f.types.join(","));
  if (f.sort && f.sort !== DEFAULT_SORT) p.set("sort", f.sort);
  if (f.advanced) p.set("advanced", "1");
  if (f.pctTasacionMax != null) p.set("pctTasacionMax", String(f.pctTasacionMax));
  if (f.endsBefore) p.set("endsBefore", f.endsBefore);
  if (f.hasImage) p.set("hasImage", "true");
  return p;
}

/**
 * Translate the high-level ObservatoryFilters into the shape the existing
 * /api/auctions endpoint expects. (Keeps the API layer untouched.)
 *
 * Mapping rules:
 *   - if precise categories[] is non-empty -> use first as `category=`,
 *     and we filter client-side for the rest (existing list does this).
 *   - else broad kind maps to its underlying categories — but the API
 *     only supports single `category`, so for the simple "Vivienda" etc.
 *     we expand client-side. To keep server filtering fast, if the
 *     broad bucket has exactly 1 category (e.g. Terreno → 2), we set the
 *     first; client filter handles the rest.
 *   - statuses precedence: explicit advanced statuses[] > simple when-bucket.
 *   - types[] -> `auctionTypes=...`
 */
export function filtersToApiParams(f: ObservatoryFilters): URLSearchParams {
  const p = new URLSearchParams();

  // Categories — prefer the new multi-`categories` rollup param when >1; fall back to
  // single `category` for exact-match buckets.
  if (f.categories.length === 1) {
    p.set("category", f.categories[0]);
  } else if (f.categories.length > 1) {
    p.set("categories", f.categories.join(","));
  } else {
    const bucket = SIMPLE_KIND_OPTIONS.find((b) => b.id === f.kind);
    if (bucket && bucket.categories.length === 1) {
      p.set("category", bucket.categories[0]);
    } else if (bucket && bucket.categories.length > 1) {
      // Multi-cat broad bucket — use the new multi-`categories` param so the
      // server narrows the page instead of relying purely on client post-filter.
      p.set("categories", bucket.categories.join(","));
    }
  }

  // Province
  if (f.province) p.set("province", f.province);

  // Statuses precedence
  if (f.statuses.length > 0) {
    p.set("statuses", f.statuses.join(","));
  } else {
    const bucket = SIMPLE_WHEN_OPTIONS.find((b) => b.id === f.when);
    if (bucket) p.set("statuses", bucket.statuses.join(","));
  }

  // Types
  if (f.types.length > 0) {
    p.set("auctionTypes", f.types.join(","));
  }

  // P1 advanced filter params (Forge-backed). Skipping null/false keeps the URL clean.
  if (f.priceMax != null) p.set("priceMax", String(f.priceMax));
  if (f.pctTasacionMax != null) p.set("pctTasacionMax", String(f.pctTasacionMax));
  if (f.endsBefore) p.set("endsBefore", f.endsBefore);
  if (f.hasImage) p.set("hasImage", "true");

  // Sort — always send so SSR/CSR stay deterministic. Server default matches DEFAULT_SORT.
  if (f.sort) p.set("sort", f.sort);

  return p;
}

/** Returns true if filters are at their defaults (no narrowing applied). */
export function isDefaultFilters(f: ObservatoryFilters): boolean {
  return (
    !f.search &&
    f.kind === "todo" &&
    !f.province &&
    !f.municipality &&
    f.when === "activas" &&
    f.priceMin == null &&
    f.priceMax == null &&
    f.categories.length === 0 &&
    f.statuses.length === 0 &&
    f.types.length === 0 &&
    f.sort === DEFAULT_SORT &&
    f.pctTasacionMax == null &&
    !f.endsBefore &&
    !f.hasImage
  );
}

/** Vehicle rollup — every category that belongs in "Coches y vehículos". */
export const VEHICLE_CATEGORIES: AuctionCategory[] = [
  "Turismos",
  "Motocicletas",
  "Vehículos Industriales",
  "Barcos",
];

/** Preset identifiers — P0 (first 4) + BOE family quick-picks + P1 advanced. */
export type PresetId =
  | "viviendas-activas"
  | "coches"
  | "por-provincia"
  | "judiciales-boe"
  // BOE family quick-picks — added when the per-category scrapers went live.
  | "notariales-boe"
  | "aeat-boe"
  | "otras-tributarias-boe"
  | "administrativas-boe"
  // P1 advanced
  | "viviendas-baratas"
  | "bajo-tasacion"
  | "termina-semana"
  | "solo-con-foto";

/**
 * Compute an ISO timestamp `days` ahead of `from`. Pure helper so isPresetActive
 * stays deterministic when called from the same render as the click handler.
 */
function isoDaysFromNow(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Bundle applied when a preset is clicked. All other filter dims reset to defaults. */
export function presetFilters(id: PresetId, opts?: { province?: string; now?: Date }): Partial<ObservatoryFilters> {
  // Common reset — every preset starts from defaults, then overrides.
  const base: Partial<ObservatoryFilters> = {
    search: "",
    kind: "todo",
    province: "",
    municipality: "",
    when: "activas",
    priceMin: null,
    priceMax: null,
    categories: [],
    statuses: [],
    types: [],
    pctTasacionMax: null,
    endsBefore: null,
    hasImage: false,
  };
  switch (id) {
    case "viviendas-activas":
      return {
        ...base,
        categories: ["Viviendas"],
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "coches":
      // P1: full vehicle rollup via the new multi-`categories` API param.
      return {
        ...base,
        categories: VEHICLE_CATEGORIES,
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "por-provincia":
      return {
        ...base,
        province: opts?.province ?? "",
        statuses: ["celebrandose"],
      };
    case "judiciales-boe":
      return {
        ...base,
        types: ["judicial"],
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "notariales-boe":
      return {
        ...base,
        types: ["notarial"],
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "aeat-boe":
      return {
        ...base,
        types: ["aeat"],
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "otras-tributarias-boe":
      return {
        ...base,
        types: ["otras_tributarias"],
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "administrativas-boe":
      return {
        ...base,
        types: ["administrativas"],
        statuses: ["celebrandose", "proxima-apertura"],
      };
    case "viviendas-baratas":
      return {
        ...base,
        kind: "vivienda",
        categories: ["Viviendas"],
        statuses: ["celebrandose", "proxima-apertura"],
        priceMax: 100000,
      };
    case "bajo-tasacion":
      return {
        ...base,
        statuses: ["celebrandose", "proxima-apertura"],
        pctTasacionMax: 70,
      };
    case "termina-semana":
      return {
        ...base,
        statuses: ["celebrandose"],
        endsBefore: isoDaysFromNow(7, opts?.now),
      };
    case "solo-con-foto":
      return {
        ...base,
        statuses: ["celebrandose", "proxima-apertura"],
        hasImage: true,
      };
  }
}

/** True if the current filter state matches the preset's bundled patch (for active highlight). */
export function isPresetActive(f: ObservatoryFilters, id: PresetId, opts?: { province?: string }): boolean {
  const target = presetFilters(id, opts);
  return (Object.keys(target) as Array<keyof ObservatoryFilters>).every((k) => {
    const a = (f as any)[k];
    const b = (target as any)[k];
    // endsBefore for the "termina-semana" preset is computed at click-time, so the
    // exact ISO drifts second-by-second. Treat any present endsBefore inside a
    // generous +6h..+8d window from now as "this preset is active".
    if (k === "endsBefore" && id === "termina-semana") {
      if (!a) return false;
      const t = new Date(a).getTime();
      const now = Date.now();
      return t > now + 6 * 3600 * 1000 && t < now + 8 * 24 * 3600 * 1000;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      const sa = [...a].sort();
      const sb = [...b].sort();
      return sa.every((v, i) => v === sb[i]);
    }
    return a === b;
  });
}

/**
 * Client-side post-filter for things the API doesn't filter on yet:
 *   - search keyword across title
 *   - broad kind bucket with >1 category
 *   - price range
 *   - municipality (when API only narrowed to province)
 */
export function applyClientFilters<T extends {
  title: string;
  category: string;
  municipality?: string | null;
  currentBid?: number | null;
}>(items: T[], f: ObservatoryFilters): T[] {
  return items.filter((it) => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!it.title.toLowerCase().includes(q)) return false;
    }

    if (f.categories.length > 1) {
      if (!f.categories.includes(it.category as AuctionCategory)) return false;
    } else if (f.categories.length === 0) {
      const bucket = SIMPLE_KIND_OPTIONS.find((b) => b.id === f.kind);
      if (bucket && bucket.categories.length > 0) {
        if (!bucket.categories.includes(it.category as AuctionCategory)) return false;
      }
    }

    if (f.municipality && it.municipality) {
      const a = f.municipality.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const b = it.municipality.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (a !== b) return false;
    }

    if (f.priceMin != null && (it.currentBid ?? Infinity) < f.priceMin) return false;
    if (f.priceMax != null && (it.currentBid ?? 0) > f.priceMax) return false;

    return true;
  });
}
