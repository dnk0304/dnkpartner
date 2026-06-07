import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// SINGLE GATE BOUNDARY (Dennis 2026-06-07, wave-B1 RE-FLIP): notifications /
// alerts are now PAID-ONLY. The model is:
//   PUBLIC                     → teasers everywhere (cards + SSR detail teaser)
//   REGISTER (free logged-in)  → full auction detail
//   PAID (Whop active)         → notifications + alerts
//
// `getAccessState()` returns `hasFullAccess=true` for paid-active OR
// trial-active sessions; the alert path piggybacks on that since the trial
// is "paid-equivalent for the trial window" by design.
//
// To OPEN this capability fully (no account required), change `ALERT_GATE`
// to `'none'`. To loosen back to "any logged-in account", flip to `'auth'`.
// One knob, one file. When the freemium experiment ends, flip the constant;
// no other code needs to change.
// ---------------------------------------------------------------------------
type AlertGate = 'none' | 'auth' | 'paid';
const ALERT_GATE: AlertGate = 'paid';

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
    // and 'none' skip the paid check entirely.
    //
    // Wave-B1 (2026-06-07): the gate is `'paid'` again. The detail page is
    // freely accessible to any registered (logged-in) user; alerts and
    // notifications are the new paid surface. `getAccessState()` returns
    // `hasFullAccess=true` for either paid-active or trial-active sessions
    // — both pass; only `logged-out` and `trial-expired` get 402.
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
                ? 'Tu periodo de prueba ha terminado. Activa el plan Acceso para recibir alertas.'
                : 'Activa el plan Acceso para recibir alertas.',
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
