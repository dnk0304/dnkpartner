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

    // Get alert counts (proxy for email activity)
    const alertStats = await query<{ active: boolean; count: string | number }>(
      `SELECT active, COUNT(*) as count
       FROM Alert
       GROUP BY active`
    );

    // Get users with most alerts
    const topAlertUsers = await query<{ userId: string; email: string; count: string | number }>(
      `SELECT
        A.userId,
        U.email,
        COUNT(*) as count
       FROM Alert A
       JOIN User U ON A.userId = U.id
       WHERE A.active = ?
       GROUP BY A.userId, U.email
       ORDER BY count DESC
       LIMIT 10`,
      [true]
    );

    // Get alert creation timeline (last 30 days)
    const recentAlerts = await query<{ date: string; count: string | number }>(
      `SELECT
        DATE(createdAt) as date,
        COUNT(*) as count
       FROM Alert
       WHERE createdAt >= datetime('now', '-30 days')
       GROUP BY DATE(createdAt)
       ORDER BY date DESC`
    );

    const totalAlertsRows = await query<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM Alert`
    );

    const isActive = (v: unknown) => v === true || v === 1;
    return NextResponse.json({
      totalAlerts: Number(totalAlertsRows[0]?.count || 0),
      activeAlerts: Number(alertStats.find(s => isActive(s.active))?.count || 0),
      inactiveAlerts: Number(alertStats.find(s => !isActive(s.active))?.count || 0),
      topUsers: topAlertUsers.map(u => ({ ...u, count: Number(u.count) })),
      recentActivity: recentAlerts.map(a => ({ ...a, count: Number(a.count) })),
      note: 'Email logs are tracked through alert system. Each active alert triggers email notifications when matching auctions are found.'
    });

  } catch (error: any) {
    console.error('Email logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
