import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// SINGLE GATE BOUNDARY (Dennis 2026-06-07, wave-A): alerts require
// AUTHENTICATION ONLY (a free logged-in account). Not paid. Not trial-active.
// Just signed-in.
//
// To OPEN this capability fully (no account required), change
// `ALERT_GATE` from `'auth'` to `'none'` and the POST handler will fall
// through without the auth check. To TIGHTEN it back to paid/trial-active,
// flip to `'paid'` and the handler will re-check `getAccessState()`.
//
// This is intentionally one knob, one file, one comment — Dennis: "we will
// strip it away eventually." When that day comes, flip the constant; no
// other code needs to change.
// ---------------------------------------------------------------------------
type AlertGate = 'none' | 'auth' | 'paid';
const ALERT_GATE: AlertGate = 'auth';

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

    const alerts = await query(`
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

// POST /api/alerts - Create new alert.
//
// Gate (wave-A, 2026-06-07): the detail page is now public, but creating
// an alert/notification requires an account. The exact tier required is
// controlled by `ALERT_GATE` at the top of this file — see the single
// flip-point comment there.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    // ALERT_GATE = 'auth' or 'paid' both require a session. ALERT_GATE = 'none'
    // would skip the auth check entirely (anonymous alerts are not currently
    // supported elsewhere — flipping to 'none' would require persisting an
    // owner identity by some other means, e.g. an email-only stub).
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'auth.required',
          message: 'Crea una cuenta gratuita para recibir alertas de subastas.',
        },
        { status: 401 }
      );
    }

    // ALERT_GATE = 'paid' additionally checks tier/trial. ALERT_GATE = 'auth'
    // (the default since wave-A) and 'none' skip the paid check entirely.
    if (ALERT_GATE === 'paid') {
      const { getAccessState } = await import('@/lib/access');
      const access = await getAccessState();
      if (!access.hasFullAccess) {
        return NextResponse.json(
          {
            success: false,
            error: 'gate.full_access_required',
            message:
              access.state === 'trial-expired'
                ? 'Tu periodo de prueba ha terminado. Activa el plan Acceso para crear alertas.'
                : 'Las alertas requieren una cuenta con prueba activa o plan Acceso.',
            access: { state: access.state },
          },
          { status: 402 }
        );
      }
    }

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

    await execute(`
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
      emailEnabled ? true : false,
      smsEnabled ? true : false,
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

    const url = new URL(request.url);
    const id = url.searchParams.get('id') || url.pathname.split('/').pop();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Alert ID required' },
        { status: 400 }
      );
    }

    // Verify ownership before deleting — prevent IDOR.
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM Alert WHERE id = ? AND userId = ?',
      [id, session.user.id]
    );

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Alert not found' },
        { status: 404 }
      );
    }

    await execute('DELETE FROM Alert WHERE id = ? AND userId = ?', [id, session.user.id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete alert' },
      { status: 500 }
    );
  }
}
