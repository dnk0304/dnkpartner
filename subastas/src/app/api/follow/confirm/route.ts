/**
 * GET /api/follow/confirm?token=…  — one-click "Follow this auction" from the
 * saved-search Alert email ("Seguir esta subasta" button).
 *
 * Flow (Ken brief 2026-07-25, Niki "pure one-click" decision):
 *   1. Verify the stateless HMAC token (src/lib/follow-token.ts): signature,
 *      purpose ("follow"), and expiry (30 days).
 *   2. Valid → idempotently create the Favorite (the follow record) for the
 *      token's (userId, auctionId), then redirect to the auction detail page
 *      with ?follow=ok (new) / ?follow=exists (already following).
 *   3. Invalid / expired → FALLBACK: redirect to the auction page (login-gated
 *      on-page "Seguir" still works) with ?follow=expired. When the token isn't
 *      even signature-valid, redirect to the auctions listing with the flag.
 *
 * No DB table / migration — the token carries everything. The Favorite gets its
 * per-event notify prefs from the table's column DEFAULTs (all notifyOn* = true,
 * channels = 'email,inapp'), exactly like the on-page "Seguir" (POST /api/favorites).
 *
 * Security: the userId is INSIDE the signed payload, so a token can only ever
 * follow that one auction for that one user (see follow-token.ts for the full
 * property list). This endpoint therefore needs NO session — the token IS the
 * (narrowly-scoped, expiring, unforgeable) authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { queryOne, execute } from '@/lib/db';
import { verifyFollowToken, peekAuctionId } from '@/lib/follow-token';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';

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
      if (row) return redirectTo(origin, `/subastas/subasta/${buildAuctionSlug(row)}?follow=expired`);
    }
    return redirectTo(origin, `/subastas?follow=expired`);
  }

  const { userId, auctionId } = result;

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

    return redirectTo(
      origin,
      `/subastas/subasta/${buildAuctionSlug(row)}?follow=${created ? 'ok' : 'exists'}`,
    );
  } catch (error) {
    console.error('[follow/confirm] failed to create favorite:', error);
    // Best-effort fallback to the auction page (login-gated "Seguir" still works).
    try {
      const row = await loadSlugRow(auctionId);
      if (row) return redirectTo(origin, `/subastas/subasta/${buildAuctionSlug(row)}?follow=error`);
    } catch {
      /* fall through */
    }
    return redirectTo(origin, `/subastas?follow=error`);
  }
}
