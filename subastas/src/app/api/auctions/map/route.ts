import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  ACTIVE_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  FINISHED_DB_STATUSES,
  MAP_DEFAULT_DB_STATUSES,
  ACTIVE_CLOCK_GUARD_SQL,
  DB_TO_FRONTEND_STATUS,
} from '@/lib/auction-status';
import {
  mapCategoryToDbLabels,
  isMapCategoryOtros,
  MAP_CATEGORY_ALL_KNOWN_DB_LABELS,
} from '@/lib/map-category';

/**
 * API endpoint to fetch auction location data for map display
 * Returns only necessary fields (id, coordinates, status, province, municipality, category)
 * Returns recent active/pre-auction records with coordinates, capped per region
 */

type DBStatus = 
  | 'PROXIMA_APERTURA' | 'CELEBRANDOSE' | 'SUSPENDIDA' | 'CANCELADA' | 'CONCLUIDA_PORTAL' | 'FINALIZADA_AUTORIDAD'
  | 'ACTIVE' | 'FINISHED' | 'PRE_AUCTION' | 'SUSPENDED' | 'CANCELLED';

interface MapAuctionFromDB {
  id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
  status: DBStatus;
  province: string;
  municipality: string | null;
  category: string;
  appraisalValue: number | null;
}

// Delegates to the shared DB_TO_FRONTEND_STATUS fold so the map markers,
// the list cards, and the carousel cards all show the same canonical
// frontend status string for any given DB row.
function mapStatus(dbStatus: DBStatus): string {
  return DB_TO_FRONTEND_STATUS[dbStatus] || 'celebrandose';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const province = searchParams.get('province');
    const category = searchParams.get('category');
    // Wave79 (2026-06-07): curated map-sidebar category filter. Same lib +
    // semantics as the listing route — single source of truth for the
    // 8 curated keys + "otros" catch-all. Filters map pins in lockstep with
    // the sidebar count for the selected key.
    const mapCategory = searchParams.get('mapCategory');
    const status = searchParams.get('status');
    const statuses = searchParams.get('statuses')?.split(',').filter(Boolean) || [];

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];

    if (province) {
      conditions.push('province = ?');
      params.push(province);
    }

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (mapCategory) {
      if (isMapCategoryOtros(mapCategory)) {
        if (MAP_CATEGORY_ALL_KNOWN_DB_LABELS.length > 0) {
          conditions.push(
            `(category IS NULL OR category NOT IN (${MAP_CATEGORY_ALL_KNOWN_DB_LABELS.map(() => '?').join(', ')}))`,
          );
          params.push(...MAP_CATEGORY_ALL_KNOWN_DB_LABELS);
        }
      } else {
        const labels = mapCategoryToDbLabels(mapCategory);
        if (labels && labels.length > 0) {
          conditions.push(
            `category IN (${labels.map(() => '?').join(', ')})`,
          );
          params.push(...labels);
        }
        // Unknown key — ignore (don't collapse the pin set).
      }
    }

    // Status filter — frontend status alias → canonical DB set, all sourced
    // from `@/lib/auction-status` so the map agrees with the list/counts/
    // carousel about what "active" means. The clock-guard flag tracks
    // whether the resolved set is the canonical ACTIVE set (or a default
    // that includes it) so we know to add `ACTIVE_CLOCK_GUARD_SQL` below.
    // `latitude IS NOT NULL` is the map's legitimate extra gate (markers
    // need coords); it's appended unconditionally further down.
    let needsActiveClockGuard = false;

    const resolveStatusAlias = (alias: string): readonly string[] => {
      switch (alias) {
        case 'active':
        case 'celebrandose':
          // Canonical active set (SUSPENDIDA included — see lib header).
          needsActiveClockGuard = true;
          return ACTIVE_DB_STATUSES;
        case 'suspendida':
          // Subset of active — also needs clock guard.
          needsActiveClockGuard = true;
          return ['SUSPENDED', 'SUSPENDIDA'];
        case 'pre-auction':
        case 'proxima-apertura':
          return PRE_AUCTION_DB_STATUSES;
        case 'finished':
        case 'concluida-portal':
        case 'finalizada-autoridad':
        case 'cancelada':
          return FINISHED_DB_STATUSES;
        default:
          return [];
      }
    };

    if (status) {
      const dbStatuses = resolveStatusAlias(status);
      if (dbStatuses.length > 0) {
        conditions.push(`status IN (${dbStatuses.map(() => '?').join(',')})`);
        params.push(...dbStatuses);
      }
    } else if (statuses.length > 0) {
      const all: string[] = [];
      for (const s of statuses) all.push(...resolveStatusAlias(s));
      const dedup = Array.from(new Set(all));
      if (dedup.length > 0) {
        conditions.push(`status IN (${dedup.map(() => '?').join(',')})`);
        params.push(...dedup);
      }
    } else {
      // Default: active + pre-auction (canonical). Clock guard applies
      // because the default set CONTAINS the active subset.
      needsActiveClockGuard = true;
      conditions.push(
        `status IN (${MAP_DEFAULT_DB_STATUSES.map(() => '?').join(',')})`,
      );
      params.push(...MAP_DEFAULT_DB_STATUSES);
    }

    // Apply the canonical clock guard whenever the resolved set includes the
    // ACTIVE subset. The guard is null-safe (PRE_AUCTION rows with no endsAt
    // pass through) so it composes correctly with the default active+upcoming
    // set, with `?status=active`, with `?status=suspendida`, and with any
    // multi-status request that includes one of those buckets.
    if (needsActiveClockGuard) {
      conditions.push(ACTIVE_CLOCK_GUARD_SQL);
    }

    // Map markers require real coordinates.
    conditions.push('latitude IS NOT NULL');
    conditions.push('longitude IS NOT NULL');
    conditions.push('province IS NOT NULL');
    conditions.push("LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')");
    conditions.push('LENGTH(TRIM(province)) > 1');

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Keep map payload bounded: max 50 recent auctions per province.
    // This avoids loading the full historical dataset.
    const sql = `
      WITH ranked_auctions AS (
        SELECT
          id,
          title,
          latitude,
          longitude,
          status,
          province,
          municipality,
          category,
          appraisalValue,
          COALESCE(publishedAt, createdAt, updatedAt) AS sortat,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(COALESCE(province, '')))
            ORDER BY COALESCE(publishedAt, createdAt, updatedAt) DESC
          ) AS region_rank
        FROM Auction
        ${whereClause}
      )
      SELECT
        id,
        title,
        latitude,
        longitude,
        status,
        province,
        municipality,
        category,
        appraisalValue
      FROM ranked_auctions
      WHERE region_rank <= 50
      ORDER BY sortat DESC
    `;

    const auctions = await query<MapAuctionFromDB>(sql, params);

    // Transform to frontend format
    const mapAuctions = auctions
      .map(item => {
        return {
          id: item.id,
          title: item.title,
          latitude: item.latitude,
          longitude: item.longitude,
          status: mapStatus(item.status),
          province: item.province,
          municipality: item.municipality,
          category: item.category,
          appraisalValue: item.appraisalValue,
        };
      });

    return NextResponse.json({
      success: true,
      data: mapAuctions,
      count: mapAuctions.length,
    });
  } catch (error) {
    console.error('Error fetching map auctions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch map auctions' 
      },
      { status: 500 }
    );
  }
}
