/**
 * archive-census-read — the REQUEST-TIME v4 archive URL set (Forge, v4 P3).
 *
 * One rollup query → cells → `indexArchiveCells` → `planArchiveTree` → the
 * complete, ordered list of every `/resultados` URL the v4 tree puts on the
 * site. This is what the sitemap advertises, and it is derived from the planner
 * rather than from a hand-maintained list, per the P3 brief §2.
 *
 * ---------------------------------------------------------------------------
 * ⭐ ORDER IS A CONTRACT, NOT A CONVENIENCE — read before touching `compareUrls`
 *
 * Two separate mechanisms depend on this list being deterministically and
 * STABLY ordered:
 *
 *  1. CHUNKING. The aggregation band is sliced into 20k children by offset. If
 *     the order wobbled between requests, a URL would move between children on
 *     every fetch and Google would see the whole band churn.
 *  2. THE RAMP. Ken publishes the band one child at a time. "Children are only
 *     ever added, never removed" is only true if raising the knob APPENDS. A
 *     re-sort that interleaves new URLs among old ones would push already-
 *     submitted URLs past the published boundary — i.e. silently de-index pages
 *     we just asked Google to crawl. Shallowest-first, then lexicographic, is
 *     chosen precisely because it is a total order over the URL string alone:
 *     it does not depend on row counts, so a row concluding overnight cannot
 *     reshuffle it.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ CACHED, AND THE CACHE IS LOAD-BEARING FOR THE TEST HARNESS
 *
 * `unstable_cache` with a 3600s TTL, matching `readArchiveChildren`. The census
 * is one aggregate over the whole Auction table; the sitemap is `force-dynamic`
 * and each aggregation child would otherwise re-run it. A second verification
 * run against a RESEEDED database will happily serve the FIRST run's URL set —
 * which is a green suite proving nothing. `scripts/verify-v4-suite.sh` purges
 * `.next/cache` before the build and between switch states for exactly this.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  ARCHIVE_ROLLUP_SELECT,
  type ArchiveRollupRow,
} from '@/lib/registro/archive-census-sql';
import { archiveUrlSetFromCells, type ArchiveCell } from '@/lib/seo/archive-census';
import { safeMunicipioSegment } from '@/lib/seo/archive-partitions';
import {
  DB_AUCTIONTYPE_TO_TIPO_SLUG,
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
  type TipoSlug,
} from '@/lib/seo/slugs';
import { OUTCOME_TO_SLUG, REGISTRY_OUTCOME_ORDER } from '@/lib/registro/registro-ui';

const OUTCOME_SLUGS: readonly string[] = REGISTRY_OUTCOME_ORDER.map((o) => OUTCOME_TO_SLUG[o]);
const OUTCOME_DB_TO_SLUG: Record<string, string> = Object.fromEntries(
  REGISTRY_OUTCOME_ORDER.map((o) => [o, OUTCOME_TO_SLUG[o]]),
);

export interface ArchiveCensusResult {
  /** Every `/resultados` path the v4 tree serves, deterministically ordered. */
  readonly urls: readonly string[];
  /** Rows the census placed — the corpus the tree was sized from. */
  readonly rows: number;
  /**
   * Rows with no province AND no tipo: no shelf can hold them, so they get no
   * page and no sitemap entry. Reported, never invented into a hub (Ken,
   * 2026-08-13). Surfaced so the number stays visible instead of vanishing.
   */
  readonly unplaceableRows: number;
}

async function _readArchiveCensus(): Promise<ArchiveCensusResult> {
  // ONE instant for the whole rollup. A classifier that drifts mid-scan
  // double-counts the stale-suspended boundary.
  const now = new Date();
  const raw = await prisma.$queryRawUnsafe<ArchiveRollupRow[]>(
    ARCHIVE_ROLLUP_SELECT,
    now,
  );

  const cells: ArchiveCell[] = [];
  const locationFreeTipos = new Set<TipoSlug>();
  let unplaceableRows = 0;

  for (const r of raw) {
    const n = Number(r.n);
    const tipo = r.auction_type ? DB_AUCTIONTYPE_TO_TIPO_SLUG[r.auction_type] : undefined;
    const prov = PROVINCE_DB_KEY_TO_SLUG[r.province] ?? '';
    const outcome = OUTCOME_DB_TO_SLUG[r.outcome] ?? '';

    if (!prov) {
      // Ken 2026-08-13: NEVER invent a province and never mint a `sin-provincia`
      // hub. These rows live on the location-free shelf `/resultados/{tipo}/{año}`,
      // placed only by attributes we actually have. With no tipo there is nothing
      // to place them by, so they leave the tree AND the sitemap entirely — we do
      // not advertise a page we cannot place.
      if (!tipo) {
        unplaceableRows += n;
        continue;
      }
      locationFreeTipos.add(tipo);
      cells.push({ prov: '', muni: '', rawMuni: '', tipo, anio: r.yr, qtr: r.qtr, outcome, n });
      continue;
    }

    const rawMuniSlug = r.municipality ? slugify(r.municipality) : '';
    cells.push({
      prov,
      muni: rawMuniSlug ? safeMunicipioSegment(rawMuniSlug) : 'sin-municipio',
      rawMuni: rawMuniSlug,
      tipo: tipo ?? 'judicial',
      anio: r.yr,
      qtr: r.qtr,
      outcome,
      n,
    });
  }

  const set = archiveUrlSetFromCells(cells, {
    outcomeSlugs: OUTCOME_SLUGS,
    locationFreeTipos: [...locationFreeTipos].sort(),
  });

  return { urls: set.urls, rows: set.rows, unplaceableRows };
}

/**
 * ⭐ WHY `URL_V4_SWITCH` IS **NOT** IN THIS CACHE KEY (checked, deliberately).
 *
 * The standing hazard with a runtime flag plus `unstable_cache` is that a flip
 * serves the previous state's entries from a key that does not mention the
 * flag. That hazard does not exist here, and the reason is structural rather
 * than lucky: `_readArchiveCensus` never reads the switch. It runs one rollup
 * query and hands the cells to `archiveUrlSetFromCells` — the v4 planner —
 * unconditionally. Its output is the same list in both switch states.
 *
 * What the switch selects is whether that list is CONSUMED: `sitemap-entries.ts`
 * calls this only inside the lit branch, and the dark branch builds the v3 set
 * from `readSummary` / `concludedMunicipioPairsAll` instead. Both of those are
 * separately `unstable_cache`d under their own keys and are likewise
 * switch-independent DB reads.
 *
 * So a flip changes which cached list is read, never which value a key maps to,
 * and adding the flag to the key would only halve the hit rate on a value that
 * is identical in both halves. ⚠️ If this function ever grows a branch on
 * `isUrlV4SwitchOn()`, that stops being true and the flag must go in the key
 * array below in the same commit.
 */
export const readArchiveCensus = unstable_cache(_readArchiveCensus, ['archive-census-v4'], {
  revalidate: 3600,
  tags: ['registro'],
});
