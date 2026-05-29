import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const province = searchParams.get('province');

    // Build SQL query
    let sql = 'SELECT province, status FROM Auction';
    const params: any[] = [];
    
    if (province) {
      sql += ' WHERE province = ?';
      params.push(province);
    }

    // Get counts grouped by province and status
    const auctions = query<{ province: string; status: string }>(sql, params);

    // Aggregate counts
    const statsByProvince: Record<string, { active: number; preAuction: number; finished: number; total: number }> = {};

    for (const auction of auctions) {
      if (!statsByProvince[auction.province]) {
        statsByProvince[auction.province] = {
          active: 0,
          preAuction: 0,
          finished: 0,
          total: 0
        };
      }

      statsByProvince[auction.province].total++;

      switch (auction.status) {
        case 'ACTIVE':
        case 'SUSPENDED':
          statsByProvince[auction.province].active++;
          break;
        case 'PRE_AUCTION':
          statsByProvince[auction.province].preAuction++;
          break;
        case 'FINISHED':
        case 'CANCELLED':
          statsByProvince[auction.province].finished++;
          break;
      }
    }

    return NextResponse.json({
      success: true,
      data: statsByProvince
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
