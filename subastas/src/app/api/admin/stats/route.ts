import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { query } from '@/lib/db';


export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get total auction counts by status
    const statusCounts = await query<{ status: string; count: string | number }>(
      `SELECT status, COUNT(*) as count
       FROM Auction
       GROUP BY status`
    );

    // Get total auction counts by category
    const categoryCounts = await query<{ category: string; count: string | number }>(
      `SELECT category, COUNT(*) as count
       FROM Auction
       GROUP BY category
       ORDER BY count DESC`
    );

    // Get total auction counts by source
    const sourceCounts = await query<{ source: string; count: string | number }>(
      `SELECT source, COUNT(*) as count
       FROM Auction
       GROUP BY source`
    );

    // Get total auction counts by province (top 10)
    const provinceCounts = await query<{ province: string; count: string | number }>(
      `SELECT province, COUNT(*) as count
       FROM Auction
       GROUP BY province
       ORDER BY count DESC
       LIMIT 10`
    );

    // Get auctions with coordinates vs without
    const coordinateStats = await query<{ has_coords: number; count: string | number }>(
      `SELECT
        CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END as has_coords,
        COUNT(*) as count
       FROM Auction
       GROUP BY (CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END)`
    );

    // Get date range of auctions
    const dateRangeRows = await query<{ min_date: string | Date; max_date: string | Date }>(
      `SELECT
        MIN(publishedAt) as min_date,
        MAX(publishedAt) as max_date
       FROM Auction`
    );
    const dateRange = dateRangeRows[0];

    // Get total count
    const totalCountRows = await query<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM Auction`
    );

    return NextResponse.json({
      total: Number(totalCountRows[0]?.count || 0),
      byStatus: statusCounts.map(r => ({ ...r, count: Number(r.count) })),
      byCategory: categoryCounts.map(r => ({ ...r, count: Number(r.count) })),
      bySource: sourceCounts.map(r => ({ ...r, count: Number(r.count) })),
      byProvince: provinceCounts.map(r => ({ ...r, count: Number(r.count) })),
      coordinates: {
        withCoords: Number(coordinateStats.find(s => Number(s.has_coords) === 1)?.count || 0),
        withoutCoords: Number(coordinateStats.find(s => Number(s.has_coords) === 0)?.count || 0),
      },
      dateRange: {
        earliest: dateRange?.min_date || null,
        latest: dateRange?.max_date || null,
      },
    });

  } catch (error: any) {
    console.error('Auction stats error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
