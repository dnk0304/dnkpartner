import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { randomUUID } from 'crypto';
import { buildAlertInsert } from '@/lib/alerts/alert-insert';

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const alerts = await query('SELECT * FROM Alert WHERE userId = ? ORDER BY id ASC', [session.user.id]);

    return NextResponse.json({
      success: true,
      alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Error al obtener las alertas' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { alerts } = body;

    // Delete all existing alerts for this user
    await execute('DELETE FROM Alert WHERE userId = ?', [session.user.id]);

    // Create new alerts
    if (alerts && Array.isArray(alerts) && alerts.length > 0) {
      const now = new Date().toISOString();
      for (const alert of alerts) {
        const { sql, params } = buildAlertInsert(alert, {
          id: randomUUID(),
          userId: session.user.id,
          now,
        });
        await execute(sql, params);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Alertas guardadas correctamente',
    });
  } catch (error) {
    console.error('Error updating alerts:', error);
    return NextResponse.json(
      { error: 'Error al guardar las alertas' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const id = randomUUID();
    const now = new Date().toISOString();

    const { sql, params } = buildAlertInsert(body, { id, userId: session.user.id, now });
    await execute(sql, params);

    const { province, municipality, category, source, propertyType, auctionType, statuses, minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType } = body;

    return NextResponse.json({
      success: true,
      alert: { id, userId: session.user.id, name: body.name ?? null, province, municipality, category, source, propertyType, auctionType, statuses, minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType },
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json(
      { error: 'Error al crear la alerta' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

    if (!alertId) {
      return NextResponse.json(
        { error: 'ID de alerta requerido' },
        { status: 400 }
      );
    }

    // Verify the alert belongs to the user
    const alerts = await query('SELECT * FROM Alert WHERE id = ? AND userId = ?', [alertId, session.user.id]);

    if (alerts.length === 0) {
      return NextResponse.json(
        { error: 'Alerta no encontrada' },
        { status: 404 }
      );
    }

    await execute('DELETE FROM Alert WHERE id = ? AND userId = ?', [alertId, session.user.id]);

    return NextResponse.json({
      success: true,
      message: 'Alerta eliminada correctamente',
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la alerta' },
      { status: 500 }
    );
  }
}
