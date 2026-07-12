/**
 * Guia article cover-image resolver — pure UI helper (no DB, no I/O).
 *
 * Pixel calls this at RENDER time on both the /blog card and the /guia/[slug]
 * header, passing the raw `imageUrl` + `cluster` returned by src/lib/articles.ts.
 * The data layer intentionally does NOT call this — it stays a reusable UI concern.
 *
 * Three-rung resolution:
 *   1. explicit per-article `imageUrl`      → use it            (isFallback:false)
 *   2. `cluster` maps to a themed cover      → /images/guia/cover-<theme>.webp
 *   3. no cluster / no match                 → cover-generic.webp (isFallback:true)
 *
 * Coordination: Vinci fills the EXACT files in THEME_COVER_FILES below; Pixel
 * renders whatever `src` this returns. Keep filenames in lockstep across agents.
 */

/** Normalized theme key → cover file. These 12 filenames are a fixed contract. */
export const THEME_COVER_FILES = {
  judicial: '/images/guia/cover-judicial.webp',
  vivienda: '/images/guia/cover-vivienda.webp',
  vehiculos: '/images/guia/cover-vehiculos.webp',
  hacienda: '/images/guia/cover-hacienda.webp',
  notarial: '/images/guia/cover-notarial.webp',
  pujas: '/images/guia/cover-pujas.webp',
  valoracion: '/images/guia/cover-valoracion.webp',
  deposito: '/images/guia/cover-deposito.webp',
  terreno: '/images/guia/cover-terreno.webp',
  comercial: '/images/guia/cover-comercial.webp',
  registro: '/images/guia/cover-registro.webp',
  generic: '/images/guia/cover-generic.webp',
} as const;

export type ThemeKey = keyof typeof THEME_COVER_FILES;

export const GENERIC_COVER = THEME_COVER_FILES.generic;

/**
 * Ordered keyword table: normalized substring → theme key. First hit wins, so
 * order matters where synonyms could overlap. Keys are accent-folded lowercase;
 * `cluster` is folded the same way before matching, so real DB labels like
 * "Vivienda", "vehículos", "Hacienda/AEAT" all resolve. Extend as Vinci adds
 * themes — DO NOT reorder existing rows without re-checking overlaps.
 */
const CLUSTER_KEYWORDS: ReadonlyArray<readonly [string, ThemeKey]> = [
  // how-to-bid / bidding mechanics (check before generic 'subasta' terms)
  ['puja', 'pujas'],
  ['pujar', 'pujas'],
  ['bidding', 'pujas'],
  ['electronica', 'pujas'],
  // valuation / appraisal
  ['valoracion', 'valoracion'],
  ['tasacion', 'valoracion'],
  ['avaluo', 'valoracion'],
  ['appraisal', 'valoracion'],
  // deposits / financing
  ['deposito', 'deposito'],
  ['financ', 'deposito'], // financiacion, financiar
  ['aval', 'deposito'],
  ['garantia', 'deposito'],
  // tax authority auctions
  ['hacienda', 'hacienda'],
  ['aeat', 'hacienda'],
  ['fiscal', 'hacienda'],
  ['tributar', 'hacienda'],
  ['impuesto', 'hacienda'],
  ['apremio', 'hacienda'],
  // notarial
  ['notari', 'notarial'], // notarial, notaria, notario
  // registration / registral process
  ['registr', 'registro'], // registro, registral, registrador, inscripcion-adjacent
  ['inscripcion', 'registro'],
  // judicial / court / seizure
  ['judicial', 'judicial'],
  ['juzgado', 'judicial'],
  ['embargo', 'judicial'],
  ['concurs', 'judicial'], // concurso, concursal
  // vehicles
  ['vehiculo', 'vehiculos'],
  ['coche', 'vehiculos'],
  ['moto', 'vehiculos'],
  ['furgoneta', 'vehiculos'],
  ['automovil', 'vehiculos'],
  // commercial / non-residential premises
  ['comercial', 'comercial'],
  ['nave', 'comercial'],
  ['local', 'comercial'],
  ['garaje', 'comercial'],
  ['trastero', 'comercial'],
  ['oficina', 'comercial'],
  // land / rustic
  ['terreno', 'terreno'],
  ['rustic', 'terreno'], // rustica, rustico
  ['finca', 'terreno'],
  ['parcela', 'terreno'],
  ['solar', 'terreno'],
  // residential housing (broad — keep late so specific types win first)
  ['vivienda', 'vivienda'],
  ['piso', 'vivienda'],
  ['casa', 'vivienda'],
  ['apartamento', 'vivienda'],
  ['inmueble', 'vivienda'],
  ['hipotecar', 'vivienda'], // hipotecaria auctions are residential in practice
];

/** Accent-fold + lowercase + collapse whitespace. Empty/nullish → ''. */
function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Map a raw `cluster` label to a theme key, or `null` if nothing matches.
 * Tries an exact theme-key hit first, then ordered substring keywords.
 */
export function clusterToThemeKey(cluster: string | null | undefined): ThemeKey | null {
  const norm = normalize(cluster);
  if (!norm) return null;
  // exact theme key (e.g. cluster already stored as "vivienda")
  if (norm in THEME_COVER_FILES && norm !== 'generic') {
    return norm as ThemeKey;
  }
  for (const [needle, theme] of CLUSTER_KEYWORDS) {
    if (norm.includes(needle)) return theme;
  }
  return null;
}

export type ResolvedCover = { src: string; isFallback: boolean };

/**
 * Resolve the cover image for an article.
 * @returns `{ src, isFallback }` — `isFallback:false` only when an explicit
 *          per-article `imageUrl` was supplied.
 */
export function resolveArticleCoverImage(input: {
  imageUrl?: string | null;
  cluster?: string | null;
  slug: string;
}): ResolvedCover {
  const explicit = input.imageUrl?.trim();
  if (explicit) {
    return { src: explicit, isFallback: false };
  }
  const theme = clusterToThemeKey(input.cluster);
  if (theme) {
    return { src: THEME_COVER_FILES[theme], isFallback: true };
  }
  return { src: GENERIC_COVER, isFallback: true };
}
