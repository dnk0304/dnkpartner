import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, execute } from '@/lib/db';
import { Resend } from 'resend';
import { createAuctionAlertEmail } from '@/lib/email-templates';
import { mintFollowToken } from '@/lib/follow-token';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { ALERTABLE_DB_STATUSES_SQL, LIVE_NOW_DB_STATUSES_SQL } from '@/lib/auction-status';
import { resolveFreeAndPersist, type ResolverRow } from '@/lib/auction-images/resolver';
import { alertsFromEmail } from '@/lib/email-from';

/**
 * API endpoint to check for new auctions matching user alerts
 * and trigger email/SMS notifications.
 *
 * RBAC (Wave 2b lockdown): requires `Authorization: Bearer <CRON_SECRET>`
 * OR an admin session. Previously this route was OPEN to anyone with the URL —
 * which meant any visitor could spam real outbound emails. Cron + admin only now.
 *
 * Designed to be called:
 *   1. By a cron job every 15 minutes (Bearer CRON_SECRET).
 *   2. Manually by an admin after a backfill (admin session).
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminOrCron(request);
  if (gate instanceof NextResponse) return gate;
  try {
    // Get all active alerts with user info
    const alerts = await query(`
      SELECT a.*, u.id as uId, u.email as uEmail, u.tier as uTier
      FROM Alert a
      LEFT JOIN User u ON a.userId = u.id
    `, []);

    // Get recent auctions (last 24 hours), FLOORED to ALERTABLE statuses.
    //
    // Wave52 BUG-3 fix (Ken-locked 2026-06-04): a user must NEVER be alerted
    // on a CANCELADA / CONCLUIDA_PORTAL / FINISHED / FINALIZADA_AUTORIDAD
    // row. Previously the query had no status filter and the per-alert
    // `alert.statuses` user-narrowing check was the only gate — but an
    // alert with null/empty `statuses` matches every status, so cancelled
    // and concluded auctions slipped into emails.
    //
    // The floor is live + upcoming + suspended. The per-alert `alert.statuses`
    // check below still stacks on top (a user narrowing to just CELEBRANDOSE
    // still works), but it can never RE-INCLUDE a terminal state.
    //
    // ALERTABLE_DB_STATUSES_SQL is a static quoted-comma list — no user input,
    // safe to inline (same pattern used by /api/admin/images/backfill).
    //
    // ── Bug 1 FUTURE-END GATE (Ken-locked 2026-06-19) ──────────────────────
    // "Termina hoy" alert noise: the scraper sometimes first discovers a
    // correct-but-late auction on its CLOSING DAY (createdAt = today, but it
    // opened weeks ago). Such a row matches `createdAt >= now-24h`, is still
    // CELEBRANDOSE/ACTIVE, and fires an alert that truthfully says
    // "Termina: <today>" — accurate but useless (the auction is already
    // closing; the buyer can't act). This was NOT a data bug — endsAt is
    // correct (Ghost verified vs BOE). The fix is a defensive guard here.
    //
    // GATE: for LIVE-NOW rows (ACTIVE / CELEBRANDOSE) that carry a concrete
    // endsAt, REQUIRE the auction to still have a meaningful runway —
    // endsAt > now + 24h. Rows ending today or in the past are dropped.
    //
    // Scope discipline:
    //   - ONLY ACTIVE / CELEBRANDOSE are gated. PROXIMA_APERTURA / PRE_AUCTION
    //     are upcoming (no current end) and SUSPENDIDA / SUSPENDED carry a
    //     resumeAt, not a live end — they must NOT be filtered on endsAt.
    //   - Honest-NULL: a live-now row with endsAt IS NULL is KEPT (we never
    //     fabricate an end date to exclude it). The NOT-wrapper below only
    //     drops rows where endsAt is concrete AND too soon.
    //
    // LIVE_NOW_DB_STATUSES_SQL is a static quoted-comma list (no user input).
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const futureEndCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const recentAuctions = await query<any>(`
      SELECT * FROM Auction
      WHERE createdAt >= ?
        AND status IN (${ALERTABLE_DB_STATUSES_SQL})
        AND NOT (
          status IN (${LIVE_NOW_DB_STATUSES_SQL})
          AND endsAt IS NOT NULL
          AND endsAt <= ?
        )
    `, [cutoffDate, futureEndCutoff]);

    const matchesByAlert: Record<string, { alert: any; auctions: any[] }> = {};

    // Match alerts with auctions
    for (const alert of alerts as any[]) {
      for (const auction of recentAuctions) {
        // Check if auction matches alert criteria
        let matches = true;

        if (alert.province && auction.province !== alert.province) {
          matches = false;
        }

        if (alert.municipality && auction.municipality !== alert.municipality) {
          matches = false;
        }

        if (alert.category && auction.category !== alert.category) {
          matches = false;
        }

        if (alert.source && auction.source !== alert.source) {
          matches = false;
        }

        if (alert.auctionType && auction.auctionType !== alert.auctionType) {
          matches = false;
        }

        if (alert.statuses) {
          const statuses = String(alert.statuses).split(',').map((s: string) => s.trim()).filter(Boolean);
          if (statuses.length > 0 && !statuses.includes(auction.status)) {
            matches = false;
          }
        }

        if (alert.minPrice && auction.appraisalValue < alert.minPrice) {
          matches = false;
        }

        if (alert.maxPrice && auction.appraisalValue > alert.maxPrice) {
          matches = false;
        }

        if (alert.keywords) {
          const keywords = String(alert.keywords)
            .split(',')
            .map((k: string) => k.trim().toLowerCase())
            .filter(Boolean);
          if (keywords.length > 0) {
            const haystack = [
              auction.title,
              auction.generalInfo,
              auction.propertyDescription,
              auction.lotDescription,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!keywords.some((k: string) => haystack.includes(k))) {
              matches = false;
            }
          }
        }

        if (matches) {
          if (!matchesByAlert[alert.id]) {
            matchesByAlert[alert.id] = { alert, auctions: [] };
          }
          matchesByAlert[alert.id].auctions.push(auction);
        }
      }
    }

    // ── FIX A — DEDUP lot-split rows to ONE card per real property ──────────
    // (wave113, 2026-06-21) Auctions are LOT-SPLIT: one property becomes many
    // Auction rows `SUB-…-L1 / -L2 / …`, each a separate `boeId`. The email
    // template renders one card PER ROW, so after the wave112 address-as-
    // headline change a 15-lot property rendered 15 near-identical cards.
    //
    // We collapse per-alert (the same property can legitimately match different
    // alerts) by the LOT-SPLIT base key = boeId with the `-L<n>` suffix stripped.
    // Within a base group we keep ONE representative row: prefer a row that
    // already carries a populated imageUrl (so the card shows a photo), then the
    // lowest lot number (-L1 first), then a stable boeId tie-break. Single-lot
    // rows (no `-L` suffix) are their own base — unaffected.
    for (const entry of Object.values(matchesByAlert)) {
      entry.auctions = dedupeByBaseProperty(entry.auctions);
    }

    // ── FIX B (exclude) — drop anything already emailed ────────────────────
    // (wave113) The rolling-24h SELECT re-finds the same rows every run; with
    // no record of past sends, Dennis got the same properties three days in a
    // row. We now record one Notification row per emailed (alert, auction) and
    // exclude any candidate that already has one for channel='email'. ONE
    // set-membership query keyed to the surviving (alertId, auctionId) pairs —
    // not N queries.
    await excludeAlreadyNotified(matchesByAlert);

    // Send notifications via email
    const sentNotifications = await sendNotifications(matchesByAlert);

    return NextResponse.json({
      success: true,
      data: {
        alertsChecked: alerts.length,
        auctionsScanned: recentAuctions.length,
        matchesFound: Object.values(matchesByAlert).reduce((sum, entry) => sum + entry.auctions.length, 0),
        notificationsSent: sentNotifications
      }
    });
  } catch (error) {
    console.error('Error checking alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check alerts' },
      { status: 500 }
    );
  }
}

/**
 * FIX A helper (wave113): collapse lot-split rows to ONE representative row per
 * real property. Base key = `boeId` with a trailing `-L<digits>` lot suffix
 * stripped (case-insensitive). Representative pick within a base group:
 *   1. prefer a row whose `imageUrl` is populated (card shows a photo),
 *   2. then the lowest numeric `lotNumber` (so `-L1` wins over `-L7`),
 *   3. then the lexically-smallest `boeId` as a stable tie-break.
 * Rows with no `boeId` are passed through untouched (keyed by their own id) so
 * a missing key can never silently drop a match.
 */
