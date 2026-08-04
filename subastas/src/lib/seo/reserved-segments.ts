/**
 * URL-v3 reserved-segment guard.
 *
 * A minted town/detail slug must never be able to shadow a real app route.
 * The reserved list is ENUMERATED FROM THE ACTUAL ROUTE TREE (see
 * `scripts/url-v3-reserved-guard.ts`), never from memory — a literal route
 * directory added later must break the build, not silently win the match at
 * runtime and blackhole a minted URL.
 *
 * The v3 detail URL shape is exactly four segments:
 *
 *     /subastas/{provinceSlug}/{townSlug}/{detailSegment}
 *          ^1        ^2            ^3           ^4
 *
 * Next.js resolves a LITERAL path segment in preference to a dynamic one, so
 * a minted slug that equals a sibling literal directory is unreachable. The
 * three lists below are the literal siblings of each dynamic segment.
 *
 * Kept as data (not a filesystem read) so it is usable in the edge runtime;
 * `scripts/url-v3-reserved-guard.ts` proves it still matches the route tree.
 */

/** Literal siblings of `src/app/subastas/[slug]` — cannot be a province slug. */
export const RESERVED_UNDER_SUBASTAS: readonly string[] = [
  'pagina',
  'subasta',
  'tipo',
];

/** Literal siblings of `src/app/subastas/[slug]/[municipio]` — cannot be a town slug. */
export const RESERVED_UNDER_PROVINCE: readonly string[] = ['pagina'];

/** Literal siblings of `src/app/subastas/[slug]/[municipio]/[detalle]` — cannot be a detail slug. */
export const RESERVED_UNDER_TOWN: readonly string[] = ['pagina'];

export type V3PathParts = {
  provinceSlug: string;
  townSlug: string;
  detailSegment: string;
};

/**
 * Split a v3 path into its parts, or null when it is not the v3 shape.
 * Strict: exactly four segments, leading `/subastas`, no empty segment.
 */
export function parseV3Path(pathname: string): V3PathParts | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 4) return null;
  if (parts[0] !== 'subastas') return null;
  const [, provinceSlug, townSlug, detailSegment] = parts;
  if (!provinceSlug || !townSlug || !detailSegment) return null;
  return { provinceSlug, townSlug, detailSegment };
}

/**
 * Reason a candidate v3 path is unreachable, or null when it is reachable.
 * Exported so both the build-time guard and the mint-time check share ONE
 * definition of "shadowed" — a second copy is a second thing to drift.
 */
export function shadowReason(path: string): string | null {
  const parts = parseV3Path(path);
  if (!parts) return 'not a 4-segment /subastas/{province}/{town}/{detail} path';
  if (RESERVED_UNDER_SUBASTAS.includes(parts.provinceSlug)) {
    return `province segment "${parts.provinceSlug}" is a literal route under /subastas`;
  }
  if (RESERVED_UNDER_PROVINCE.includes(parts.townSlug)) {
    return `town segment "${parts.townSlug}" is a literal route under /subastas/[slug]`;
  }
  if (RESERVED_UNDER_TOWN.includes(parts.detailSegment)) {
    return `detail segment "${parts.detailSegment}" is a literal route under /subastas/[slug]/[municipio]`;
  }
  return null;
}

/** True when the path is a reachable v3 detail URL. */
export function isReachableV3Path(path: string): boolean {
  return shadowReason(path) === null;
}
