import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { randomUUID } from 'crypto';
import { ensureAlertSchema } from '@/lib/alerts-schema';

export async function GET(request: NextRequest) {
  try {
    ensureAlertSchema();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const alerts = query('SELECT * FROM Alert WHERE userId = ? ORDER BY id ASC', [session.user.id]);

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
    ensureAlertSchema();
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
    execute('DELETE FROM Alert WHERE userId = ?', [session.user.id]);

    // Create new alerts
    if (alerts && Array.isArray(alerts) && alerts.length > 0) {
      const now = new Date().toISOString();
      for (const alert of alerts) {
        const id = randomUUID();
        execute(`
          INSERT INTO Alert (
            id, userId, name, province, municipality, category, source, auctionType, statuses,
            minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType,
            createdAt, updatedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          session.user.id,
          alert.name || null,
          alert.province || null,
          alert.municipality || null,
          alert.category || null,
          alert.source || null,
          alert.auctionType || null,
          alert.statuses || null,
          alert.minPrice ? parseFloat(alert.minPrice) : null,
          alert.maxPrice ? parseFloat(alert.maxPrice) : null,
          alert.keywords || null,
          alert.emailEnabled ? 1 : 0,
          alert.smsEnabled ? 1 : 0,
          alert.notificationType || 'grouped',
          now,
          now
        ]);
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
    ensureAlertSchema();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { province, municipality, category, source, auctionType, statuses, minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType } = body;
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
      session.user.id,
      body.name || null,
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
      alert: { id, userId: session.user.id, province, municipality, category, source, auctionType, statuses, minPrice, maxPrice, keywords, emailEnabled, smsEnabled, notificationType },
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
    ensureAlertSchema();
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
    const alerts = query('SELECT * FROM Alert WHERE id = ? AND userId = ?', [alertId, session.user.id]);

    if (alerts.length === 0) {
      return NextResponse.json(
        { error: 'Alerta no encontrada' },
        { status: 404 }
      );
    }

    execute('DELETE FROM Alert WHERE id = ?', [alertId]);

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