function dedupeByBaseProperty(auctions: any[]): any[] {
  const baseKeyOf = (a: any): string => {
    const boeId = typeof a?.boeId === 'string' ? a.boeId : null;
    if (!boeId) return `__no-boeId__:${a?.id ?? Math.random()}`;
    return boeId.replace(/-L\d+$/i, '');
  };
  const hasImage = (a: any): boolean =>
    typeof a?.imageUrl === 'string' && a.imageUrl.trim().length > 0;
  const lotNum = (a: any): number => {
    const n = Number.parseInt(String(a?.lotNumber ?? ''), 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  // Lower "rank" wins. (image first, then lowest lot, then smallest boeId.)
  const better = (candidate: any, current: any): boolean => {
    const ci = hasImage(candidate), ui = hasImage(current);
    if (ci !== ui) return ci; // a row with an image beats one without
    const cl = lotNum(candidate), ul = lotNum(current);
    if (cl !== ul) return cl < ul;
    return String(candidate?.boeId ?? '') < String(current?.boeId ?? '');
  };

  const best = new Map<string, any>();
  for (const auction of auctions) {
    const key = baseKeyOf(auction);
    const current = best.get(key);
    if (!current || better(auction, current)) best.set(key, auction);
  }
  return Array.from(best.values());
}

/**
 * FIX B (exclude) helper (wave113): in a SINGLE query, find every
 * (alertId, auctionId) pair that already has a channel='email' Notification row
 * among the current candidates, then strip those auctions from each alert's
 * list. Tracked by `auction.id` (the PK used in the email URL and stored in
 * `Notification.auctionId`). Mutates `matchesByAlert` in place. Fail-CLOSED is
 * NOT desired here — if the lookup throws we let the send proceed rather than
 * suppress a legitimate alert; the ON CONFLICT on insert still prevents a
 * duplicate Notification row, and a worst case is one repeated email, never a
 * dropped one.
 */
async function excludeAlreadyNotified(
  matchesByAlert: Record<string, { alert: any; auctions: any[] }>,
): Promise<void> {
  // Collect candidate (alertId, auctionId) pairs.
  const pairs: Array<{ alertId: string; auctionId: string }> = [];
  for (const entry of Object.values(matchesByAlert)) {
    const alertId = entry.alert?.id;
    if (!alertId) continue;
    for (const auction of entry.auctions) {
      if (auction?.id) pairs.push({ alertId, auctionId: auction.id });
    }
  }
  if (pairs.length === 0) return;

  // One set-membership query. We over-fetch by the candidate auctionIds (a
  // small, bounded set per run) and filter the (alertId,auctionId) tuple in
  // memory — avoids building a huge VALUES list while staying a single query.
  const auctionIds = Array.from(new Set(pairs.map((p) => p.auctionId)));
  const placeholders = auctionIds.map(() => '?').join(', ');
  let sentRows: Array<{ alertId: string | null; auctionId: string }> = [];
  try {
    sentRows = await query<{ alertId: string | null; auctionId: string }>(
      `SELECT alertId, auctionId
         FROM Notification
        WHERE channel = 'email'
          AND auctionId IN (${placeholders})`,
      auctionIds,
    );
  } catch (error) {
    console.error('[alerts/check] already-notified lookup failed, proceeding without exclusion:', error);
    return;
  }

  const sentSet = new Set(sentRows.map((r) => `${r.alertId} ${r.auctionId}`));
  for (const entry of Object.values(matchesByAlert)) {
    const alertId = entry.alert?.id;
    if (!alertId) continue;
    entry.auctions = entry.auctions.filter(
      (a) => !sentSet.has(`${alertId} ${a.id}`),
    );
  }
}

/**
 * FIX B (record) helper (wave113): after a SUCCESSFUL email send, write one
 * Notification row per auction actually emailed so the next run excludes it.
 * - channel = 'email', type = 'NEW_MATCH'. (The NotificationType enum has no
 *   'alert' value — NEW_MATCH is the semantically-correct "a new auction matched
 *   your alert"; the brief's `type='alert'` does not exist in the schema.)
 * - id is app-generated (the column has no DB cuid default) — matches the
 *   existing raw-insert pattern in notification-service.ts (randomUUID()).
 * - ON CONFLICT on the new UNIQUE (alertId, auctionId, channel) DO NOTHING so a
 *   race (two overlapping runs) can never double-insert.
 * - Called ONLY on send success — a failed send writes nothing, so it retries
 *   next run. Never throws (a logging failure must not break delivery).
 */
async function recordNotifications(
  alertId: string,
  userId: string,
  auctions: any[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const auction of auctions) {
    if (!auction?.id || !userId) continue;
    try {
      await execute(
        `INSERT INTO Notification
           (id, userId, alertId, auctionId, channel, type, read, sentAt, deliveredAt)
         VALUES (?, ?, ?, ?, 'email'::"NotificationChannel", 'NEW_MATCH'::"NotificationType", false, ?, ?)
         ON CONFLICT ("alertId", "auctionId", "channel") DO NOTHING`,
        [randomUUID(), userId, alertId, auction.id, now, now],
      );
    } catch (error) {
      console.error(`[alerts/check] failed to record Notification for auction ${auction.id}:`, error);
    }
  }
}

async function sendNotifications(matchesByAlert: Record<string, { alert: any; auctions: any[] }>): Promise<number> {
  let sent = 0;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('RESEND_API_KEY missing. Skipping email delivery.');
    return 0;
  }

  const resend = new Resend(resendKey);
  const from = alertsFromEmail();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3005';

  // One-click "Seguir esta subasta" (2026-07-25): mint a signed, expiring HMAC
  // token per (recipient, auction) and hand the email template a self-contained
  // /api/follow/confirm link. The recipient is ALWAYS a registered user
  // (Alert.userId → User, exposed here as alert.uId). Returns undefined when no
  // signing secret is configured → the template simply omits the button.
  const buildFollowUrl = (userId: string | null | undefined, auctionId: string): string | undefined => {
    if (!userId) return undefined;
    const token = mintFollowToken(userId, auctionId);
    return token ? `${appUrl}/api/follow/confirm?token=${encodeURIComponent(token)}` : undefined;
  };

  // Bug 1 (2026-06-09): resolve the best FREE image for every matched auction
  // BEFORE building the email payloads. The raw DB `imageUrl` is often null
  // (the resolver runs out-of-band), so the email previously fell straight to
  // the branded placeholder — no property photo. We route each row through the
  // FREE-only resolver (cached-on-disk → Catastro-by-cadastralRef), which is
  // coord-independent and never touches a paid Google API. On success the
  // resolved `/api/auction-image/<boeId>` URL is persisted and mutated onto
  // the row in-memory so the email template's rung-1 (real photo) fires.
  //
  // PAID-API GAP (flagged for Dennis): rows with NO cadastralRef and no cached
  // file still fall through to the branded placeholder in the email. The only
  // way to give those a real thumbnail is Street View Static (paid) or Static
  // Maps (paid) — DELIBERATELY NOT enabled here per the "no paid API for
  // finalized/alert auctions" rule. resolveFreeAndPersist cannot reach either.
  await resolveFreeImagesForMatches(matchesByAlert);

  for (const entry of Object.values(matchesByAlert)) {
    const alert = entry.alert;
    const auctions = entry.auctions;

    // emailEnabled may be a number (legacy SQLite) or boolean (PG). Treat 0 / false as disabled.
    if (!alert.uEmail || alert.emailEnabled === 0 || alert.emailEnabled === false) {
      continue;
    }

    // FIX (wave120, 2026-07-01): gate the send on the FINAL post-dedup /
    // post-exclusion array. wave113 excludeAlreadyNotified() empties an
    // alert's `auctions` in place when every match was already emailed on a
    // prior run, but the entry itself survives — so without this guard the
    // "Encontramos nuevas subastas…" header + send still fired with an empty
    // body. Skipping empty entries makes the subject/header/count derive from
    // the same non-empty array. App-only; no regression to wave109 future-end
    // gate, wave113 dedup/no-repeat, or wave50 card-strip.
    if (auctions.length === 0) continue;

    const sendGrouped = alert.notificationType !== 'individual';

    if (sendGrouped) {
      const auctionPayload = auctions.map((auction: any) => ({
        title: auction.title,
        url: `${appUrl}/auction/${auction.id}`,
        address: auction.address,
        province: auction.province,
        municipality: auction.municipality,
        appraisalValue: auction.appraisalValue,
        // Three-values projection (2026-06-04, Ghost split commit `443a864`):
        // ALL THREE of Tasación / Valor subasta / Cantidad reclamada flow to
        // the email so the template can render them as three distinct lines.
        // Honest-NULL — template omits absent values (never renders 0).
        valorSubasta: auction.valorSubasta,
        claimedAmount: auction.claimedAmount,
        // Enrichment (wave50c): the email template renders status-branched
        // date, image, category chip, status badge, and a richer location.
        // Wave52: + resumeAt (drives the SUSPENDIDA "Fecha prevista de
        // reanudación" line — populated by the suspended-auction scraper).
        // All optional/nullable — template degrades gracefully when absent.
        endsAt: auction.endsAt,
        endDateTime: auction.endDateTime,
        opensAt: auction.opensAt,
        resumeAt: auction.resumeAt,
        status: auction.status,
        category: auction.category,
        imageUrl: auction.imageUrl,
        latitude: auction.latitude,
        longitude: auction.longitude,
        followUrl: buildFollowUrl(alert.uId, auction.id),
      }));

      const { subject, html, text } = createAuctionAlertEmail({
        alertName: alert.name || undefined,
        auctions: auctionPayload,
        manageUrl: `${appUrl}/alerts`,
      });

      try {
        await resend.emails.send({
          from,
          to: [alert.uEmail],
          subject,
          html,
          text,
        });
        sent += auctions.length;
        // FIX B (record): one Notification row per auction in the group, only
        // after a successful send, so the next run excludes them.
        await recordNotifications(alert.id, alert.uId, auctions);
      } catch (error) {
        console.error(`Failed to send notification to ${alert.uEmail}:`, error);
      }
    } else {
      for (const auction of auctions) {
        const auctionPayload = [{
          title: auction.title,
          url: `${appUrl}/auction/${auction.id}`,
          address: auction.address,
          province: auction.province,
          municipality: auction.municipality,
          appraisalValue: auction.appraisalValue,
          // Three-values projection (2026-06-04, Ghost split) — Tasación +
          // Valor subasta + Cantidad reclamada flow distinctly. Honest-NULL.
          valorSubasta: auction.valorSubasta,
          claimedAmount: auction.claimedAmount,
          // Enrichment (wave50c + wave52 resumeAt) — mirrors the grouped branch above.
          endsAt: auction.endsAt,
          endDateTime: auction.endDateTime,
          opensAt: auction.opensAt,
          resumeAt: auction.resumeAt,
          status: auction.status,
          category: auction.category,
          imageUrl: auction.imageUrl,
          latitude: auction.latitude,
          longitude: auction.longitude,
          followUrl: buildFollowUrl(alert.uId, auction.id),
        }];

        const { subject, html, text } = createAuctionAlertEmail({
          alertName: alert.name || undefined,
          auctions: auctionPayload,
          manageUrl: `${appUrl}/alerts`,
        });

        try {
          await resend.emails.send({
            from,
            to: [alert.uEmail],
            subject,
            html,
            text,
          });
          sent += 1;
          // FIX B (record): record the single emailed auction on success.
          await recordNotifications(alert.id, alert.uId, [auction]);
        } catch (error) {
          console.error(`Failed to send notification to ${alert.uEmail}:`, error);
        }
      }
    }
  }

  return sent;
}

/**
 * Bug 1 (2026-06-09): in-place FREE image resolution for matched auctions.
 *
 * Walks every matched auction (deduped by boeId — the same row can match many
 * alerts), resolves the best FREE image via `resolveFreeAndPersist`
 * (cached-on-disk → Catastro-by-cadastralRef; never a paid Google API), and
 * mutates the resolved `/api/auction-image/<boeId>` URL onto the row so the
 * downstream email payload (`imageUrl: auction.imageUrl`) surfaces a real
 * photo via the template's rung-1 path.
 *
 * Fully fail-safe: a missing boeId, a resolver miss, or any thrown error
 * leaves the row's `imageUrl` untouched (the email then degrades to the
 * existing map/placeholder ladder). NEVER throws — alert delivery must not be
 * blocked by image resolution.
 */
async function resolveFreeImagesForMatches(
  matchesByAlert: Record<string, { alert: any; auctions: any[] }>,
): Promise<void> {
  // boeId → resolved public path (or null when no free image exists). Caches
  // the resolution so an auction matching N alerts is resolved exactly once.
  const resolved = new Map<string, string | null>();

  for (const entry of Object.values(matchesByAlert)) {
    for (const auction of entry.auctions) {
      const boeId = auction.boeId;
      if (!boeId) continue;

      // If the row already carries a resolver-served real photo, keep it.
      if (typeof auction.imageUrl === 'string' && auction.imageUrl.startsWith('/api/auction-image/')) {
        continue;
      }

      if (!resolved.has(boeId)) {
        let publicPath: string | null = null;
        try {
          const row: ResolverRow = {
            boeId,
            status: auction.status,
            cadastralRef: auction.cadastralRef ?? null,
            cadastralData: auction.cadastralData ?? null,
            lotDescription: auction.lotDescription ?? null,
            propertyDescription: auction.propertyDescription ?? null,
            boeAnnouncement: auction.boeAnnouncement ?? null,
            address: auction.address ?? null,
            latitude: auction.latitude ?? null,
            longitude: auction.longitude ?? null,
            imageUrl: auction.imageUrl ?? null,
          };
          const outcome = await resolveFreeAndPersist(row);
          publicPath = outcome.publicPath;
        } catch (error) {
          console.error(`Free image resolve failed for ${boeId}:`, error);
          publicPath = null;
        }
        resolved.set(boeId, publicPath);
      }

      const path = resolved.get(boeId);
      if (path) auction.imageUrl = path;
    }
  }
}
