/**
 * archive-legacy-target — the RUNTIME half of the v4 P2 redirect map.
 *
 * Answers one question: *"a crawler is asking for legacy page N of this node,
 * which is past the v4 10-page cap — where do those rows live NOW?"*
 *
 * ---------------------------------------------------------------------------
 * ⭐ THE APPROACH, AND WHY IT IS NOT A GUESS
 *
 * Ken's brief allows two answers: map the old page onto the partition that now
 * holds the same rows *if the ordering makes that computable*, else 301 to the
 * nearest meaningful ancestor. It IS computable, and cheaply, because of a fact
 * that has to be checked rather than assumed: the legacy province/town hubs and
 * the v4 ladder root select the SAME rows in the SAME order.
 *
 *   • rows — legacy `readList({province, municipio})` composes
 *     `registryBaseWhere(now)` + province + municipality; `archiveNodeWhere`
 *     composes exactly those three for `{prov, muni}`. The outcome facet pairs
 *     `outcomeWhere(o)` + province on both sides. Verified by reading both
 *     predicates, not by assuming they match.
 *   • order — `readList`'s default sort is `[{endsAt:'desc'},{id:'desc'}]`, and
 *     a v4 node page is rendered by the same `readList`. `PROBE_ORDER_BY` below
 *     is that tuple, and it is the ONLY thing in this module that has to stay in
 *     sync with `registro-read.ts`. If someone changes the archive sort, this
 *     probe must change with it or the redirect targets drift silently.
 *
 * So: read the single row that sat at the top of the old page, then walk the
 * planner's ladder down to the deepest partition that contains it. The result is
 * a real v4 node whose rows overlap the old page's — not a topical guess, and
 * never the archive root.
 *
 * The honest limit, stated rather than hidden: an old page of 24 rows can span
 * a partition boundary, so the destination is the partition of its FIRST row.
 * Landing a crawler on page 1 of a node that contains most of what it asked for
 * is the correct trade against the alternative (a 404, or a soft-404 at the
 * root). When the descent finds nothing to descend into — a node the planner did
 * not split, or a probe row that fell outside every child — the fallback is the
 * node ITSELF, i.e. the nearest meaningful ancestor, which is the brief's own
 * second answer.
 *
 * ⛔ Cost: one indexed `findFirst` plus at most four cached plan reads
 * (`readArchivePlan` is `unstable_cache`d at 1h), and only on a legacy URL that
 * is being retired. It never runs on a v4 URL and never runs with the switch off.
 */

import { prisma } from '@/lib/prisma';
import {
  archiveNodeWhere,
  archiveYearOf,
  archiveQuarterOf,
  readArchivePlan,
  readArchiveMuniDbNames,
} from '@/lib/registro/archive-node-read';
import { resolveArchiveMunicipality } from '@/lib/registro/archive-municipality';
import {
  archiveNodePath,
  archivePagePath,
  type ArchiveDimension,
  type ArchiveNode,
} from '@/lib/seo/archive-partitions';
import { mapLegacyArchivePage, archiveParentNode } from '@/lib/seo/archive-legacy-redirects';
import { DB_AUCTIONTYPE_TO_TIPO_SLUG } from '@/lib/seo/slugs';

/**
 * ⚠️ MUST equal `registro-read.ts`'s default (`sort: 'recent'`) ordering. The
 * whole computability argument above rests on this line.
 */
const PROBE_ORDER_BY = [{ endsAt: 'desc' as const }, { id: 'desc' as const }];

type ProbeRow = {
  /** Needed to resolve the row's town: a name is only a municipality OF a province. */
  province: string | null;
  municipality: string | null;
  auctionType: string | null;
  endsAt: Date | null;
  publishedAt: Date | null;
};

/** The ladder key a child node carries for `dim` — the planner's own key. */
function childKey(child: ArchiveNode, dim: ArchiveDimension): string | null {
  switch (dim) {
    case 'municipio':
      return child.muni ?? null;
    case 'tipo':
      return child.tipo ?? null;
    case 'anio':
      return child.anio === undefined ? null : String(child.anio);
    case 'trimestre':
      return child.trimestre === undefined ? null : String(child.trimestre);
  }
}

