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

    // Get all users with their details
    const users = query<{
      id: string;
      email: string;
      name: string | null;
      tier: string;
      createdAt: string;
      emailVerified: string | null;
      trialEndsAt: string | null;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    }>(
      `SELECT 
        id, email, name, tier, createdAt, emailVerified, 
        trialEndsAt, stripeCustomerId, stripeSubscriptionId
       FROM User 
       ORDER BY createdAt DESC`
    );

    // Get user counts by tier
    const tierCounts = query<{ tier: string; count: number }>(
      `SELECT tier, COUNT(*) as count 
       FROM User 
       GROUP BY tier`
    );

    // Get alert counts by user
    const alertCounts = query<{ userId: string; count: number }>(
      `SELECT userId, COUNT(*) as count 
       FROM Alert 
       WHERE active = 1 
       GROUP BY userId`
    );

    // Enrich users with alert counts
    const enrichedUsers = users.map(user => ({
      ...user,
      alertCount: alertCounts.find(a => a.userId === user.id)?.count || 0,
      hasSubscription: !!user.stripeSubscriptionId,
      isTrialActive: user.trialEndsAt ? new Date(user.trialEndsAt) > new Date() : false
    }));

    return NextResponse.json({
      users: enrichedUsers,
      summary: {
        total: users.length,
        byTier: tierCounts,
        withSubscriptions: users.filter(u => u.stripeSubscriptionId).length,
        withActiveTrials: users.filter(u => u.trialEndsAt && new Date(u.trialEndsAt) > new Date()).length
      }
    });

  } catch (error: any) {
    console.error('Users list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
