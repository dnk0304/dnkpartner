/**
 * URL-v3 MINT — the ONE definition of "what url does this row get?".
 *
 * ⭐ WHY THIS FILE EXISTS (2026-08-05, MINT-ON-INGEST dispatch)
 * The 192,589-row mint was a ONE-SHOT batch whose per-row logic lived inline in
 * `scripts/url-v3-mint-payload.ts`. Nothing minted new auctions, so coverage
 * decayed with every ingest: 689 of 1,407 live auctions had no v3 row. The
 * obvious fix — "call the same rules from the ingest path" — is exactly how two
 * implementations of one rule come to exist and then drift apart. A slug is
 * PERMANENT; a drifted ingest slug is not a bug you can redeploy away.
 *
 * So the per-row body of the batch was LIFTED here verbatim and both callers now
 * import it. `url-v3-mint-payload.ts` is the batch caller, `mint-url-v3.persist`
 * is the ingest/sweep caller. There is no second copy of these rules to drift.
 *
 * PURE: no DB, no `now`, no env. Same row -> same url, forever, in either caller.
 */
import { resolveTown } from '@/lib/geo/resolve-town';
import {
  buildDescriptorV3, buildAuctionPathV3, refTail, losesIdentifyingDetail, MAX_URL_LEN_V3,
} from '@/lib/seo/descriptor-v3';
import { PROVINCE_ALIAS_TO_CANONICAL, PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';
import municipalityAliases from '@/data/municipality-aliases.json';

/**
 * canonical "{prov}/{town}" -> every OTHER official spelling of that town, plus
 * every alias spelling of the province. The address text almost always writes
 * the locality in a different spelling than the canonical slug ("ELCHE" where
 * the slug is `elx`), so these are what make the duplicate strippable.
 */
const ALIASES_BY_CANONICAL = (() => {
  const m = new Map<string, string[]>();
  const entries = (municipalityAliases as {
    entries: Record<string, { canonical: string; ine: string; province: string }>;
  }).entries;
  for (const [key, v] of Object.entries(entries)) {
    const [prov, aliasTown] = key.split('/');
    const ck = `${prov}/${v.canonical}`;
    if (!m.has(ck)) m.set(ck, []);
    m.get(ck)!.push(aliasTown);
  }
  return m;
})();

const PROVINCE_ALIASES_BY_CANONICAL = (() => {
  const m = new Map<string, string[]>();
  for (const [alias, canon] of Object.entries(PROVINCE_ALIAS_TO_CANONICAL)) {
    if (alias === canon) continue;
    if (!m.has(canon)) m.set(canon, []);
    m.get(canon)!.push(alias);
  }
  return m;
})();

/**
 * Route segments that already exist under /subastas. A province slug equal to
 * one of these would shadow a real route; a town slug equal to a second-level
 * one would shadow the town-hub's own children. Derived from the live app
 * router (src/app/subastas/*) plus the verified live sitemap.
 */
export const RESERVED_UNDER_SUBASTAS = new Set(['subasta', 'tipo', 'pagina', 'page', 'api']);
export const RESERVED_UNDER_PROVINCE = new Set(['pagina', 'page']);

/** The columns of `Auction` the mint reads. Nothing else influences the url. */
export type MintRowInput = {
  id: string;
  boeId: string;
  category: string | null;
  province: string | null;
  municipality: string | null;
  postalCode: string | null;
  address: string | null;
};

/** Exactly the column set of `auction_url_v3` (and of `auction_url_v3_held`). */
export type MintedUrlRow = {
  auctionId: string;
  boeId: string;
  url: string;
  provinceSlug: string;
  townSlug: string;
  /** 'cp-muni' | 'stored-gazetteer' — the DB CHECK admits nothing else. */
  townSource: string;
  ine: string | null;
  refTail: string;
  descriptor: string;
  descriptorFull: string;
  truncated: boolean;
  guardSignals: string | null;
};

/**
 * Why a row got no url. `degraded` rows fall back to the province page — the
 * SAME outcome the batch gave them (13,964 rows), so an ingest that degrades is
 * not a regression, it is parity.
 */
export type DegradeReason =
  | 'town-unresolved'
  | 'unknown-province'
  | 'empty-town-slug';

export type MintOutcome =
  | { status: 'minted'; row: MintedUrlRow }
  /**
   * The descriptor cap ate detail that DISTINGUISHES this door. Batch parity:
   * such rows are held back (1,713 of them) rather than minted poor forever —
   * there is no redirect machinery, so a url minted poor stays poor.
   */
  | { status: 'held'; row: MintedUrlRow }
  | { status: 'degraded'; reason: DegradeReason };

/**
 * A mint that CANNOT be performed correctly. Thrown, never swallowed and never
 * "fixed" by shortening the url.
 *
 * ⚠️ THE HELD-1,711 LESSON, MADE STRUCTURAL. The failure mode this class exists
 * to prevent is a mint that quietly truncates to fit and stores a permanent,
 * impoverished url. The DB's own CHECKs (`length(url) <= 200`, `url LIKE
 * '/subastas/%'`, `town_source IN (...)`) are the enforcement layer; this throws
 * BEFORE the insert so the caller gets a legible reason instead of a raw 23514.
 * The safe fallback for an unminted row is the LEGACY url, which still serves
 * 200 — losing a mint costs nothing, storing a wrong permanent url costs
 * forever.
 */
export class MintGateError extends Error {
  readonly code: 'structural-overflow' | 'over-ceiling' | 'reserved-shadow' | 'bad-shape';

  readonly boeId: string;

  constructor(code: MintGateError['code'], boeId: string, detail: string) {
    super(`url-v3 mint gate [${code}] boeId=${boeId}: ${detail}`);
    this.name = 'MintGateError';
    this.code = code;
    this.boeId = boeId;
  }
}

/**
 * Mint one row. Pure. Throws `MintGateError` on any condition under which a
 * CORRECT permanent url cannot be produced.
 *
 * This is the batch loop body (url-v3-mint-payload.ts) with two differences,
 * both of which make it STRICTER rather than different:
 *   - the batch collected gate failures and exited non-zero at the end of the
 *     run; a single-row caller has no "end of run", so it throws immediately;
 *   - the batch detected duplicate urls with an in-run `Map`. A single-row
 *     caller cannot see the corpus, so uniqueness is delegated to the DB's
 *     `UNIQUE(url)` — which is the stronger check anyway: it sees rows the batch
 *     never had in memory.
 */
export function mintAuctionUrlV3(r: MintRowInput): MintOutcome {
  const town = resolveTown({
    postalCode: r.postalCode ?? '',
    storedMunicipality: r.municipality ?? '',
    province: r.province ?? '',
  });
  if (town.status !== 'resolved') return { status: 'degraded', reason: 'town-unresolved' };

  const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[r.province ?? ''];
  if (!provinceSlug) return { status: 'degraded', reason: 'unknown-province' };

  const townSlug = slugify(town.municipality);
  if (!townSlug) return { status: 'degraded', reason: 'empty-town-slug' };

  // Reserved-segment guard — asserted against the REAL slug, not assumed. A
  // shadowing slug is a route collision, not a cosmetic problem: it would make
  // an app route unreachable. Refuse rather than mint.
  if (RESERVED_UNDER_SUBASTAS.has(provinceSlug)) {
    throw new MintGateError('reserved-shadow', r.boeId, `province slug "${provinceSlug}" shadows a route`);
  }
  if (RESERVED_UNDER_PROVINCE.has(townSlug)) {
    throw new MintGateError('reserved-shadow', r.boeId, `town slug "${townSlug}" shadows a route`);
  }

  const localityAliases = [
    ...(ALIASES_BY_CANONICAL.get(`${provinceSlug}/${townSlug}`) ?? []),
    ...(PROVINCE_ALIASES_BY_CANONICAL.get(provinceSlug) ?? []),
  ];
  const d = buildDescriptorV3({
    address: r.address, townSlug, provinceSlug, postalCode: r.postalCode, localityAliases,
  });

  const ref = refTail(r.boeId);
  const p = buildAuctionPathV3({
    provinceSlug, townSlug, category: r.category, descriptor: d.descriptor, ref,
  });

  // ── GATES. Every one of these refuses the mint; none of them shortens a url.
  if (p.structuralOverflow) {
    throw new MintGateError('structural-overflow', r.boeId,
      `location+ref alone are ${p.url.length} chars — no descriptor fits`);
  }
  if (p.url.length > MAX_URL_LEN_V3) {
    throw new MintGateError('over-ceiling', r.boeId, `url is ${p.url.length} > ${MAX_URL_LEN_V3}`);
  }
  if (!p.url.startsWith('/subastas/')) {
    throw new MintGateError('bad-shape', r.boeId, `url does not start with /subastas/: ${p.url}`);
  }

  const row: MintedUrlRow = {
    auctionId: r.id,
    boeId: r.boeId,
    url: p.url,
    provinceSlug,
    townSlug,
    townSource: town.source,
    ine: town.ine ?? null,
    refTail: ref,
    descriptor: d.descriptor,
    descriptorFull: d.full,
    truncated: d.truncated,
    guardSignals: d.signals.length ? JSON.stringify(d.signals) : null,
  };

  const isHeld = losesIdentifyingDetail(d.full, d.descriptor) || p.ceilingTrimmed;
  return isHeld ? { status: 'held', row } : { status: 'minted', row };
}
