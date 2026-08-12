/**
 * GET /api/registro/list — the filterable /resultados archive rows.
 *
 * Returns concluded auction rows joined to the canonical outcome taxonomy, for
 * the browse UI. Unlike summary/regions (which read the rollup), this reads the
 * live Auction table for a SINGLE PAGE (bounded pageSize) — cheap, indexed by
 * the new (province, category, status, soldDate) composite — and classifies
 * each returned row via `auctionOutcome()` so the label is always exact.
 *
 * Query params:
 *   outcome     = VENDIDA | DESIERTA | CANCELADA | FINALIZADA_SIN_RESULTADO
 *                 (omit → all registry outcomes; INDETERMINADO is never listed)
 *   category    = <DB category label>
 *   province    = <province name>
 *   municipio   = <municipality name>
 *   priceMin/priceMax = euros (VENDIDA soldPrice filter)
 *   from/to     = YYYY-MM-DD, applied on the periodBasis date field
 *   periodBasis = PUBLISHED | CONCLUDED   (default CONCLUDED — date field = endsAt)
 *   sort        = recent (default) | price_desc | price_asc
 *   page        = 1-based (default 1)
 *   pageSize    = default 24, max 100
 *
 * Cache: public hourly s-maxage (rows only change as the scraper writes outcomes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';
import { fetchV3UrlsBatch, resolveAuctionPath } from '@/lib/seo/auction-url';
import { auctionOutcome, outcomeFromSlug, type AuctionOutcome } from '@/lib/seo/auction-outcome';
import { outcomeWhere, registryBaseWhere } from '@/lib/registro/outcome-query';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADER = 'public, s-maxage=3600, stale-while-revalidate=86400';
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

const VALID_OUTCOMES = new Set<AuctionOutcome>([
  'VENDIDA',
  'DESIERTA',
  'CANCELADA',
  'FINALIZADA_SIN_RESULTADO',
]);

function parseIntParam(v: string | null, dflt: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Accept either an outcome slug (adjudicadas) or the raw bucket (VENDIDA). */
function parseOutcome(v: string | null): AuctionOutcome | null {
  if (!v) return null;
  const bySlug = outcomeFromSlug(v);
  if (bySlug && VALID_OUTCOMES.has(bySlug)) return bySlug;
  const upper = v.toUpperCase() as AuctionOutcome;
  return VALID_OUTCOMES.has(upper) ? upper : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const now = new Date();

  const outcome = parseOutcome(sp.get('outcome'));
  const category = (sp.get('category') ?? '').trim();
  const province = (sp.get('province') ?? '').trim();
  const municipio = (sp.get('municipio') ?? '').trim();
  const periodBasis = sp.get('periodBasis') === 'PUBLISHED' ? 'PUBLISHED' : 'CONCLUDED';
  const sort = sp.get('sort') ?? 'recent';
  const page = parseIntParam(sp.get('page'), 1, 1, 1_000_000);
  const pageSize = parseIntParam(sp.get('pageSize'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  const priceMinEur = Number(sp.get('priceMin'));
  const priceMaxEur = Number(sp.get('priceMax'));
  const from = sp.get('from');
  const to = sp.get('to');

  try {
    // Base: the requested outcome, or all registry outcomes.
    const and: Prisma.AuctionWhereInput[] = [
      outcome ? outcomeWhere(outcome, now) : registryBaseWhere(now),
    ];

    if (category) and.push({ category });
    if (province) and.push({ province });
    if (municipio) and.push({ municipality: municipio });

    // Sold-price band (cents) — only meaningful for VENDIDA rows.
    const priceWhere: { gte?: bigint; lte?: bigint } = {};
    if (Number.isFinite(priceMinEur)) priceWhere.gte = BigInt(Math.round(priceMinEur * 100));
    if (Number.isFinite(priceMaxEur)) priceWhere.lte = BigInt(Math.round(priceMaxEur * 100));
    if (priceWhere.gte != null || priceWhere.lte != null) and.push({ soldPrice: priceWhere });

    // Date band on the basis field.
    const dateField = periodBasis === 'PUBLISHED' ? 'publishedAt' : 'endsAt';
    const dateWhere: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(`${from}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) dateWhere.gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) dateWhere.lte = d;
    }
    if (dateWhere.gte != null || dateWhere.lte != null) and.push({ [dateField]: dateWhere });

    const where: Prisma.AuctionWhereInput = { AND: and };

    // Ordering: soldDate/endsAt desc for recency; soldPrice for price sorts.
    let orderBy: Prisma.AuctionOrderByWithRelationInput | Prisma.AuctionOrderByWithRelationInput[];
    if (sort === 'price_desc') orderBy = [{ soldPrice: 'desc' }, { endsAt: 'desc' }];
    else if (sort === 'price_asc') orderBy = [{ soldPrice: 'asc' }, { endsAt: 'desc' }];
    else orderBy = [{ endsAt: 'desc' }, { id: 'desc' }];

    const [total, rows] = await Promise.all([
      prisma.auction.count({ where }),
      prisma.auction.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          boeId: true,
          title: true,
          category: true,
          province: true,
          municipality: true,
          auctionType: true,
          status: true,
          saleResult: true,
          resumeAt: true,
          updatedAt: true,
          soldPrice: true,
          appraisalValue: true,
          valorSubasta: true,
          soldDate: true,
          endsAt: true,
          publishedAt: true,
          imageUrl: true,
        },
      }),
    ]);

    // ONE `= ANY(...)` probe for this page of rows (never per-row). Non-fatal:
    // on failure the map stays empty and every row falls back to its legacy
    // path, which still 200s — a link lookup must not 500 the list.
    let v3 = new Map<string, string>();
    try {
      v3 = await fetchV3UrlsBatch(rows.map((r) => r.id));
    } catch (error) {
      console.error('registro detailPath v3 lookup failed; falling back to legacy paths', error);
    }

    const items = rows.map((r) => {
      const classified = auctionOutcome(
        { status: r.status, saleResult: r.saleResult, resumeAt: r.resumeAt, updatedAt: r.updatedAt },
        now,
      );
      const forSlug = {
        id: r.id,
        auctionType: r.auctionType,
        province: r.province,
        municipality: r.municipality,
      };
      const slug = buildAuctionSlug(forSlug);
      return {
        id: r.id,
        boeId: r.boeId,
        slug,
        detailPath: resolveAuctionPath(forSlug, v3.get(r.id) ?? null),
        title: r.title,
        category: r.category,
        province: r.province,
        municipality: r.municipality,
        outcome: classified,
        soldPriceCents: r.soldPrice != null ? Number(r.soldPrice) : null,
        appraisalValue: r.appraisalValue,
        valorSubasta: r.valorSubasta,
        soldDate: r.soldDate?.toISOString() ?? null,
        endsAt: r.endsAt?.toISOString() ?? null,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        imageUrl: r.imageUrl,
      };
    });

    const res = NextResponse.json({
      scope: {
        outcome: outcome ?? null,
        category: category || null,
        province: province || null,
        municipio: municipio || null,
        periodBasis,
        sort,
      },
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items,
    });
    res.headers.set('Cache-Control', CACHE_HEADER);
    return res;
  } catch (err) {
    console.error('[registro/list] failed:', err);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
}
