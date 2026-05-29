/**
 * Push Subscription API
 * Save user's push notification subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { endpoint, keys } = await request.json();
    
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }
    
    // Check if subscription exists
    const existing = queryOne<{ id: string }>(`
      SELECT id FROM PushSubscription WHERE endpoint = ?
    `, [endpoint]);
    
    if (existing) {
      // Update existing
      execute(`
        UPDATE PushSubscription 
        SET p256dh = ?, auth = ?, userId = ?
        WHERE endpoint = ?
      `, [keys.p256dh, keys.auth, session.user.id, endpoint]);
    } else {
      // Create new
      const id = `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      execute(`
        INSERT INTO PushSubscription (id, userId, endpoint, p256dh, auth, createdAt)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `, [id, session.user.id, endpoint, keys.p256dh, keys.auth]);
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { endpoint } = await request.json();
    
    execute(`
      DELETE FROM PushSubscription WHERE userId = ? AND endpoint = ?
    `, [session.user.id, endpoint]);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
