/**
 * GET /api/follow/confirm?token=…  — one-click "Follow this auction" from the
 * saved-search Alert email ("Seguir esta subasta" button).
 *
 * Flow (Ken brief 2026-07-25, Niki "pure one-click" decision):
 *   1. Verify the stateless HMAC token (src/lib/follow-token.ts): signature,
 *      purpose ("follow"), and expiry (30 days).
 *   2. Require an authenticated session (Option B, Dennis 2026-07-28). No
 *      session → redirect to /login?callbackUrl=<this confirm URL, token intact>
 *      so the user lands back here after auth and the flow completes.
 *   3. Session present but session.userId !== token.userId → REFUSE. Never
 *      follow under the wrong account (redirect ?follow=mismatch). This blocks
 *      cross-account follows AND email-scanner prefetch auto-following (a
 *      scanner has no session, so it can never create a follow anymore).
 *   4. Session matches the token's user → idempotently create the Favorite
 *      (the follow record) for the token's (userId, auctionId), then redirect to
 *      the auction detail page with ?follow=ok (new) / ?follow=exists.
 *   5. Invalid / expired → FALLBACK: redirect to the auction page (login-gated
 *      on-page "Seguir" still works) with ?follow=expired. When the token isn't
 *      even signature-valid, redirect to the auctions listing with the flag.
 *
 * No DB table / migration — the token carries everything. The Favorite gets its
 * per-event notify prefs from the table's column DEFAULTs (all notifyOn* = true,
 * channels = 'email,inapp'), exactly like the on-page "Seguir" (POST /api/favorites).
 *
 * Security: the userId is INSIDE the signed payload (unforgeable, expiring,
 * single-purpose — see follow-token.ts). Option B adds a second gate on top: the
 * follow is only recorded once the token's user has authenticated in THIS browser
 * session, so a follow is always explicitly tied to a proven, logged-in account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { queryOne, execute } from '@/lib/db';
import { auth } from '@/lib/auth';
import { verifyFollowToken, peekAuctionId } from '@/lib/follow-token';
import { decideFollowConfirm } from '@/lib/follow-confirm-decision';
import { fetchV3Url, resolveAuctionPath } from '@/lib/seo/auction-url';

export const dynamic = 'force-dynamic';

type AuctionSlugRow = {
  id: string;
  auctionType: string | null;
  province: string | null;
  municipality: string | null;
};

function appOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    request.nextUrl.origin
  );
}

function redirectTo(origin: string, path: string): NextResponse {
  // 303 See Other — correct for a GET that performed a side effect and hands
  // the browser off to a plain GET of the result page.
  return NextResponse.redirect(new URL(path, origin), { status: 303 });
}

async function loadSlugRow(auctionId: string): Promise<AuctionSlugRow | undefined> {
  return queryOne<AuctionSlugRow>(
    `SELECT id, auctionType, province, municipality FROM Auction WHERE id = ?`,
    [auctionId],
  );
}

/**
 * The canonical detail path for this row + a `?follow=…` outcome flag.
 *
 * Goes through `resolveAuctionPath` rather than hardcoding the legacy detail
 * path so the email's one-click follow lands on the SAME url the detail page
 * canonicalises to — a hardcoded legacy path would make every confirmed
 * follow eat an extra 308 hop. ONE auction per request here,
 * so the single-row `fetchV3Url` (a primary-key probe) is the right helper —
 * there is nothing to batch. A failed probe degrades to the legacy path, which
 * still 200s; the redirect must never fail over a url lookup.
 */
async function detailPathWithFlag(row: AuctionSlugRow, flag: string): Promise<string> {
  const v3Url = await fetchV3Url(row.id).catch(() => null);
  return `${resolveAuctionPath(row, v3Url)}?follow=${flag}`;
}

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const token = request.nextUrl.searchParams.get('token');
  const result = verifyFollowToken(token);

  // ── FALLBACK: invalid / expired / wrong-purpose token ────────────────────
  if (!result.ok) {
    // An authentic-but-expired token still lets us deep-link to the specific
    // auction (peekAuctionId only trusts signature-valid payloads), so the user
    // can log in and press "Seguir" there.
    const authenticAuctionId = peekAuctionId(token);
    if (authenticAuctionId) {
      const row = await loadSlugRow(authenticAuctionId).catch(() => undefined);
      if (row) return redirectTo(origin, await detailPathWithFlag(row, 'expired'));
    }
    return redirectTo(origin, `/subastas?follow=expired`);
  }

  const { userId, auctionId } = result;

  // ── Option B: require an authenticated session tied to the token's user ────
  // Read the current session. A failure here is treated as "no session" so the
  // user is sent through login rather than hitting a 500.
  const session = await auth().catch(() => null);
  const decision = decideFollowConfirm({
    sessionUserId: session?.user?.id ?? null,
    tokenUserId: userId,
    // path+query preserves the token so auth returns straight back here.
    confirmPath: `${request.nextUrl.pathname}${request.nextUrl.search}`,
  });

  if (decision.kind === 'need-login') {
    // Not logged in → bounce to login and come straight back to THIS URL (token
    // preserved in the callbackUrl). After auth the confirm route re-runs with a
    // session and the follow completes. Because a login is now mandatory, an
    // email-scanner / link-prefetch (which carries no session cookie) can no
    // longer silently auto-create a follow.
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('callbackUrl', decision.callbackUrl);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  if (decision.kind === 'mismatch') {
    // Logged in as a DIFFERENT account than the token was minted for. Do NOT
    // follow under the wrong account — deny with an explicit mismatch state.
    const row = await loadSlugRow(auctionId).catch(() => undefined);
    if (row) return redirectTo(origin, await detailPathWithFlag(row, 'mismatch'));
    return redirectTo(origin, `/subastas?follow=mismatch`);
  }

  // decision.kind === 'follow' → the authenticated user IS the token's user.
  try {
    const row = await loadSlugRow(auctionId);
    if (!row) {
      // Auction no longer exists — nothing to follow.
      return redirectTo(origin, `/subastas?follow=gone`);
    }

    // Idempotent create against the unique (userId, auctionId). rowCount === 1
    // → a genuinely NEW follow; 0 → already following (treated as success, NOT
    // the 400 the on-page POST returns). Atomic — safe under concurrent hits /
    // email-scanner prefetch (Niki accepted; Undo is on the landing page).
    const ins = await execute(
      `INSERT INTO Favorite (id, userId, auctionId, createdAt)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (userId, auctionId) DO NOTHING`,
      [randomUUID(), userId, auctionId],
    );
    const created = ins.changes === 1;

    if (created) {
      // Bump favoriteCount ONLY on a new follow — mirrors POST /api/favorites,
      // and keeps the count correct on repeat/no-op hits.
      await execute(
        `UPDATE Auction SET favoriteCount = favoriteCount + 1 WHERE id = ?`,
        [auctionId],
      );
    }

    return redirectTo(origin, await detailPathWithFlag(row, created ? 'ok' : 'exists'));
  } catch (error) {
    console.error('[follow/confirm] failed to create favorite:', error);
    // Best-effort fallback to the auction page (login-gated "Seguir" still works).
    try {
      const row = await loadSlugRow(auctionId);
      if (row) return redirectTo(origin, await detailPathWithFlag(row, 'error'));
    } catch {
      /* fall through */
    }
    return redirectTo(origin, `/subastas?follow=error`);
  }
}
