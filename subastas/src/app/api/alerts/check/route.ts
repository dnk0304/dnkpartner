import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Resend } from 'resend';
import { createAuctionAlertEmail } from '@/lib/email-templates';
import { requireAdminOrCron } from '@/lib/auth-helpers';
import { ALERTABLE_DB_STATUSES_SQL } from '@/lib/auction-status';
import { resolveFreeAndPersist, type ResolverRow } from '@/lib/auction-images/resolver';

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
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentAuctions = await query<any>(`
      SELECT * FROM Auction
      WHERE createdAt >= ?
        AND status IN (${ALERTABLE_DB_STATUSES_SQL})
    `, [cutoffDate]);

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

async function sendNotifications(matchesByAlert: Record<string, { alert: any; auctions: any[] }>): Promise<number> {
  let sent = 0;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('RESEND_API_KEY missing. Skipping email delivery.');
    return 0;
  }

  const resend = new Resend(resendKey);
  const from = process.env.RESEND_FROM_EMAIL || 'SubastasActivas <alertas@subastasactivas.com>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3005';

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

    const sendGrouped = alert.notificationType !== 'individual';

    if (sendGrouped) {
      const auctionPayload = auctions.map((auction: any) => ({
        title: auction.title,
        url: `${appUrl}/auction/${auction.id}`,
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
      } catch (error) {
        console.error(`Failed to send notification to ${alert.uEmail}:`, error);
      }
    } else {
      for (const auction of auctions) {
        const auctionPayload = [{
          title: auction.title,
          url: `${appUrl}/auction/${auction.id}`,
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
