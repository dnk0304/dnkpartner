import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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

function mapStatus(dbStatus: DBStatus): string {
  const statusMap: Record<DBStatus, string> = {
    'PROXIMA_APERTURA': 'proxima-apertura',
    'CELEBRANDOSE': 'celebrandose',
    'SUSPENDIDA': 'suspendida',
    'CANCELADA': 'cancelada',
    'CONCLUIDA_PORTAL': 'concluida-portal',
    'FINALIZADA_AUTORIDAD': 'finalizada-autoridad',
    'PRE_AUCTION': 'proxima-apertura',
    'ACTIVE': 'celebrandose',
    'FINISHED': 'concluida-portal',
    'SUSPENDED': 'suspendida',
    'CANCELLED': 'cancelada'
  };
  return statusMap[dbStatus] || 'celebrandose';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const province = searchParams.get('province');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const statuses = searchParams.get('statuses')?.split(',').filter(Boolean) || [];

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];
    const DEFAULT_DB_STATUSES: DBStatus[] = ['ACTIVE', 'CELEBRANDOSE', 'SUSPENDED', 'SUSPENDIDA', 'PRE_AUCTION', 'PROXIMA_APERTURA'];

    if (province) {
      conditions.push('province = ?');
      params.push(province);
    }

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    // Status filter - convert frontend status to DB status
    // If no status is provided, default to active + pre-auction to keep payload small.
    if (status) {
      const statusToDb: Record<string, DBStatus[]> = {
        'active': ['ACTIVE', 'CELEBRANDOSE', 'SUSPENDED', 'SUSPENDIDA'],
        'celebrandose': ['ACTIVE', 'CELEBRANDOSE', 'SUSPENDED', 'SUSPENDIDA'],
        'pre-auction': ['PRE_AUCTION', 'PROXIMA_APERTURA'],
        'proxima-apertura': ['PRE_AUCTION', 'PROXIMA_APERTURA'],
        'finished': ['FINISHED', 'CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD', 'CANCELLED', 'CANCELADA'],
      };

      const dbStatuses = statusToDb[status] || [];
      if (dbStatuses.length > 0) {
        conditions.push(`status IN (${dbStatuses.map(() => '?').join(',')})`);
        params.push(...dbStatuses);
      }
    } else if (statuses.length > 0) {
      // Multiple statuses filter
      const allDbStatuses: DBStatus[] = [];
      statuses.forEach(s => {
        const statusToDb: Record<string, DBStatus[]> = {
          'active': ['ACTIVE', 'CELEBRANDOSE'],
          'celebrandose': ['ACTIVE', 'CELEBRANDOSE'],
          'suspendida': ['SUSPENDED', 'SUSPENDIDA'],
          'pre-auction': ['PRE_AUCTION', 'PROXIMA_APERTURA'],
          'proxima-apertura': ['PRE_AUCTION', 'PROXIMA_APERTURA'],
          'cancelada': ['CANCELLED', 'CANCELADA'],
          'finished': ['FINISHED', 'CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD'],
          'concluida-portal': ['CONCLUIDA_PORTAL'],
          'finalizada-autoridad': ['FINALIZADA_AUTORIDAD'],
        };
        const mapped = statusToDb[s] || [];
        allDbStatuses.push(...mapped);
      });

      if (allDbStatuses.length > 0) {
        conditions.push(`status IN (${allDbStatuses.map(() => '?').join(',')})`);
        params.push(...allDbStatuses);
      }
    } else {
      conditions.push(`status IN (${DEFAULT_DB_STATUSES.map(() => '?').join(',')})`);
      params.push(...DEFAULT_DB_STATUSES);
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
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(COALESCE(province, '')))
            ORDER BY datetime(COALESCE(publishedAt, createdAt, updatedAt)) DESC
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
      ORDER BY datetime(COALESCE(publishedAt, createdAt, updatedAt)) DESC
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
