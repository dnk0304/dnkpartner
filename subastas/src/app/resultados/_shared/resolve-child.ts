/**
 * Resolver for the /resultados segment tree — page 1 and every `/pagina/{n}`
 * sibling, at every depth.
 *
 * Extracted rather than copied (Forge 2026-08-12): the province/municipio
 * resolution here decides which URLs are 200 vs 404 vs 301, and a second copy
 * would eventually disagree with the first about which town slug is canonical —
 * which shows up as a paginated page 404ing on a hub that resolves fine.
 *
 * v4 (Forge 2026-08-13) EXTENDS this file rather than adding a second one, and
 * the reasoning above now matters more, not less: seg2 alone can mean a town, an
 * outcome, a tipo or a year, and seg1 can additionally mean a location-free
 * shelf root. Five namespaces sharing two slots is precisely the situation where
 * two resolvers drift and a hub starts linking its own 404s.
 *
 * `resolveResultadosChild` (the shipped 2-segment shapes) is UNCHANGED in
 * behaviour and now delegates its town half to the shared helper below, so there
 * is exactly one answer to "is this slug a town?".
 */

import {
  PROVINCE_SLUG_TO_DB_KEY,
  PROVINCE_ALIAS_TO_CANONICAL,
  provinceLabelForSlug,
  TIPO_ALIAS_TO_CANONICAL,
  TIPO_SLUGS,
  type TipoSlug,
} from '@/lib/seo/slugs';
import {
  legacyMunicipalitySlugExists,
  municipalityDbNamesForSlug,
  municipalitySlugToDbName,
} from '@/lib/seo/page-data';
import { registroMunicipioSlugToDbName } from '@/lib/registro/registro-read';
import { archiveTownRedirect } from '@/lib/registro/archive-town-redirect';
import { archiveWhitelistActive } from '@/lib/registro/archive-municipality';
import { resolveResultadosSeg } from '@/lib/registro/resultados-routing';
import { registryOutcomeFromSlug, type RegistryOutcome } from '@/lib/registro/registro-ui';
import { archiveNodePath, type ArchiveNode } from '@/lib/seo/archive-partitions';

export type ResultadosChildShape =
  | {
      kind: 'outcome-province';
      outcome: RegistryOutcome;
      outcomeSlug: string;
      provDbKey: string;
      provSlug: string;
      provLabel: string;
    }
  | {
      kind: 'province-muni';
      provDbKey: string;
      provSlug: string;
      provLabel: string;
      /** INE official denomination (MUNI-A) — display only. */
      muniName: string;
      /**
       * Raw `Auction.municipality` spellings folded onto this town — the values
       * a `where` clause must use (`readList({ municipio: muniDbNames })`).
       */
      muniDbNames: string[];
      muniSlug: string;
      total: number;
    }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

/**
 * Where a town segment that no longer names a hub should go (Ken's MUNI-A
 * task 2). Returns a path, or `null` to let the 404 stand.
 *
 * The gazetteer whitelist retires ~7,100 town hubs that answer 200 today. Left
 * alone every one becomes a NEW 404 — the exact thing the v4 suite's zero-404
 * gate exists to prevent. `archiveTownRedirect` decides WHERE from the INE
 * register alone; this adds the one thing a pure function cannot know, namely
 * whether the target actually has rows.
 *
 * ⭐ THE 301-MUST-NOT-404 CHECK. An alias target (`elche` -> `elx`) is a real
 * municipality, but a real municipality with no auctions has no hub, and a 301
 * onto a 404 is worse than the 404 it replaced. So a town target is CONFIRMED
 * against the registry before it is used, and demoted to the province hub —
 * which always exists — when it is not live. Same discipline as
 * `archiveParentNode`'s fallback in P2.
 *
 * `null` (already canonical) deliberately keeps the 404: that slug names a real
 * municipality with no rows, so the URL never existed and inventing a redirect
 * for it would advertise a page we do not have.
 */
