/**
 * Canonical Spanish province whitelist (50 provincias + Ceuta + Melilla).
 *
 * Used by API layer to:
 *  - reject "CP …" / postal-code junk values that crept into Auction.province
 *    via early scraper passes (real provinces only — never numbers).
 *  - present a stable, ordered set to the front-end province dropdown.
 *
 * `label` is what the UI renders. `key` is what we expect to find in
 * Auction.province (some Basque/Galician provinces appear under their
 * native spelling in the database, hence the divergence for Gipuzkoa /
 * Bizkaia). Match is case + accent-insensitive (see `isCanonicalProvince`).
 *
 * Source of truth: mirrors `PROVINCES` in src/components/dashboard/ProvinceGrid.tsx.
 * If you change one, change the other.
 */

export type CanonicalProvince = { label: string; key: string };

export const SPAIN_PROVINCES: ReadonlyArray<CanonicalProvince> = [
  { label: 'A Coruña', key: 'A Coruña' },
  { label: 'Álava', key: 'Álava' },
  { label: 'Albacete', key: 'Albacete' },
  { label: 'Alicante', key: 'Alicante' },
  { label: 'Almería', key: 'Almería' },
  { label: 'Asturias', key: 'Asturias' },
  { label: 'Ávila', key: 'Ávila' },
  { label: 'Badajoz', key: 'Badajoz' },
  { label: 'Barcelona', key: 'Barcelona' },
  { label: 'Burgos', key: 'Burgos' },
  { label: 'Cáceres', key: 'Cáceres' },
  { label: 'Cádiz', key: 'Cádiz' },
  { label: 'Cantabria', key: 'Cantabria' },
  { label: 'Castellón', key: 'Castellón' },
  { label: 'Ceuta', key: 'Ceuta' },
  { label: 'Ciudad Real', key: 'Ciudad Real' },
  { label: 'Córdoba', key: 'Córdoba' },
  { label: 'Cuenca', key: 'Cuenca' },
  { label: 'Girona', key: 'Girona' },
  { label: 'Granada', key: 'Granada' },
  { label: 'Guadalajara', key: 'Guadalajara' },
  { label: 'Guipúzcoa', key: 'Gipuzkoa' },
  { label: 'Huelva', key: 'Huelva' },
  { label: 'Huesca', key: 'Huesca' },
  { label: 'Illes Balears', key: 'Illes Balears' },
  { label: 'Jaén', key: 'Jaén' },
  { label: 'León', key: 'León' },
  { label: 'Lleida', key: 'Lleida' },
  { label: 'Lugo', key: 'Lugo' },
  { label: 'Madrid', key: 'Madrid' },
  { label: 'Málaga', key: 'Málaga' },
  { label: 'Melilla', key: 'Melilla' },
  { label: 'Murcia', key: 'Murcia' },
  { label: 'Navarra', key: 'Navarra' },
  { label: 'Ourense', key: 'Ourense' },
  { label: 'Palencia', key: 'Palencia' },
  { label: 'Las Palmas', key: 'Las Palmas' },
  { label: 'Pontevedra', key: 'Pontevedra' },
  { label: 'La Rioja', key: 'La Rioja' },
  { label: 'Salamanca', key: 'Salamanca' },
  { label: 'Segovia', key: 'Segovia' },
  { label: 'Sevilla', key: 'Sevilla' },
  { label: 'Soria', key: 'Soria' },
  { label: 'Tarragona', key: 'Tarragona' },
  { label: 'Santa Cruz de Tenerife', key: 'Santa Cruz de Tenerife' },
  { label: 'Teruel', key: 'Teruel' },
  { label: 'Toledo', key: 'Toledo' },
  { label: 'Valencia', key: 'Valencia' },
  { label: 'Valladolid', key: 'Valladolid' },
  { label: 'Vizcaya', key: 'Bizkaia' },
  { label: 'Zamora', key: 'Zamora' },
  { label: 'Zaragoza', key: 'Zaragoza' },
];

/** Lower-case, accent-stripped form for fuzzy matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Pre-built lookup of every accepted spelling (label OR key) per canonical row.
const ALIAS_TO_CANONICAL: Map<string, CanonicalProvince> = (() => {
  const m = new Map<string, CanonicalProvince>();
  for (const p of SPAIN_PROVINCES) {
    m.set(normalize(p.label), p);
    m.set(normalize(p.key), p);
  }
  return m;
})();

/**
 * Returns true iff the supplied value is one of the 52 real Spanish provinces.
 * Junk like "CP 28013", "12345", "" → false.
 */
export function isCanonicalProvince(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const n = normalize(raw);
  if (!n) return false;
  // Reject anything that looks like a postal-code or numeric junk.
  if (/^\d+$/.test(n)) return false;
  if (/^cp[\s\-]*\d/.test(n)) return false;
  if (/^codigo[\s\-]*postal/.test(n)) return false;
  return ALIAS_TO_CANONICAL.has(n);
}

/** Map any accepted spelling to its canonical {label, key} row, or null. */
export function toCanonicalProvince(raw: string | null | undefined): CanonicalProvince | null {
  if (!raw) return null;
  return ALIAS_TO_CANONICAL.get(normalize(raw)) ?? null;
}

/** All DB-side keys (what we expect to actually appear in Auction.province). */
export const CANONICAL_PROVINCE_KEYS: ReadonlyArray<string> = SPAIN_PROVINCES.map((p) => p.key);
