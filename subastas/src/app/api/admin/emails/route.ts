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

    // Get alert counts (proxy for email activity)
    const alertStats = query<{ active: number; count: number }>(
      `SELECT active, COUNT(*) as count 
       FROM Alert 
       GROUP BY active`
    );

    // Get users with most alerts
    const topAlertUsers = query<{ userId: string; email: string; count: number }>(
      `SELECT 
        A.userId, 
        U.email,
        COUNT(*) as count 
       FROM Alert A
       JOIN User U ON A.userId = U.id
       WHERE A.active = 1
       GROUP BY A.userId, U.email
       ORDER BY count DESC
       LIMIT 10`
    );

    // Get alert creation timeline (last 30 days)
    const recentAlerts = query<{ date: string; count: number }>(
      `SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count 
       FROM Alert 
       WHERE createdAt >= datetime('now', '-30 days')
       GROUP BY DATE(createdAt)
       ORDER BY date DESC`
    );

    const totalAlerts = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM Alert`
    )[0];

    return NextResponse.json({
      totalAlerts: totalAlerts.count,
      activeAlerts: alertStats.find(s => s.active === 1)?.count || 0,
      inactiveAlerts: alertStats.find(s => s.active === 0)?.count || 0,
      topUsers: topAlertUsers,
      recentActivity: recentAlerts,
      note: 'Email logs are tracked through alert system. Each active alert triggers email notifications when matching auctions are found.'
    });

  } catch (error: any) {
    console.error('Email logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
