import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { query, queryOne } from '@/lib/db';

/**
 * GET /api/admin/users — ADMIN-GATED registered-users list.
 *
 * SECURITY (the one thing to get right): the admin check is enforced
 * SERVER-SIDE, here, before any user data is read. Three outcomes:
 *   - no session (logged-out)             -> 403
 *   - valid session, non-admin email      -> 403
 *   - valid session, admin email          -> 200 + paginated list
 * Never rely on the UI hiding the section — a non-admin hitting this URL
 * directly gets 403 and zero rows. Admin-ness comes from lib/admin.ts
 * (email allowlist), NOT a DB column — no migration.
 *
 * Safe fields only. Password hash is NEVER selected. trialEndDate (NOT
 * trialEndsAt — pre-existing column name) carries the trial clock;
 * stripe ids live on the Subscription table, joined in. Ordered newest-first.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  createdAt: string | Date;
  emailVerified: string | Date | null;
  trialStartDate: string | Date | null;
  trialEndDate: string | Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export async function GET(request: NextRequest) {
  // --- Hard admin gate (server-side) ---------------------------------------
  // auth() resolves the NextAuth session. isAdmin() is the email-allowlist
  // check (case-insensitive). Logged-out OR normal user -> 403, no data.
  let session;
  try {
    session = await auth();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Pagination ----------------------------------------------------------
  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const pageSize = Math.min(
    parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const offset = (page - 1) * pageSize;

  try {
    // Total count first so the UI can render pagination + the header summary.
    const totalRow = await queryOne<{ count: string | number }>(
      'SELECT COUNT(*) as count FROM User',
    );
    const total = Number(totalRow?.count ?? 0);

    // Page of users (safe fields only — no password). Subscription LEFT JOIN
    // for the stripe ids. Newest first, LIMIT/OFFSET paginated.
    const users = await query<UserRow>(
      `SELECT
        u.id, u.email, u.name, u.tier, u.createdAt, u.emailVerified,
        u.trialStartDate, u.trialEndDate,
        s.stripeCustomerId, s.stripeSubscriptionId
       FROM User u
       LEFT JOIN Subscription s ON s.userId = u.id
       ORDER BY u.createdAt DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset],
    );

    // Alert counts for just this page's users (avoids scanning all alerts).
    const userIds = users.map((u) => u.id);
    const alertCounts =
      userIds.length > 0
        ? await query<{ userId: string; count: string | number }>(
            `SELECT userId, COUNT(*) as count
             FROM Alert
             WHERE active = ? AND userId IN (${userIds.map(() => '?').join(',')})
             GROUP BY userId`,
            [true, ...userIds],
          )
        : [];

    const now = Date.now();
    const enrichedUsers = users.map((user) => {
      const trialEnd = user.trialEndDate ? new Date(user.trialEndDate) : null;
      const isTrialActive =
        trialEnd !== null &&
        Number.isFinite(trialEnd.getTime()) &&
        trialEnd.getTime() > now;
      const isPaid =
        user.tier === 'ACCESO' || user.tier === 'GOLD' || user.tier === 'DIAMOND';
      // Whole days remaining on the trial clock, floored at 0. `null` only when
      // the row has no trialEndDate at all. Derived from trialEndDate for every
      // tier (paid users get the number too — the UI keys "Pagado" off `status`,
      // not this field). Additive: feeds Pixel's "días restantes" column so the
      // client renders a number instead of doing date math.
      const trialDaysLeft: number | null =
        trialEnd !== null && Number.isFinite(trialEnd.getTime())
          ? Math.max(0, Math.ceil((trialEnd.getTime() - now) / 86_400_000))
          : null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        trialStartDate: user.trialStartDate,
        trialEndDate: user.trialEndDate,
        trialDaysLeft,
        alertCount: Number(
          alertCounts.find((a) => a.userId === user.id)?.count ?? 0,
        ),
        hasSubscription: !!user.stripeSubscriptionId,
        isTrialActive,
        // status: paid | trial | expired — derived, for convenience.
        status: isPaid ? 'paid' : isTrialActive ? 'trial' : 'expired',
      };
    });

    // --- Summary (whole table, not just the page) --------------------------
    const tierCounts = await query<{ tier: string; count: string | number }>(
      `SELECT tier, COUNT(*) as count FROM User GROUP BY tier`,
    );
    const paidCount = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM User WHERE tier IN (?, ?, ?)`,
      ['ACCESO', 'GOLD', 'DIAMOND'],
    );
    const trialCount = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM User
       WHERE tier = ? AND trialEndDate IS NOT NULL AND trialEndDate > ?`,
      ['FREE', new Date(now).toISOString()],
    );

    return NextResponse.json({
      users: enrichedUsers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      summary: {
        total,
        paid: Number(paidCount?.count ?? 0),
        trial: Number(trialCount?.count ?? 0),
        byTier: tierCounts.map((t) => ({ tier: t.tier, count: Number(t.count) })),
      },
    });
  } catch (error) {
    console.error('Users list error:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
