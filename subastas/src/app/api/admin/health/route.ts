import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helpers';

/**
 * GET /api/admin/health
 * Returns system health status for admin dashboard.
 *
 * HISTORY:
 *  - Previously had NO auth gate. Leaked real auction/user/alert counts +
 *    backfill timestamp to anonymous strangers. Live-curl-verified hole.
 *    Locked to admin via requireAdmin().
 *  - Previously also returned fabricated fields (api.responseTime,
 *    api.requestsToday, api.errorRate, notifications.emailsSent /
 *    smsSent / failedDeliveries, scrapers.*.successRate, database.lastBackup).
 *    Those were hardcoded mocks with no real source. They have been REMOVED
 *    rather than fabricated. A small honest payload beats a big lying one.
 *    If/when a metrics store or backup job exists, restore the fields with
 *    real values.
 */
export async function GET(_request: NextRequest) {
  // HARD ADMIN GATE.
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    // Real DB stats.
    const auctionCountResult = await queryOne<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM Auction',
      [],
    );
    const userCountResult = await queryOne<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM User',
      [],
    );
    const alertCountResult = await queryOne<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM Alert',
      [],
    );

    const auctionCount = Number(auctionCountResult?.count || 0);
    const userCount = Number(userCountResult?.count || 0);
    const alertCount = Number(alertCountResult?.count || 0);

    // Real: auctions inserted in the last 24h (proxy for scraper activity).
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentAuctions = await query<{ id: string; createdAt: string | Date }>(
      `SELECT id, createdAt FROM Auction WHERE createdAt >= ?`,
      [cutoffDate],
    );

    // Derive last-scraper-run from the newest createdAt in the 24h window.
    // Null if no auctions were ingested in that window (don't fabricate).
    let lastRun: string | null = null;
    if (recentAuctions.length > 0) {
      const newest = recentAuctions.reduce<Date>((max, r) => {
        const d = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
        return d > max ? d : max;
      }, new Date(0));
      lastRun = newest.toISOString();
    }

    const health = {
      database: {
        status: 'healthy' as const,
        auctionCount,
        userCount,
        alertCount,
      },
      scrapers: {
        boe: {
          status: 'idle' as const,
          lastRun,
          auctionsFound: recentAuctions.length,
        },
      },
    };

    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('Error fetching health data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch health data' },
      { status: 500 },
    );
  }
}
