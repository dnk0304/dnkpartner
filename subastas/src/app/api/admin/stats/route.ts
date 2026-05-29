import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

const ADMIN_EMAIL = 'dennis.kotlenko@gmail.com';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get total auction counts by status
    const statusCounts = query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count 
       FROM Auction 
       GROUP BY status`
    );

    // Get total auction counts by category
    const categoryCounts = query<{ category: string; count: number }>(
      `SELECT category, COUNT(*) as count 
       FROM Auction 
       GROUP BY category 
       ORDER BY count DESC`
    );

    // Get total auction counts by source
    const sourceCounts = query<{ source: string; count: number }>(
      `SELECT source, COUNT(*) as count 
       FROM Auction 
       GROUP BY source`
    );

    // Get total auction counts by province (top 10)
    const provinceCounts = query<{ province: string; count: number }>(
      `SELECT province, COUNT(*) as count 
       FROM Auction 
       GROUP BY province 
       ORDER BY count DESC 
       LIMIT 10`
    );

    // Get auctions with coordinates vs without
    const coordinateStats = query<{ has_coords: number; count: number }>(
      `SELECT 
        CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END as has_coords,
        COUNT(*) as count
       FROM Auction
       GROUP BY has_coords`
    );

    // Get date range of auctions
    const dateRange = query<{ min_date: string; max_date: string }>(
      `SELECT 
        MIN(publishedAt) as min_date,
        MAX(publishedAt) as max_date
       FROM Auction`
    )[0];

    // Get total count
    const totalCount = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM Auction`
    )[0];

    return NextResponse.json({
      total: totalCount.count,
      byStatus: statusCounts,
      byCategory: categoryCounts,
      bySource: sourceCounts,
      byProvince: provinceCounts,
      coordinates: {
        withCoords: coordinateStats.find(s => s.has_coords === 1)?.count || 0,
        withoutCoords: coordinateStats.find(s => s.has_coords === 0)?.count || 0
      },
      dateRange: {
        earliest: dateRange?.min_date || null,
        latest: dateRange?.max_date || null
      }
    });

  } catch (error: any) {
    console.error('Auction stats error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
