import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import bcrypt from 'bcryptjs';

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
    const { name, currentPassword, newPassword } = body;

    // Update name if provided
    if (name && name !== session.user.name) {
      await execute('UPDATE User SET name = ? WHERE id = ?', [name, session.user.id]);
    }

    // Update password if provided
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Se requiere la contraseña actual' },
          { status: 400 }
        );
      }

      // Verify current password
      const user = await queryOne<{ password: string | null }>(`
        SELECT password FROM User WHERE id = ?
      `, [session.user.id]);

      if (!user?.password) {
        return NextResponse.json(
          { error: 'Usuario no encontrado' },
          { status: 404 }
        );
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isPasswordValid) {
        return NextResponse.json(
          { error: 'Contraseña actual incorrecta' },
          { status: 400 }
        );
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await execute('UPDATE User SET password = ? WHERE id = ?', [hashedPassword, session.user.id]);
    }

    return NextResponse.json({
      success: true,
      message: 'Perfil actualizado correctamente',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el perfil' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const user = await queryOne<{
      id: string;
      email: string;
      name: string | null;
      tier: string;
      trialStartDate: string | Date | null;
      trialEndDate: string | Date | null;
      hasUsedTrial: number | boolean;
      createdAt: string | Date;
    }>(`
      SELECT id, email, name, tier, trialStartDate, trialEndDate, hasUsedTrial, createdAt
      FROM User WHERE id = ?
    `, [session.user.id]);

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // isAdmin flag (email allowlist, lib/admin.ts) lets the account dashboard
    // conditionally render the admin section. UI-only — the /api/admin/users
    // endpoint re-checks admin server-side, never trusting this flag.
    return NextResponse.json({
      success: true,
      user,
      isAdmin: isAdmin(session),
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Error al obtener el perfil' },
      { status: 500 }
    );
  }
}
