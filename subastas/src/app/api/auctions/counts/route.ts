import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auctionCache } from '@/lib/cache';

const normalizeText = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

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
    const category = searchParams.get('category'); // Filter by category
    const status = searchParams.get('status'); // Filter by status
    
    if (!groupBy || !['category', 'province', 'municipality'].includes(groupBy)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or missing groupBy parameter. Must be: category, province, or municipality'
      }, { status: 400 });
    }
    
    // Create cache key
    const cacheKey = {
      type: 'counts',
      groupBy,
      province: province || 'all',
      category: category || 'all',
      status: status || 'all'
    };
    
    // Try cache first
    const cached = auctionCache.get(cacheKey);
    if (cached) {
      console.log(`⚡ Count cache HIT for ${groupBy} - returned in ${Date.now() - startTime}ms`);
      return NextResponse.json(cached);
    }
    
    // Build optimized SQL query with GROUP BY
    let sql = `
      SELECT 
        ${groupBy},
        status,
        COUNT(*) as count
      FROM Auction 
      WHERE 1=1
        AND province IS NOT NULL
        AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
        AND LENGTH(TRIM(province)) > 1
    `;
    
    // Additional filter for municipality grouping
    if (groupBy === 'municipality') {
      sql += ` AND municipality IS NOT NULL AND LOWER(municipality) NOT IN ('desconocida', 'null', 'undefined', 'sin municipio')`;
    }
    
    const params: any[] = [];
    
    if (province) {
      const normalizedProvince = normalizeText(province);
      const dbProvinces = await query<{ province: string }>(
        'SELECT DISTINCT province FROM Auction WHERE province IS NOT NULL',
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
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (status) {
      // Filter by status if provided (support both old and new status values)
      if (status === 'active') {
        sql += ' AND status IN (?, ?, ?, ?)';
        params.push('ACTIVE', 'SUSPENDED', 'CELEBRANDOSE', 'SUSPENDIDA');
      } else if (status === 'finished') {
        sql += ' AND status IN (?, ?, ?, ?, ?)';
        params.push('FINISHED', 'CANCELLED', 'CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD', 'CANCELADA');
      } else if (status === 'pre-auction') {
        sql += ' AND status IN (?, ?)';
        params.push('PRE_AUCTION', 'PROXIMA_APERTURA');
      }
    }
    
    sql += ` GROUP BY ${groupBy}, status`;
    
    // Execute query
    const queryStart = Date.now();
    const results = await query<{ [key: string]: string | number }>(sql, params);
    const queryTime = Date.now() - queryStart;
    
    // Aggregate counts by status
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
    
    results.forEach((row: any) => {
      const key = row[groupBy];
      if (!key) return; // Skip null values
      
      const count = Number(row.count);
      
      // Add to total
      counts.total[key] = (counts.total[key] || 0) + count;
      
      // Add to specific status (support both old and new status values)
      const status = row.status;
      if (status === 'ACTIVE' || status === 'SUSPENDED' || status === 'CELEBRANDOSE' || status === 'SUSPENDIDA') {
        counts.active[key] = (counts.active[key] || 0) + count;
      } else if (status === 'PRE_AUCTION' || status === 'PROXIMA_APERTURA') {
        counts.preAuction[key] = (counts.preAuction[key] || 0) + count;
      } else if (status === 'FINISHED' || status === 'CANCELLED' || status === 'CONCLUIDA_PORTAL' || status === 'FINALIZADA_AUTORIDAD' || status === 'CANCELADA') {
        counts.finished[key] = (counts.finished[key] || 0) + count;
      }
    });
    
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