/** The ladder key the PROBE ROW belongs under for `dim`, in the same grammar. */
function probeKey(row: ProbeRow, dim: ArchiveDimension): string | null {
  switch (dim) {
    case 'municipio':
      // Same gate the census applies (`archive-municipality.ts`), or a probe row
      // carrying a junk municipality would name a town node that does not exist
      // and the 301 would land on a 404. `null` here means "this row has no
      // valid town": the descent stops and the node ITSELF is the target, which
      // is the province-level fallback the ladder already implements.
      return resolveArchiveMunicipality(row.province, row.municipality)?.slug ?? null;
    case 'tipo': {
      const db = row.auctionType ?? '';
      return db ? (DB_AUCTIONTYPE_TO_TIPO_SLUG[db] ?? null) : null;
    }
    case 'anio': {
      const y = archiveYearOf(row);
      return y === null ? null : String(y);
    }
    case 'trimestre': {
      const q = archiveQuarterOf(row);
      return q === null ? null : String(q);
    }
  }
}

/**
 * Descend the ladder from `root` to the deepest planned partition containing
 * the row at `rowOffset`. Returns `root` unchanged when no descent is possible.
 */
export async function archiveOverflowNode(
  root: ArchiveNode,
  rowOffset: number,
): Promise<ArchiveNode> {
  const row = (await prisma.auction.findFirst({
    where: archiveNodeWhere(root),
    orderBy: PROBE_ORDER_BY,
    skip: Math.max(0, rowOffset),
    select: {
      province: true,
      municipality: true,
      auctionType: true,
      endsAt: true,
      publishedAt: true,
    },
  })) as ProbeRow | null;
  // No such row — the old page was already past the end of the node even at the
  // legacy page size. The node itself is the honest destination.
  if (!row) return root;

  let cur = root;
  // Bounded by the ladder length; `remainingDimensions` shrinks every hop, so
  // this cannot cycle. The literal bound is belt-and-braces, not the mechanism.
  for (let hop = 0; hop < 4; hop++) {
    const { plan } = await readArchivePlan(cur);
    if (!plan.splitDimension || plan.children.length === 0) break;
    const want = probeKey(row, plan.splitDimension);
    if (want === null) break;
    const next = plan.children.find((c) => childKey(c, plan.splitDimension!) === want);
    if (!next) break;
    // The planner does no I/O and therefore cannot fill the town's DB names; the
    // query side needs them (an absent set selects nothing, by design). Under
    // MUNI-A one town can hold several raw spellings, so the probe row's own
    // name is not enough — the full fold is read here, and the probe's name is
    // only the fallback if that census comes back empty.
    if (plan.splitDimension === 'municipio' && next.muni !== undefined) {
      const probeName = (row.municipality ?? '').trim() || undefined;
      const dbNames = cur.prov !== undefined
        ? await readArchiveMuniDbNames(cur.prov, next.muni)
        : [];
      cur = {
        ...next,
        muniDbName: probeName,
        muniDbNames: dbNames.length > 0 ? dbNames : probeName ? [probeName] : [],
      };
    } else {
      cur = next;
    }
  }
  return cur;
}

/**
 * The v4 destination for legacy page `oldPage` of `node`.
 *
 * In range → that same page of the node (identity; see the chain-free argument
 * in `archive-legacy-redirects.ts`). Out of range → the partition holding the
 * page's first row, or the node itself.
 */
export async function legacyArchivePageTarget(
  node: ArchiveNode,
  oldPage: number,
): Promise<string> {
  const { plan } = await readArchivePlan(node);
  // Zero rows → the v4 node is a 404 (the planner never emits an empty
  // partition). Fall back a rung rather than 301 a working URL onto a 404.
  if (plan.total === 0) return archiveNodePath(archiveParentNode(node));
  const mapped = mapLegacyArchivePage(oldPage, plan.pages);
  if (mapped.kind === 'page') return archivePagePath(node, mapped.page);
  return archiveNodePath(await archiveOverflowNode(node, mapped.rowOffset));
}

/**
 * Target for a legacy HUB (page 1) whose URL moved — today only the reversed
 * outcome facet. Same zero-row guard, same one-hop guarantee.
 */
export async function legacyArchiveNodeTarget(node: ArchiveNode): Promise<string> {
  const { plan } = await readArchivePlan(node);
  return archiveNodePath(plan.total === 0 ? archiveParentNode(node) : node);
}
