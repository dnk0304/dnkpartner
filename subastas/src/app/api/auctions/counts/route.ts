import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auctionCache } from '@/lib/cache';
import {
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  FINISHED_DB_STATUSES,
  ACTIVE_CLOCK_GUARD_SQL,
  IN_SCOPE_GUARD_SQL,
  isActiveStatus,
  isPreAuctionStatus,
  isFinishedStatus,
} from '@/lib/auction-status';
import { normalizeText } from '@/lib/normalize';
import { toCanonicalProvince } from '@/lib/spain-provinces';
import { resolveProvinceSlugToCanonical } from '@/lib/province-slug';
import {
  MAP_CATEGORY_KEYS,
  MAP_CATEGORY_OTROS,
  dbCategoryToMapKey,
  mapCategoryToDbLabels,
  isMapCategoryOtros,
  MAP_CATEGORY_ALL_KNOWN_DB_LABELS,
} from '@/lib/map-category';
import { getSourceLabel } from '@/lib/source-labels';

// FORGE 2026-06-07 (multi-town-api / Feature F1) — array-param caps + parser.
// Mirrors the listing route. Keep these in sync.
const MAX_MUNICIPIOS = 25;
const MAX_PROVINCIAS = 10;
function parseCsvParam(raw: string | null, cap: number): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 80);
  if (list.length === 0) return null;
  const unique = [...new Set(list)];
  return unique.slice(0, cap);
}

// Local 5-min global municipality fold cache for the counts route. Mirrors the
// listing route's getCachedDistinctMunicipalitiesGlobal() but scoped here so
// the two routes don't have to share module state.
let _muniGlobalCache: { byFolded: Map<string, string[]>; expiresAt: number } | null = null;
async function getCountsMuniGlobalCache(): Promise<Map<string, string[]>> {
  if (_muniGlobalCache && _muniGlobalCache.expiresAt > Date.now()) return _muniGlobalCache.byFolded;
  const rows = await query<{ municipality: string }>(
    `SELECT DISTINCT municipality FROM Auction WHERE municipality IS NOT NULL AND ${IN_SCOPE_GUARD_SQL}`,
    [],
  );
  const byFolded = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.municipality) continue;
    const folded = normalizeText(r.municipality);
    if (!folded) continue;
    const bucket = byFolded.get(folded);
    if (bucket) bucket.push(r.municipality);
    else byFolded.set(folded, [r.municipality]);
  }
  _muniGlobalCache = { byFolded, expiresAt: Date.now() + 5 * 60 * 1000 };
  return byFolded;
}

// Sentinel municipality strings the scraper writes for unknown / blank rows.
// We bucket them all into a single "Otros / Sin municipio" group so the
// province total still reconciles to \u03a3(municipality buckets) instead of
// silently dropping them.
const MUNICIPALITY_SENTINELS = new Set(['desconocida', 'null', 'undefined', 'sin municipio']);
const OTROS_BUCKET_LABEL = 'Otros / Sin municipio';
const OTROS_PROVINCIA_LABEL = 'Otros / Sin provincia';

/**
 * Pick a canonical display label for a folded grouping bucket.
 *
 * Prefers any variant that contains at least one uppercase character (so the
 * chip reads `"Madrid"`, never `"madrid"`). When no variant has uppercase, or
 * there is a tie between multiple uppercase variants, prefers the variant
 * with the highest row count. Deterministic last-resort: lexicographic.
 */
function pickCanonicalLabel(variants: Map<string, number>): string {
  let best: { raw: string; count: number; hasUpper: boolean } | null = null;
  for (const [raw, count] of variants) {
    const hasUpper = /[A-Z]/.test(raw);
    if (!best) {
      best = { raw, count, hasUpper };
      continue;
    }
    // Uppercase-having variants strictly beat all-lowercase variants.
    if (hasUpper && !best.hasUpper) {
      best = { raw, count, hasUpper };
      continue;
    }
    if (!hasUpper && best.hasUpper) continue;
    // Same uppercase status \u2014 break ties by max count, then lex.
    if (count > best.count || (count === best.count && raw < best.raw)) {
      best = { raw, count, hasUpper };
    }
  }
  return best ? best.raw : '';
}

