/**
 * GET /api/user/subscription — account panel "Subscripción" card.
 *
 * Returns a single normalized shape the UI renders directly. Reads:
 *   - getAccessState() (@/lib/access) for the coarse account state + isActive,
 *   - the user's Subscription row (may be NULL — period dates are NULL under
 *     Whop until the webhook augment populates them going forward),
 *   - getTranslations("pricing") for the price label + the 6 "incluye" features,
 *     so they stay in lockstep with /precios (single source of truth).
 *
 * NULL-honest: if a field has no data we return null and the UI shows a
 * graceful fallback. We never fabricate dates.
 *
 * Auth: `auth()` → 401 if no session (mirrors api/user/profile).
 *
 * Response shape (Pixel consumes verbatim):
 *   {
 *     success: true,
 *     subscription: {
 *       isActive: boolean,
 *       state: 'paid-active' | 'trial-active' | 'trial-expired' | 'logged-out',
 *       plan: 'Acceso' | null,
 *       priceLabel: '5,99 €/mes' | null,
 *       status: string | null,
 *       currentPeriodStart: string | null,   // ISO
 *       currentPeriodEnd: string | null,      // ISO  ("fin del servicio")
 *       cancelAtPeriodEnd: boolean,
 *       trialEndDate: string | null,          // ISO  (trial-active / trial-expired)
 *       includes: string[],                   // 6 features, verbatim from /precios
 *     }
 *   }
 */
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { getAccessState } from '@/lib/access';
import { isPaid } from '@/lib/whop/plan-map';

interface SubscriptionRow {
  status: string | null;
  tier: string | null;
  currentPeriodStart: string | Date | null;
  currentPeriodEnd: string | Date | null;
  cancelAtPeriodEnd: boolean | null;
}

function toIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const access = await getAccessState();

    // Subscription row is optional (no row until a Whop event lands).
    const sub = await queryOne<SubscriptionRow>(
      `SELECT status, tier, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd
       FROM Subscription WHERE userId = ?`,
      [session.user.id],
    );

    const t = await getTranslations('pricing');

    // Plan label: any paid tier surfaces the single "Acceso" plan; FREE → null.
    const plan = isPaid(sub?.tier) || access.state === 'paid-active' ? 'Acceso' : null;

    // Price label reuses the /precios i18n: accesoPrice ("5,99 €") + monthlySuffix ("/mes").
    const priceLabel = plan ? `${t('accesoPrice')}${t('monthlySuffix')}` : null;

    const includes = [
      t('accesoFeature1'),
      t('accesoFeature2'),
      t('accesoFeature3'),
      t('accesoFeature4'),
      t('accesoFeature5'),
      t('accesoFeature6'),
    ];

    // trialEndDate is present on trial-active / trial-expired access states.
    const trialEndDate =
      access.state === 'trial-active' || access.state === 'trial-expired'
        ? toIso(access.trialEndDate ?? null)
        : null;

    return NextResponse.json({
      success: true,
      subscription: {
        isActive: access.hasFullAccess,
        state: access.state,
        plan,
        priceLabel,
        status: sub?.status ?? null,
        currentPeriodStart: toIso(sub?.currentPeriodStart),
        currentPeriodEnd: toIso(sub?.currentPeriodEnd),
        cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
        trialEndDate,
        includes,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { error: 'Error al obtener la suscripción' },
      { status: 500 },
    );
  }
}
