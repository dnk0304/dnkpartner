import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { randomUUID } from 'crypto';
import { ensureAlertSchema } from '@/lib/alerts-schema';

// GET /api/alerts - Fetch the authenticated user's alerts
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    ensureAlertSchema();

    const alerts = query(`
      SELECT a.*, u.email as userEmail, u.tier as userTier
      FROM Alert a
      LEFT JOIN User u ON a.userId = u.id
      WHERE a.userId = ?
      ORDER BY a.id DESC
    `, [session.user.id]);

    return NextResponse.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create new alert for the authenticated user
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    ensureAlertSchema();

    const body = await request.json();
    const {
      name,
      province,
      municipality,
      category,
      source,
      auctionType,
      statuses,
      minPrice,
      maxPrice,
      keywords,
      emailEnabled,
      smsEnabled,
      notificationType,
    } = body;

    const id = randomUUID();
    const now = new Date().toISOString();

    execute(`
      INSERT INTO Alert (
        id, userId, name, province, municipality, category, source, auctionType, statuses,
        minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType,
        createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      session.user.id,
      name || null,
      province || null,
      municipality || null,
      category || null,
      source || null,
      auctionType || null,
      statuses || null,
      minPrice ? parseFloat(minPrice) : null,
      maxPrice ? parseFloat(maxPrice) : null,
      keywords || null,
      emailEnabled ? 1 : 0,
      smsEnabled ? 1 : 0,
      notificationType || 'grouped',
      now,
      now,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        id,
        userId: session.user.id,
        name,
        province,
        municipality,
        category,
        source,
        auctionType,
        statuses,
        minPrice,
        maxPrice,
        keywords,
        emailEnabled,
        smsEnabled,
        notificationType,
      },
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts?id=xxx - Delete an alert owned by the authenticated user
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    ensureAlertSchema();

    const url = new URL(request.url);
    const id = url.searchParams.get('id') || url.pathname.split('/').pop();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Alert ID required' },
        { status: 400 }
      );
    }

    // Verify ownership before deleting — prevent IDOR.
    const existing = queryOne<{ id: string }>(
      'SELECT id FROM Alert WHERE id = ? AND userId = ?',
      [id, session.user.id]
    );

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Alert not found' },
        { status: 404 }
      );
    }

    execute('DELETE FROM Alert WHERE id = ? AND userId = ?', [id, session.user.id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete alert' },
      { status: 500 }
    );
  }
}