// Filter out invalid provinces
const isValidProvince = (province: string | null): boolean => {
  if (!province) return false;
  const lower = province.toLowerCase().trim();
  const invalid = ['unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined'];
  return !invalid.includes(lower) && lower.length > 1;
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupBy = searchParams.get('groupBy'); // 'category' or 'province' or 'municipality'
    const province = searchParams.get('province'); // Filter by province
    // FORGE 2026-06-07 (multi-town-api / Feature F1): province-agnostic
    // multi-select. Same param shape as /api/auctions; UNION semantics
    // (municipality IN (...) OR province IN (...)). Singletons still apply
    // (AND) so the SEO locked-filter path is unaffected.
    const municipiosRaw = searchParams.get('municipios');
    const provinciasRaw = searchParams.get('provincias');
    const municipiosList = parseCsvParam(municipiosRaw, MAX_MUNICIPIOS);
    const provinciasList = parseCsvParam(provinciasRaw, MAX_PROVINCIAS);
    const category = searchParams.get('category'); // Filter by category
    // Wave79 (2026-06-07): curated "map sidebar" filter — accepts one of the
    // MAP_CATEGORY_KEYS (or "otros"). Expanded server-side to the underlying
    // DB labels via `mapCategoryToDbLabels` so the filter agrees with the
    // mapCategory aggregator below (count=list invariant).
    const mapCategory = searchParams.get('mapCategory');
    const status = searchParams.get('status'); // Filter by status

    if (!groupBy || !['category', 'province', 'municipality', 'source', 'mapCategory'].includes(groupBy)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or missing groupBy parameter. Must be: category, province, municipality, source, or mapCategory'
      }, { status: 400 });
    }
    
    // Create cache key
    const cacheKey = {
      type: 'counts',
      groupBy,
      province: province || 'all',
      municipios: municipiosList ? [...municipiosList].map((s) => normalizeText(s)).sort().join('|') : 'none',
      provincias: provinciasList ? [...provinciasList].map((s) => normalizeText(s)).sort().join('|') : 'none',
      category: category || 'all',
      mapCategory: mapCategory || 'all',
      status: status || 'all'
    };
    
    // Try cache first
    const cached = auctionCache.get(cacheKey);
    if (cached) {
      console.log(`⚡ Count cache HIT for ${groupBy} - returned in ${Date.now() - startTime}ms`);
      return NextResponse.json(cached);
    }
    
    // Build optimized SQL query with GROUP BY.
    //
    // Wave79 (2026-06-07): `groupBy=mapCategory` is the curated 8-key map
    // sidebar grouping. Since mapCategory is NOT a DB column, we GROUP BY
    // the underlying `category` and fold to the curated key in the JS
    // aggregation pass below. The other groupBy values (category, province,
    // municipality, source) remain SQL columns and group natively.
    const sqlGroupCol = groupBy === 'mapCategory' ? 'category' : groupBy;
    let sql = `
      SELECT
        ${sqlGroupCol},
        status,
        COUNT(*) as count
      FROM Auction
      WHERE 1=1
        AND ${IN_SCOPE_GUARD_SQL}
        AND province IS NOT NULL
        AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
        AND LENGTH(TRIM(province)) > 1
    `;
    
    // Municipality grouping no longer drops null/blank/sentinel rows at the SQL
    // layer — they would silently vanish from the per-province total. We keep
    // them in the SELECT and bucket them into the "Otros / Sin municipio"
    // group in the JS aggregation below, so the post-fix invariant
    // `province total == Σ municipality buckets (incl. Otros)` holds.
    
    const params: any[] = [];
    
    if (province) {
      const normalizedProvince = normalizeText(province);
      const dbProvinces = await query<{ province: string }>(
        `SELECT DISTINCT province FROM Auction WHERE province IS NOT NULL AND ${IN_SCOPE_GUARD_SQL}`,
        []
      );
      const provinceMatches = dbProvinces
        .map((row) => row.province)
        .filter((value) => normalizeText(value) === normalizedProvince);

      if (provinceMatches.length > 0) {
        sql += ` AND province IN (${provinceMatches.map(() => '?').join(',')})`;
        params.push(...provinceMatches);
      } else {
        sql += ' AND LOWER(province) = LOWER(?)';
        params.push(province);
      }
    }

    // FORGE 2026-06-07 (multi-town-api / Feature F1): UNION-semantics
    // multi-select predicate. Identical shape to /api/auctions so the badge
    // count and the list count reconcile against the SAME row set under a
    // multi-town selection (count=list invariant).
    if ((municipiosList && municipiosList.length > 0) || (provinciasList && provinciasList.length > 0)) {
      const orParts: string[] = [];

      if (municipiosList && municipiosList.length > 0) {
        const globalMuniMap = await getCountsMuniGlobalCache();
        const muniDbCasings = new Set<string>();
        for (const slug of municipiosList) {
          const folded = normalizeText(slug);
          const variants = globalMuniMap.get(folded);
          if (variants) for (const v of variants) muniDbCasings.add(v);
        }
        if (muniDbCasings.size > 0) {
          const arr = Array.from(muniDbCasings);
          orParts.push(`municipality IN (${arr.map(() => '?').join(', ')})`);
          params.push(...arr);
        }
      }

      if (provinciasList && provinciasList.length > 0) {
        // Wave79 (2026-06-07): primary resolution path is the SEO slug grammar
        // (`resolveProvinceSlugToCanonical`), which maps "a-coruna" /
        // "baleares" / "araba-alava" / aliases ("la-coruna", "vizcaya") to
        // the canonical {label, key}. Previously this branch did only
        // `normalizeText(slug)` + a raw fallback to `toCanonicalProvince`,
        // which kept the slug hyphen-form and never matched the DB label's
        // space-form. Result: A Coruña + Illes Balears (and every multi-word
        // / overridden-slug province) returned 0 rows despite the sidebar
        // count being correct. The legacy fold paths are kept as additional
        // OR clauses so a non-slug spelling on the wire (e.g. raw "Madrid")
        // still resolves.
        const dbProvinceRows = await query<{ province: string }>(
          `SELECT DISTINCT province FROM Auction WHERE province IS NOT NULL AND ${IN_SCOPE_GUARD_SQL}`,
          [],
        );
        const dbProvinces = dbProvinceRows.map((r) => r.province);
        const provDbCasings = new Set<string>();
        for (const slug of provinciasList) {
          const folded = normalizeText(slug);
          const canonical = resolveProvinceSlugToCanonical(slug)
            ?? toCanonicalProvince(slug);
          for (const v of dbProvinces) {
            const vFolded = normalizeText(v);
            if (vFolded === folded) provDbCasings.add(v);
            if (canonical) {
              if (vFolded === normalizeText(canonical.key)) provDbCasings.add(v);
              if (vFolded === normalizeText(canonical.label)) provDbCasings.add(v);
            }
          }
        }
        if (provDbCasings.size > 0) {
          const arr = Array.from(provDbCasings);
          orParts.push(`province IN (${arr.map(() => '?').join(', ')})`);
          params.push(...arr);
        }
      }

      if (orParts.length > 0) {
        sql += ` AND (${orParts.join(' OR ')})`;
      } else {
        // Both params supplied but neither resolved — deterministic empty.
        sql += ' AND 1=0';
      }
    }

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    // Wave79 (2026-06-07): curated `mapCategory=<key>` filter. Resolves to
    // the underlying DB labels via the single-source-of-truth map. "otros"
    // is the catch-all bucket — implemented as NOT IN (all known labels) so
    // it captures off-taxonomy + Maquinaria/Joyas/Arte without leaking back
    // into the curated buckets. An unknown key (not in MAP_CATEGORY_KEYS and
    // not "otros") is ignored so a stray probe never collapses the count to 0.
    if (mapCategory) {
      if (isMapCategoryOtros(mapCategory)) {
        if (MAP_CATEGORY_ALL_KNOWN_DB_LABELS.length > 0) {
          sql += ` AND (category IS NULL OR category NOT IN (${MAP_CATEGORY_ALL_KNOWN_DB_LABELS.map(() => '?').join(', ')}))`;
          params.push(...MAP_CATEGORY_ALL_KNOWN_DB_LABELS);
        }
      } else {
        const labels = mapCategoryToDbLabels(mapCategory);
        if (labels && labels.length > 0) {
          sql += ` AND category IN (${labels.map(() => '?').join(', ')})`;
          params.push(...labels);
        }
      }
    }

    if (status) {
      // Status sets + canonical clock guard come from the shared lib so the
      // counts endpoint and the list endpoint can never drift again. Clock
      // guard applies only to the `active` bucket (pre-auction and finished
      // have no "has it ended" question relevant to set membership).
      if (status === 'active') {
        const set = ACTIVE_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')}) AND ${ACTIVE_CLOCK_GUARD_SQL}`;
        params.push(...set);
      } else if (status === 'finished') {
        const set = FINISHED_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')})`;
        params.push(...set);
      } else if (status === 'pre-auction') {
        const set = PRE_AUCTION_DB_STATUSES;
        sql += ` AND status IN (${set.map(() => '?').join(', ')})`;
        params.push(...set);
      }
    }
    
    sql += ` GROUP BY ${sqlGroupCol}, status`;
    
    // Execute query
    const queryStart = Date.now();
    const results = await query<{ [key: string]: string | number }>(sql, params);
    const queryTime = Date.now() - queryStart;
    
    // Aggregate counts by status, folded on a normalized grouping key.
    //
    // The SQL is `GROUP BY <col>, status` over the raw string, so case-variant
    // duplicates (`Madrid` vs `madrid`) arrive as separate rows. We re-key
    // them under `normalizeText(raw)` here, which is what the list route does
    // too — see `@/lib/normalize`. The dict surfaced to callers uses a
    // canonical display label per folded group (prefer the variant with
    // uppercase, tie-break by count).
    //
    // For groupBy=municipality the SQL no longer drops null/blank/sentinel
    // municipality rows; we collapse them into a single
    // "Otros / Sin municipio" bucket per province here, so the province
    // total reconciles to Σ(municipalities) without anything vanishing.
    const counts: {
      active: Record<string, number>;
      preAuction: Record<string, number>;
      finished: Record<string, number>;
      total: Record<string, number>;
    } = {
      active: {},
      preAuction: {},
      finished: {},
      total: {}
    };

    // Per-bucket variant tallies (raw string -> row count) so we can pick a
    // canonical display label after the first pass.
    type Bucket = {
      variants: Map<string, number>;
      total: number;
      active: number;
      preAuction: number;
      finished: number;
    };
    const buckets = new Map<string, Bucket>();

    const getBucket = (normKey: string, displayHint: string): Bucket => {
      let b = buckets.get(normKey);
      if (!b) {
        b = { variants: new Map(), total: 0, active: 0, preAuction: 0, finished: 0 };
        buckets.set(normKey, b);
      }
      if (displayHint) {
        b.variants.set(displayHint, (b.variants.get(displayHint) || 0) + 1);
      }
      return b;
    };

    results.forEach((row: any) => {
      // sqlGroupCol === groupBy for native column groupings; for
      // groupBy=mapCategory the SQL grouped by `category` and we fold to the
      // curated key here in JS.
      const rawKey = row[sqlGroupCol] as string | null;
      const count = Number(row.count);
      const status = row.status as string;

      let normKey: string;
      let displayHint: string;

      if (groupBy === 'mapCategory') {
        // Fold the raw DB category label to a curated map-sidebar key. Off-
        // taxonomy / null / Maquinaria / Joyas / Arte → "otros" bucket so
        // Σ(curated keys + otros) reconciles with the unfiltered total.
        const mapKey = dbCategoryToMapKey(rawKey);
        normKey = mapKey;
        displayHint = mapKey;
      } else if (groupBy === 'municipality') {
        // Null / blank / sentinel municipality -> single "Otros" bucket per
        // (province-filtered) call. The province scope is already constrained
        // upstream via the `province=...` query param.
        const trimmed = (rawKey || '').trim();
        const lower = trimmed.toLowerCase();
        if (!trimmed || MUNICIPALITY_SENTINELS.has(lower)) {
          normKey = '__otros__';
          displayHint = OTROS_BUCKET_LABEL;
        } else {
          normKey = normalizeText(trimmed);
          displayHint = trimmed;
        }
      } else if (groupBy === 'province') {
        if (!rawKey) return; // province null rows are excluded by the SQL guard, defensive skip.
        // CANONICAL FOLD — collapse 314 dirty province variants onto the 52
        // real Spanish provinces. The DB has historical case/accent/format
        // variants ("Madrid ", "madrid", "MADRID", "Madrid / Provincia",
        // postal-code junk like "CP 28013"). Without this fold the province
        // tree would render 314 garbage rows. `toCanonicalProvince` is the
        // same helper /api/auctions/provinces already uses — single source of
        // truth from `@/lib/spain-provinces`.
        //
        // Display label = the canonical `.label` (proper-cased, accented),
        // not the raw scraper string. Anything that fails the canonical
        // whitelist (postal-code junk, "Unknown", numeric noise) is bucketed
        // into a single "Otros / Sin provincia" group so Σ(canonical) +
        // Otros == grand total — nothing silently vanishes.
        const canonical = toCanonicalProvince(rawKey);
        if (canonical) {
          normKey = normalizeText(canonical.key);
          displayHint = canonical.label;
        } else {
          normKey = '__otros_provincia__';
          displayHint = OTROS_PROVINCIA_LABEL;
        }
      } else if (groupBy === 'source') {
        // Source — fold DB tokens (BOE / TEJU / SEGSOCIAL / future) onto their
        // canonical human display labels via the shared source-labels map. So
        // legacy `TEJU` rows aggregate into the same "BOE" bucket the rest of
        // the BOE-family rows live in, and a new source (e.g. AYTO_*) gets a
        // titlecased fallback rather than a screaming-snake-case bucket.
        // The map is the single source of truth — adding a new source there
        // makes its count appear here automatically (data-driven).
        if (!rawKey) return;
        const label = getSourceLabel(rawKey) ?? rawKey;
        normKey = normalizeText(label);
        displayHint = label;
      } else {
        // category — no normalization fold (the taxonomy is server-controlled).
        if (!rawKey) return;
        normKey = rawKey;
        displayHint = rawKey;
      }

      const bucket = getBucket(normKey, displayHint);
      bucket.total += count;

      // Bucket each row by status-class via the shared predicates. NOTE:
      // because the JS aggregation runs on the GROUPED rows AFTER the SQL,
      // it does NOT see the clock-guard drop. When the caller asks
      // `?status=active` the SQL already applied the clock guard, so this
      // branch only sees rows that survive it — consistent. When no status
      // filter is supplied (the broad "all groups" call) this aggregation
      // reports the raw status-class bucket totals, same as before; callers
      // that need clock-guarded actives should request `?status=active`.
      if (isActiveStatus(status)) {
        bucket.active += count;
      } else if (isPreAuctionStatus(status)) {
        bucket.preAuction += count;
      } else if (isFinishedStatus(status)) {
        bucket.finished += count;
      }
    });

    // Second pass: emit each folded bucket under its canonical display label.
    // The "Otros / Sin municipio" and "Otros / Sin provincia" buckets use
    // their fixed labels. For canonically-folded provinces the bucket's only
    // recorded variant is already the canonical .label (set above), so
    // pickCanonicalLabel returns it untouched.
    for (const [normKey, bucket] of buckets) {
      const label =
        normKey === '__otros__'
          ? OTROS_BUCKET_LABEL
          : normKey === '__otros_provincia__'
            ? OTROS_PROVINCIA_LABEL
            : pickCanonicalLabel(bucket.variants) || normKey;
      counts.total[label] = (counts.total[label] || 0) + bucket.total;
      if (bucket.active) counts.active[label] = (counts.active[label] || 0) + bucket.active;
      if (bucket.preAuction) counts.preAuction[label] = (counts.preAuction[label] || 0) + bucket.preAuction;
      if (bucket.finished) counts.finished[label] = (counts.finished[label] || 0) + bucket.finished;
    }
    
    // Get grand totals
    const grandTotal = Object.values(counts.total).reduce((sum, val) => sum + val, 0);
    const activeTotal = Object.values(counts.active).reduce((sum, val) => sum + val, 0);
    const preAuctionTotal = Object.values(counts.preAuction).reduce((sum, val) => sum + val, 0);
    const finishedTotal = Object.values(counts.finished).reduce((sum, val) => sum + val, 0);
    
    const response = {
      success: true,
      groupBy,
      counts,
      totals: {
        total: grandTotal,
        active: activeTotal,
        preAuction: preAuctionTotal,
        finished: finishedTotal
      },
      performance: {
        total: Date.now() - startTime,
        query: queryTime
      }
    };
    
    // Cache for 60 seconds (counts don't change frequently)
    auctionCache.set(cacheKey, response, 60000);
    
    console.log(`✅ Counts loaded in ${Date.now() - startTime}ms (query: ${queryTime}ms) - ${grandTotal} total auctions`);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching auction counts:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch auction counts',
        performance: { total: Date.now() - startTime }
      },
      { status: 500 }
    );
  }
}
