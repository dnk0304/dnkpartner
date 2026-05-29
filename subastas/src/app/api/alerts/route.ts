import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { randomUUID } from 'crypto';
import { ensureAlertSchema } from '@/lib/alerts-schema';

// GET /api/alerts - Fetch user alerts
export async function GET(request: NextRequest) {
  try {
    ensureAlertSchema();
    const userId = request.headers.get('x-user-id') || 'demo-user-1';
    
    const alerts = query(`
      SELECT a.*, u.email as userEmail, u.tier as userTier
      FROM Alert a
      LEFT JOIN User u ON a.userId = u.id
      WHERE a.userId = ?
      ORDER BY a.id DESC
    `, [userId]);

    return NextResponse.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create new alert
export async function POST(request: NextRequest) {
  try {
    ensureAlertSchema();
    const userId = request.headers.get('x-user-id') || 'demo-user-1';
    const body = await request.json();

    const { name, province, municipality, category, source, auctionType, statuses, minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType } = body;
    const id = randomUUID();
    const now = new Date().toISOString();

    execute(`
      INSERT INTO Alert (
        id, userId, name, province, municipality, category, source, auctionType, statuses,
        minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType,
        createdAt, updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      userId,
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
      now
    ]);

    return NextResponse.json({
      success: true,
      data: { id, userId, name, province, municipality, category, source, auctionType, statuses, minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType }
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts/[id] - Delete alert
export async function DELETE(request: NextRequest) {
  try {
    ensureAlertSchema();
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Alert ID required' },
        { status: 400 }
      );
    }

    execute('DELETE FROM Alert WHERE id = ?', [id]);

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete alert' },
      { status: 500 }
    );
  }
}
