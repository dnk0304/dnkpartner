import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Resend } from 'resend';
import { createAuctionAlertEmail } from '@/lib/email-templates';
import { requireAdminOrCron } from '@/lib/auth-helpers';

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

    // Get recent auctions (last 24 hours)
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentAuctions = await query<any>(`
      SELECT * FROM Auction WHERE createdAt >= ?
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
        // Enrichment (wave50c): the email template now renders end-date,
        // image, category chip, status badge, and a richer location line.
        // All optional/nullable — template degrades gracefully when absent.
        endsAt: auction.endsAt,
        endDateTime: auction.endDateTime,
        opensAt: auction.opensAt,
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
          // Enrichment (wave50c) — mirrors the grouped branch above.
          endsAt: auction.endsAt,
          endDateTime: auction.endDateTime,
          opensAt: auction.opensAt,
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
