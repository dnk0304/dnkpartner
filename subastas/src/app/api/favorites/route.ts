import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';

// GET /api/favorites - Get user's favorites
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const favorites = await query<any>(`
      SELECT
        f.id,
        f.auctionId,
        f.notes,
        f.createdAt,
        a.*
      FROM Favorite f
      JOIN Auction a ON f.auctionId = a.id
      WHERE f.userId = ?
      ORDER BY f.createdAt DESC
    `, [session.user.id]);

    return NextResponse.json({ success: true, data: favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

// POST /api/favorites - Add a favorite
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { auctionId, notes } = body;
    
    if (!auctionId) {
      return NextResponse.json({ error: 'auctionId is required' }, { status: 400 });
    }
    
    // Check if already favorited
    const existing = await queryOne<{ id: string }>(`
      SELECT id FROM Favorite WHERE userId = ? AND auctionId = ?
    `, [session.user.id, auctionId]);

    if (existing) {
      return NextResponse.json({ error: 'Already favorited' }, { status: 400 });
    }

    // Generate ID (simple cuid-like)
    const favoriteId = `fav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await execute(`
      INSERT INTO Favorite (id, userId, auctionId, notes, createdAt)
      VALUES (?, ?, ?, ?, datetime('now'))
    `, [favoriteId, session.user.id, auctionId, notes || null]);

    // Update favorite count on auction
    await execute(`
      UPDATE Auction SET favoriteCount = favoriteCount + 1 WHERE id = ?
    `, [auctionId]);

    const favorite = await queryOne<any>(`
      SELECT
        f.id,
        f.auctionId,
        f.notes,
        f.createdAt,
        a.*
      FROM Favorite f
      JOIN Auction a ON f.auctionId = a.id
      WHERE f.id = ?
    `, [favoriteId]);

    return NextResponse.json({ success: true, data: favorite });
  } catch (error) {
    console.error('Error creating favorite:', error);
    return NextResponse.json({ error: 'Failed to create favorite' }, { status: 500 });
  }
}

// DELETE /api/favorites?auctionId=xxx - Remove a favorite
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const auctionId = searchParams.get('auctionId');
    
    if (!auctionId) {
      return NextResponse.json({ error: 'auctionId is required' }, { status: 400 });
    }
    
    await execute(`
      DELETE FROM Favorite WHERE userId = ? AND auctionId = ?
    `, [session.user.id, auctionId]);

    // Update favorite count on auction (PG uses GREATEST, not 2-arg MAX).
    await execute(`
      UPDATE Auction SET favoriteCount = GREATEST(favoriteCount - 1, 0) WHERE id = ?
    `, [auctionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting favorite:', error);
    return NextResponse.json({ error: 'Failed to delete favorite' }, { status: 500 });
  }
}

// PATCH /api/favorites - Update favorite notes
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { auctionId, notes } = body;
    
    if (!auctionId) {
      return NextResponse.json({ error: 'auctionId is required' }, { status: 400 });
    }
    
    await execute(`
      UPDATE Favorite SET notes = ? WHERE userId = ? AND auctionId = ?
    `, [notes, session.user.id, auctionId]);

    const updated = await queryOne<any>(`
      SELECT
        f.id,
        f.auctionId,
        f.notes,
        f.createdAt,
        a.*
      FROM Favorite f
      JOIN Auction a ON f.auctionId = a.id
      WHERE f.userId = ? AND f.auctionId = ?
    `, [session.user.id, auctionId]);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating favorite:', error);
    return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 });
  }
}
