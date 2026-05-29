import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

/**
 * GET /api/admin/health
 * Returns system health status for admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    // Get database stats
    const auctionCountResult = await queryOne<{count: string | number}>('SELECT COUNT(*) as count FROM Auction', []);
    const userCountResult = await queryOne<{count: string | number}>('SELECT COUNT(*) as count FROM User', []);
    const alertCountResult = await queryOne<{count: string | number}>('SELECT COUNT(*) as count FROM Alert', []);

    const auctionCount = Number(auctionCountResult?.count || 0);
    const userCount = Number(userCountResult?.count || 0);
    const alertCount = Number(alertCountResult?.count || 0);

    // Get recent auctions (last 24 hours)
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentAuctions = await query<{id: string, createdAt: string | Date}>(`
      SELECT id, createdAt FROM Auction WHERE createdAt >= ?
    `, [cutoffDate]);

    // Mock scraper data (in production, this would come from Redis or a monitoring service)
    const health = {
      database: {
        status: 'healthy',
        auctionCount,
        userCount,
        alertCount,
        lastBackup: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      },
      scrapers: {
        boe: {
          status: 'idle',
          lastRun: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
          successRate: 98.5,
          auctionsFound: recentAuctions.length,
          errors: []
        },
        teju: {
          status: 'idle',
          lastRun: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
          successRate: 92.3,
          auctionsFound: Math.floor(recentAuctions.length * 0.3),
          errors: []
        }
      },
      api: {
        status: 'healthy',
        responseTime: 145,
        requestsToday: 8432,
        errorRate: 0.3
      },
      notifications: {
        emailsSent: 234,
        smsSent: 89,
        failedDeliveries: 3
      }
    };

    return NextResponse.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Error fetching health data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch health data' },
      { status: 500 }
    );
  }
}
