/**
 * GET /api/user/invoices — account panel "Facturas" section.
 *
 * STUB for now. Whop invoices/receipts are NOT wired (the Whop receipts/payments
 * pull is unverified and deliberately deferred — Ken's call, plan 00 decision 1b).
 * Returns an empty list so the UI renders the "No hay facturas disponibles"
 * empty state.
 *
 * The response is shaped so a real invoice list can drop in later WITHOUT a
 * contract change for Pixel: `invoices` becomes a populated array of:
 *   {
 *     id: string,
 *     date: string,        // ISO
 *     amount: number,      // minor units or decimal — fix when wiring real data
 *     currency: string,    // e.g. 'EUR'
 *     status: string,      // e.g. 'paid'
 *     url: string | null,  // hosted receipt/invoice PDF, if any
 *   }
 *
 * Auth: `auth()` → 401 if no session (mirrors api/user/profile).
 *
 * Response shape (Pixel consumes verbatim):
 *   200 → { success: true, invoices: [] }
 *   401 → { error: 'No autorizado' }
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export interface UserInvoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  url: string | null;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // No invoice source wired yet — empty list drives the UI empty state.
    const invoices: UserInvoice[] = [];

    return NextResponse.json({ success: true, invoices });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Error al obtener las facturas' },
      { status: 500 },
    );
  }
}
