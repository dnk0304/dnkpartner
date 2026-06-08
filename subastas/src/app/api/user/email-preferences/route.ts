/**
 * GET + PUT /api/user/email-preferences — account panel "Preferencias de email".
 *
 * Reads/writes the three boolean email-preference columns on "User"
 * (prefNewsletter / prefWeeklyNoNew / prefRadar), added in migration
 * 20260608_add_user_email_prefs (all DEFAULT true).
 *
 * IMPORTANT: these prefs are a SETTINGS SURFACE ONLY in this wave. They are
 * persisted here but NOT yet consumed by any email send-path — wiring them into
 * the digest/radar mailers is a later wave.
 *
 * Auth: mirrors api/user/profile — `auth()` → 401 if no session. DB access via
 * the raw-SQL adapter (@/lib/db, queryOne/execute) to match the neighbouring
 * user routes.
 *
 * Response shape (Pixel consumes verbatim):
 *   GET  200 → { success: true, prefs: { newsletter, weeklyNoNew, radar } }
 *   PUT  body { newsletter?, weeklyNoNew?, radar? }  (booleans, partial)
 *        200 → { success: true, prefs: { newsletter, weeklyNoNew, radar } }
 *   401  → { error: 'No autorizado' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';

interface PrefsRow {
  prefNewsletter: boolean;
  prefWeeklyNoNew: boolean;
  prefRadar: boolean;
}

interface PrefsDto {
  newsletter: boolean;
  weeklyNoNew: boolean;
  radar: boolean;
}

function toDto(row: PrefsRow): PrefsDto {
  return {
    newsletter: Boolean(row.prefNewsletter),
    weeklyNoNew: Boolean(row.prefWeeklyNoNew),
    radar: Boolean(row.prefRadar),
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const row = await queryOne<PrefsRow>(
      'SELECT prefNewsletter, prefWeeklyNoNew, prefRadar FROM User WHERE id = ?',
      [session.user.id],
    );

    if (!row) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, prefs: toDto(row) });
  } catch (error) {
    console.error('Error fetching email preferences:', error);
    return NextResponse.json(
      { error: 'Error al obtener las preferencias de email' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => ({}));
    const input = (body ?? {}) as {
      newsletter?: unknown;
      weeklyNoNew?: unknown;
      radar?: unknown;
    };

    // Persist only provided keys; ignore anything non-boolean.
    const sets: string[] = [];
    const params: unknown[] = [];
    if (typeof input.newsletter === 'boolean') {
      sets.push('prefNewsletter = ?');
      params.push(input.newsletter);
    }
    if (typeof input.weeklyNoNew === 'boolean') {
      sets.push('prefWeeklyNoNew = ?');
      params.push(input.weeklyNoNew);
    }
    if (typeof input.radar === 'boolean') {
      sets.push('prefRadar = ?');
      params.push(input.radar);
    }

    if (sets.length > 0) {
      params.push(session.user.id);
      await execute(`UPDATE User SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    // Return the post-update state so the UI reflects persisted values.
    const row = await queryOne<PrefsRow>(
      'SELECT prefNewsletter, prefWeeklyNoNew, prefRadar FROM User WHERE id = ?',
      [session.user.id],
    );

    if (!row) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, prefs: toDto(row) });
  } catch (error) {
    console.error('Error updating email preferences:', error);
    return NextResponse.json(
      { error: 'Error al actualizar las preferencias de email' },
      { status: 500 },
    );
  }
}
