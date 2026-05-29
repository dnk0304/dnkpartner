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

    // Get all users with their details.
    // Note: trialEndDate (not trialEndsAt — pre-existing typo in old code) is the column name.
    // stripeCustomerId / stripeSubscriptionId live on the Subscription table, not User — fetch via LEFT JOIN.
    const users = await query<{
      id: string;
      email: string;
      name: string | null;
      tier: string;
      createdAt: string | Date;
      emailVerified: string | Date | null;
      trialEndDate: string | Date | null;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    }>(
      `SELECT
        u.id, u.email, u.name, u.tier, u.createdAt, u.emailVerified,
        u.trialEndDate,
        s.stripeCustomerId, s.stripeSubscriptionId
       FROM User u
       LEFT JOIN Subscription s ON s.userId = u.id
       ORDER BY u.createdAt DESC`
    );

    // Get user counts by tier
    const tierCounts = await query<{ tier: string; count: string | number }>(
      `SELECT tier, COUNT(*) as count
       FROM User
       GROUP BY tier`
    );

    // Get alert counts by user
    const alertCounts = await query<{ userId: string; count: string | number }>(
      `SELECT userId, COUNT(*) as count
       FROM Alert
       WHERE active = ?
       GROUP BY userId`,
      [true]
    );

    // Enrich users with alert counts
    const enrichedUsers = users.map(user => ({
      ...user,
      alertCount: Number(alertCounts.find(a => a.userId === user.id)?.count || 0),
      hasSubscription: !!user.stripeSubscriptionId,
      isTrialActive: user.trialEndDate ? new Date(user.trialEndDate) > new Date() : false
    }));

    return NextResponse.json({
      users: enrichedUsers,
      summary: {
        total: users.length,
        byTier: tierCounts.map(t => ({ ...t, count: Number(t.count) })),
        withSubscriptions: users.filter(u => u.stripeSubscriptionId).length,
        withActiveTrials: users.filter(u => u.trialEndDate && new Date(u.trialEndDate) > new Date()).length
      }
    });

  } catch (error: any) {
    console.error('Users list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