async function townRedirectTarget(
  provSlug: string,
  provDbKey: string,
  seg2: string,
): Promise<string | null> {
  // ⛔ SWITCH-GATED (Ken's MUNI-A2 ruling, after a prod rollback).
  //
  // Nothing here may fire while `URL_V4_SWITCH` is off. Ken measured
  // `/resultados/madrid/msdrid` and `/resultados/madrid/carabanchel-alto`
  // answering 307 on a dark build where they had answered 200, and rolled the
  // release back inside a minute.
  //
  // ⭐ THIS GUARD IS THE BACKSTOP, NOT THE FIX. The reason those URLs reached
  // this function at all is that the gazetteer whitelist had already made them
  // unresolvable upstream; gating only here would have converted the 307 into a
  // 404, which is worse. The real gate is on the whitelist itself, in
  // `archive-municipality.ts` — dark, `msdrid` resolves and returns 200 and
  // control never gets here. This check exists so that no future change to the
  // resolution layer can reintroduce a dark redirect by accident.
  if (!archiveWhitelistActive()) return null;

  // ⛔ ONLY retired pages redirect. This branch is also the catch-all for any
  // segment that is not a year, outcome or tipo, so without this check every
  // bogus string (`/resultados/madrid/qwerty`) would 301 to the province — a
  // soft-200 that destroys the 404 signal and, worse, makes a mistyped URL look
  // like a real page. A slug the corpus never produced was never live, and a URL
  // that was never live gets a 404, not a redirect.
  if (!(await legacyMunicipalitySlugExists(provDbKey, seg2))) return null;
  const target = archiveTownRedirect(provSlug, seg2);
  if (target === null) return null;

  // ⛔ THE ALIAS -> CANONICAL 301 IS GONE (Ken, MUNI-A2). `archiveTownRedirect`
  // still reports `kind: 'town'` for an alternate denomination, but that answer
  // is now consumed by `registroMunicipioSlugToDbName`, which RESOLVES the alias
  // slug to the same town and serves it 200 at its own URL instead of moving it.
  // Control therefore only reaches here for a slug that names no town at all —
  // a typo or a district — and every one of those goes to the province hub,
  // which always exists. Rule 3 is the whole rule now.
  //
  // Consequence worth stating: no live town URL is renamed by this wave. That
  // was Ken's explicit instruction and it is also why the 135-case enumeration
  // exists — the rename policy is Dennis's to settle, once, for provinces and
  // towns together.
  return `/resultados/${provSlug}`;
}

export async function resolveResultadosChild(
  seg1: string,
  seg2: string,
): Promise<ResultadosChildShape> {
  const r1 = resolveResultadosSeg(seg1);
  if (r1.kind === 'redirect') return { kind: 'redirect', to: `${r1.to}/${seg2}` };
  if (r1.kind === 'invalid') return { kind: 'notfound' };

  if (r1.kind === 'outcome') {
    // seg2 must be a province (canonical or alias)
    const dbKey = PROVINCE_SLUG_TO_DB_KEY[seg2];
    if (dbKey) {
      return {
        kind: 'outcome-province',
        outcome: r1.outcome,
        outcomeSlug: r1.slug,
        provDbKey: dbKey,
        provSlug: seg2,
        provLabel: provinceLabelForSlug(seg2) ?? dbKey,
      };
    }
    const canon = PROVINCE_ALIAS_TO_CANONICAL[seg2];
    if (canon) return { kind: 'redirect', to: `/resultados/${r1.slug}/${canon}` };
    return { kind: 'notfound' };
  }

  // r1 = province → seg2 = municipio
  const provDbKey = r1.dbKey;
  const inRegistry = await registroMunicipioSlugToDbName(provDbKey, seg2);
  if (inRegistry) {
    return {
      kind: 'province-muni',
      provDbKey,
      provSlug: r1.slug,
      provLabel: r1.label,
      muniName: inRegistry.municipalityName,
      muniDbNames: inRegistry.dbNames,
      muniSlug: inRegistry.municipioSlug,
      total: inRegistry.total,
    };
  }
  // Resolvable-but-empty town (any-status): still render, noindex. Also
  // gazetteer-gated (MUNI-A) — `municipalitySlugToDbName` no longer resolves a
  // slug the INE register does not know.
  const fallback = await municipalitySlugToDbName(provDbKey, seg2);
  if (fallback) {
    return {
      kind: 'province-muni',
      provDbKey,
      provSlug: r1.slug,
      provLabel: r1.label,
      muniName: fallback,
      muniDbNames: await municipalityDbNamesForSlug(provDbKey, seg2),
      muniSlug: seg2,
      total: 0,
    };
  }
  // MUNI-A: the slug names no town of this province. It very likely DID answer
  // 200 before the whitelist, so send it somewhere rather than minting a 404.
  const away = await townRedirectTarget(r1.slug, provDbKey, seg2);
  if (away) return { kind: 'redirect', to: away };
  return { kind: 'notfound' };
}

