/**
 * `<lastmod>` for PROVINCE and TOWN hubs — the pure half.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * Measured on the LIVE wave215 sitemap (Ken, 2026-09-17 15:40):
 * `sitemap/0.xml` advertises 5,595 town hubs and only 617 of them carry a
 * `<lastmod>`. Of the 851 towns GSC has on file, 743 are in the sitemap and
 * 555 of those 743 ship with NO date at all — which is exactly the population
 * we are trying to get re-crawled.
 *
 * ROOT CAUSE (structural, not a slug bug this time). c574a5e fixed the *join*
 * (raw `dbNames` instead of `slugify(municipality)`), but left the *source set*
 * alone: the map was still built from
 *
 *     where: { status: { in: ACTIVE_STATUSES }, inScope: true }
 *
 * while the URL set is `allMunicipalityPairs()` = `_municipalityPairs({})`,
 * i.e. auctions of ANY status. With `URL_V4_SWITCH=1` in prod (confirmed on the
 * live compose 2026-09-17 15:15) every town with ANY auction history ships a
 * URL, but only a town with a CURRENTLY ACTIVE auction could ever find a date.
 * Phase-C "finalizadas bucket" towns — index,follow, real content, concluded
 * history only — are therefore permanently dateless. 617 ≈ the number of
 * distinct towns holding one of the ~1,154 active rows corpus-wide, which is
 * precisely what the arithmetic predicts.
 *
 * ─── THE RULE ────────────────────────────────────────────────────────────
 *
 * A hub's `<lastmod>` is `max(updatedAt)` over ALL the auction rows the hub's
 * own URL was derived from — active and concluded alike. A hub with zero rows
 * keeps NO `<lastmod>`: absent is a neutral signal, a fabricated `now` is a
 * negative one (07 §4), and we never fall back to a synthetic date.
 *
 * ─── WHY THE INDEX IS KEYED ON RAW DB VALUES ─────────────────────────────
 *
 * The town URL slug is produced by `foldMunicipalitiesForLegacySurface`, and
 * for an aliased or folded town it is NOT `slugify(municipality)` (the DB says
 * `Alicante/Alacant`, the URL says `alicante/alacant`). So the index is keyed
 * on the RAW spellings and the join runs over the pair's `dbNames` — the same
 * rows the slug was folded from. URL and date come out of one fold and cannot
 * drift apart. Keying it on a slug is what broke this the first time.
 *
 * This module is PURE on purpose: the repo's unit suite runs without a
 * database, and the fold/join is the part that has now been wrong twice.
 */

/** The shape `prisma.auction.groupBy` returns for the hub aggregate. */
export type HubLastmodRow = {
  province: string | null;
  municipality: string | null;
  /** `_max.updatedAt` for the (province, municipality) group. */
  updatedAt: Date | null;
};

/**
 * Max `updatedAt` per raw DB province key, and per raw
 * `provinceKey|municipalityName` pair. Both keys are the DB's own spellings,
 * trimmed — never slugified.
 */
export type HubLastmodIndex = {
  byProvince: Map<string, Date>;
  byMunicipality: Map<string, Date>;
};

export function municipalityLastmodKey(provinceKey: string, municipalityName: string): string {
  return `${provinceKey.trim()}|${municipalityName.trim()}`;
}

export function buildHubLastmodIndex(rows: readonly HubLastmodRow[]): HubLastmodIndex {
  const byProvince = new Map<string, Date>();
  const byMunicipality = new Map<string, Date>();

  const bump = (map: Map<string, Date>, key: string, d: Date | null | undefined) => {
    if (!d) return;
    const cur = map.get(key);
    if (!cur || d > cur) map.set(key, d);
  };

  for (const r of rows) {
    const provinceKey = (r.province ?? '').trim();
    if (!provinceKey) continue;
    bump(byProvince, provinceKey, r.updatedAt);
    const raw = (r.municipality ?? '').trim();
    if (!raw) continue;
    bump(byMunicipality, municipalityLastmodKey(provinceKey, raw), r.updatedAt);
  }

  return { byProvince, byMunicipality };
}

/**
 * Max `updatedAt` across EVERY raw spelling that folded onto one town slug.
 *
 * `dbNames` comes from the same fold that produced the URL, so an aliased town
 * (`Alicante/Alacant`) and a collision-folded town (several DB spellings, one
 * page) both resolve to the freshness of the rows their page actually renders.
 * Returns `undefined` — never a fabricated date — when nothing matched.
 */
export function resolveTownLastmod(
  index: HubLastmodIndex,
  provinceKey: string,
  dbNames: readonly string[] | undefined,
): Date | undefined {
  let out: Date | undefined;
  for (const name of dbNames ?? []) {
    if (!name) continue;
    const d = index.byMunicipality.get(municipalityLastmodKey(provinceKey, name));
    if (d && (!out || d > out)) out = d;
  }
  return out;
}

/** Max `updatedAt` over every auction row in the province. */
export function resolveProvinceLastmod(
  index: HubLastmodIndex,
  provinceKey: string,
): Date | undefined {
  return index.byProvince.get(provinceKey.trim());
}