// ---------------------------------------------------------------------------
// v4 — the full segment ladder
// ---------------------------------------------------------------------------

const YEAR_RE = /^\d{4}$/;
const QUARTER_RE = /^t([1-4])$/;

/**
 * Years we will resolve as an `año` segment.
 *
 * Bounded on purpose. `/^\d{4}$/` alone would make `/resultados/madrid/madrid/
 * judicial/9999` a 200 rendering an empty list — an infinite family of thin,
 * indexable, duplicate pages generated by anyone typing digits. The archive is
 * historical, so the upper bound is "next year" (auctions are published ahead of
 * their end date and the `año` rung keys on `COALESCE(endsAt, publishedAt)`),
 * and the lower bound predates the BOE electronic auction portal.
 *
 * Out-of-range years 404. In-range-but-empty years also 404 via the count gate
 * below, so this is a cheap first filter, not the only one.
 */
const ARCHIVE_YEAR_MIN = 2000;
function archiveYearMax(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

function parseYearSegment(seg: string, now?: Date): number | null {
  if (!YEAR_RE.test(seg)) return null;
  const y = Number.parseInt(seg, 10);
  return y >= ARCHIVE_YEAR_MIN && y <= archiveYearMax(now) ? y : null;
}

function parseQuarterSegment(seg: string): number | null {
  const m = QUARTER_RE.exec(seg);
  return m ? Number.parseInt(m[1], 10) : null;
}

function parseTipoSegment(seg: string): { tipo: TipoSlug } | { alias: TipoSlug } | null {
  if ((TIPO_SLUGS as readonly string[]).includes(seg)) return { tipo: seg as TipoSlug };
  const canon = TIPO_ALIAS_TO_CANONICAL[seg];
  return canon ? { alias: canon } : null;
}

export type ArchiveResolution =
  | {
      kind: 'node';
      node: ArchiveNode;
      /** Human labels for breadcrumbs/H1, in ladder order. */
      provLabel?: string;
      muniLabel?: string;
    }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

/**
 * Resolve `/resultados/{...segs}` into an archive node.
 *
 * POSITIONAL, and deliberately so — `archiveNodePath` builds the URL from the
 * ladder order, so this is its exact inverse and the two cannot disagree about
 * which URL means which node. At each slot the non-town namespaces are tried
 * FIRST (outcome, tipo, year, quarter) and the town lookup last, mirroring
 * `isReservedResultadosSegment`: a town whose slug collides with a facet is
 * minted as `municipio-{slug}` precisely so the facet can win here without
 * making that town unreachable.
 *
 * ⛔ This resolver does NOT count rows. A node that resolves may still be empty;
 * the caller applies the count gate (empty → 404 for a ladder node, which never
 * legitimately exists at 0 rows since the planner refuses to emit one).
 */
export async function resolveArchiveSegments(
  segs: readonly string[],
  now: Date = new Date(),
): Promise<ArchiveResolution> {
  if (segs.length === 0 || segs.some((s) => !s)) return { kind: 'notfound' };

  const [seg1, ...rest] = segs;

  // ---- seg1: outcome | province | shelf root (tipo) ----
  const r1 = resolveResultadosSeg(seg1);

  if (r1.kind === 'redirect') {
    return { kind: 'redirect', to: [r1.to, ...rest].join('/') };
  }

  if (r1.kind === 'outcome') {
    // National outcome hub — a hand-built page, not a ladder node. v4 reverses
    // the province-scoped form to /resultados/{prov}/{outcome}; the LEGACY order
    // is still served by the shipped 2-segment route, and P2 owns the 301.
    return { kind: 'notfound' };
  }

  if (r1.kind === 'invalid') {
    // Not an outcome and not a province → the location-free shelf root.
    const t = parseTipoSegment(seg1);
    if (!t) return { kind: 'notfound' };
    if ('alias' in t) {
      return { kind: 'redirect', to: `/resultados/${[t.alias, ...rest].join('/')}` };
    }
    return resolveShelfTail({ tipo: t.tipo }, rest, now);
  }

  // ---- province ladder ----
  const provNode: ArchiveNode = { prov: r1.slug };
  if (rest.length === 0) {
    return { kind: 'node', node: provNode, provLabel: r1.label };
  }

  const [seg2, ...rest2] = rest;

  // seg2 = outcome facet (v4 reversed order). Terminal: a filtered VIEW of the
  // province, never a coverage rung, so it takes no further segments.
  if (registryOutcomeFromSlug(seg2)) {
    if (rest2.length > 0) return { kind: 'notfound' };
    return { kind: 'node', node: { prov: r1.slug, outcome: seg2 }, provLabel: r1.label };
  }

  // seg2 = tipo (the municipio rung was degenerate and the planner skipped it)
  const t2 = parseTipoSegment(seg2);
  if (t2) {
    if ('alias' in t2) {
      return { kind: 'redirect', to: `/resultados/${[r1.slug, t2.alias, ...rest2].join('/')}` };
    }
    return resolveShelfTail({ prov: r1.slug, tipo: t2.tipo }, rest2, now, r1.label);
  }

  // seg2 = año (both the municipio AND tipo rungs were degenerate)
  const y2 = parseYearSegment(seg2, now);
  if (y2 !== null) {
    return resolveYearTail({ prov: r1.slug, anio: y2 }, rest2, r1.label);
  }
  if (YEAR_RE.test(seg2)) return { kind: 'notfound' }; // 4 digits, out of range

  // seg2 = municipality
  const town = await registroMunicipioSlugToDbName(r1.dbKey, seg2);
  if (!town) {
    // MUNI-A: same rule as the 2-segment resolver above — a retired town slug
    // redirects to its canonical twin or to the province, never to a 404.
    const away = await townRedirectTarget(r1.slug, r1.dbKey, seg2);
    return away ? { kind: 'redirect', to: away } : { kind: 'notfound' };
  }
  const muniNode: ArchiveNode = {
    prov: r1.slug,
    muni: seg2,
    muniDbName: town.municipalityName,
    // `municipalityName` is the INE official denomination (display); `dbNames`
    // carries every raw corpus spelling that folded onto it, which is what
    // `archiveNodeWhere` needs to select the town's rows.
    muniDbNames: town.dbNames,
  };
  if (rest2.length === 0) {
    return {
      kind: 'node',
      node: muniNode,
      provLabel: r1.label,
      muniLabel: town.municipalityName,
    };
  }

  // ---- seg3 under a town: tipo | año ----
  const [seg3, ...rest3] = rest2;
  const t3 = parseTipoSegment(seg3);
  if (t3) {
    if ('alias' in t3) {
      return { kind: 'redirect', to: `/resultados/${[r1.slug, seg2, t3.alias, ...rest3].join('/')}` };
    }
    return resolveShelfTail(
      { ...muniNode, tipo: t3.tipo },
      rest3,
      now,
      r1.label,
      town.municipalityName,
    );
  }
  const y3 = parseYearSegment(seg3, now);
  if (y3 !== null) {
    return resolveYearTail({ ...muniNode, anio: y3 }, rest3, r1.label, town.municipalityName);
  }
  return { kind: 'notfound' };
}

/** Tail after a `tipo` segment: nothing, or `{año}[/t{n}]`. */
function resolveShelfTail(
  node: ArchiveNode,
  rest: readonly string[],
  now: Date,
  provLabel?: string,
  muniLabel?: string,
): ArchiveResolution {
  if (rest.length === 0) return { kind: 'node', node, provLabel, muniLabel };
  const y = parseYearSegment(rest[0], now);
  if (y === null) return { kind: 'notfound' };
  return resolveYearTail({ ...node, anio: y }, rest.slice(1), provLabel, muniLabel);
}

/** Tail after an `año` segment: nothing, or `t{1..4}`. The ladder ends here. */
function resolveYearTail(
  node: ArchiveNode,
  rest: readonly string[],
  provLabel?: string,
  muniLabel?: string,
): ArchiveResolution {
  if (rest.length === 0) return { kind: 'node', node, provLabel, muniLabel };
  if (rest.length > 1) return { kind: 'notfound' };
  const q = parseQuarterSegment(rest[0]);
  if (q === null) return { kind: 'notfound' };
  return { kind: 'node', node: { ...node, trimestre: q }, provLabel, muniLabel };
}

/**
 * Canonical path of a resolved node — used to 301 an ALIAS spelling onto the
 * canonical one. Goes through `archiveNodePath` (never a local template) so the
 * redirect target and the sitemap entry are the same string by construction.
 */
export function archiveResolutionPath(node: ArchiveNode): string {
  return archiveNodePath(node);
}
