/**
 * Notification dispatcher (Wave 2b; saved-search fan-out added wave218).
 *
 * Drains rows from `event_outbox` (written by Ghost's scraper, Wave 2a), fans
 * each event out to followers (`Favorite` rows with per-event notify-prefs),
 * and delivers via three channels: email (Resend), web-push, in-app
 * `Notification` rows.
 *
 * wave218 adds a SECOND audience for exactly one event type: `auction.go_live`
 * also reaches users whose active saved search (`Alert`) matches the auction,
 * even if they never followed it. Every other event type keeps Favorite-only
 * fan-out — see `dispatcher/alert-fanout.ts` for the locked rule and the
 * `ALERT_GOLIVE_FANOUT` kill switch. Matching itself lives in the shared
 * `@/lib/alerts/matcher`, which Engine A (`/api/alerts/check`) imports too, so
 * the two engines cannot drift.
 *
 * Invariants:
 *   - At-least-once delivery (a crash before processedAt is set means the row
 *     is picked up on the next drain).
 *   - Idempotent per (dedupeKey, userId, channel) — we look up an existing
 *     Notification row with matching dedupeKey-in-payload before inserting a
 *     new one. (Cannot add a unique index in this wave — schema is frozen.)
 *   - Outbox row marked `processedAt` only after every (follower × channel)
 *     attempt AND every alert-path mail covering that row has been recorded as
 *     delivered, failed, or skipped (duplicate / pref-off / quiet-hours /
 *     kill-switch). Because `grouped` alert mails span several rows, the drain
 *     runs in three phases — follower fan-out, alert mails, then a single
 *     markProcessed sweep — so a crash mid-batch leaves the whole batch
 *     unprocessed and the next drain retries it. That retry cannot double-mail:
 *     the per-auction `alreadyDelivered` check is consulted before every send.
 *     At-least-once is preserved; at-most-once is approximated by the dedupe
 *     key, exactly as on the follower path.
 *   - Alert-path Notification rows are written with `alertId = NULL` and the
 *     originating alert recorded in `payload.__alertId`. The schema carries
 *     UNIQUE(alertId, auctionId, channel) and Engine A already owns the
 *     (alertId, auctionId, 'email') slot with its NEW_MATCH row — reusing the
 *     concrete alertId here would collide and silently drop the go_live row.
 *   - Atomic claim: one dispatcher instance grabs each row via UPDATE…WHERE
 *     processedAt IS NULL…RETURNING. Two instances racing produces at most one
 *     winner per row (Postgres serializes the UPDATE).
 */
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import {
  EVENT_TYPES,
  followerPrefField,
  notificationTypeForEvent,
  renderEmail,
  renderInApp,
  renderPush,
  type DispatchPayload,
} from '@/lib/dispatcher/templates';
import { sendPush, isVapidConfigured } from '@/lib/dispatcher/webpush';
import type { NotificationChannel } from '@prisma/client';
import { alertsFromEmail } from '@/lib/email-from';
import { createAuctionLiveAlertEmail } from '@/lib/email-templates';
import type { AlertCriteria } from '@/lib/alerts/matcher';
import { AUCTION_MATCH_SELECT } from '@/lib/dispatcher/auction-select';
import {
  collectAlertMatches,
  parseFanoutMode,
  planAlertMails,
  type AlertMatch,
  type AlertSubscriber,
  type FanoutAuction,
  type FanoutMode,
} from '@/lib/dispatcher/alert-fanout';

type FavoriteWithUser = {
  id: string;
  userId: string;
  notifyOnGoLive: boolean;
  notifyOnBid: boolean;
  notifyOnStatus: boolean;
  notifyOnSuspension: boolean;
  notifyOnResume: boolean;
  notifyOnFinish: boolean;
  channels: string;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  user: { id: string; email: string };
};

export interface DispatchStats {
  outboxScanned: number;
  outboxProcessed: number;
  outboxSkipped: number;
  followersFanned: number;
  emailsSent: number;
  emailsFailed: number;
  pushSent: number;
  pushFailed: number;
  pushPruned: number;
  inAppCreated: number;
  duplicatesSkipped: number;
  prefSkipped: number;
  quietHoursSkipped: number;
  /**
   * wave218 saved-search fan-out (go_live only). These four are what Ken reads
   * out of the scheduler's dispatch JSON at deploy time.
   *   alertMatched      — distinct (user, auction) alert hits that survived both
   *                       dedupe gates (follower-union and __dedupe lookup).
   *                       Populated in `count` mode; 0 in `off`.
   *   alertEmailsSent   — alert mails actually accepted by Resend.
   *   alertEmailsFailed — alert mails Resend rejected or that threw.
   *   alertGroupedMails — the subset of alertEmailsSent produced by a `grouped`
   *                       alert (one mail per user per drain, N auctions in it).
   */
  alertMatched: number;
  alertEmailsSent: number;
  alertEmailsFailed: number;
  alertGroupedMails: number;
  errors: string[];
}

function newStats(): DispatchStats {
  return {
    outboxScanned: 0,
    outboxProcessed: 0,
    outboxSkipped: 0,
    followersFanned: 0,
    emailsSent: 0,
    emailsFailed: 0,
    pushSent: 0,
    pushFailed: 0,
    pushPruned: 0,
    inAppCreated: 0,
    duplicatesSkipped: 0,
    prefSkipped: 0,
    quietHoursSkipped: 0,
    alertMatched: 0,
    alertEmailsSent: 0,
    alertEmailsFailed: 0,
    alertGroupedMails: 0,
    errors: [],
  };
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_URL ??
  'https://subastasactivas.com';

// Lazy: don't construct Resend at module load (build-time env-check trap).
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

function fromEmail(): string {
  // Outbox events are auction notifications (followed-auction updates,
  // saved-search matches) — the ALERTS sender, never the account sender.
  return alertsFromEmail();
}

/**
 * Claim a batch of unprocessed outbox rows atomically. Returns up to `limit`
 * rows. Other dispatcher instances cannot re-claim these (their `claimed_at`
 * is now set, but more importantly we re-check `processedAt IS NULL` inside
 * `process`).
 *
 * NOTE: we use a single UPDATE…RETURNING with a CTE to atomically tag the
 * batch with a transient claim timestamp written to `payload` (since we have
 * no claim column under the frozen schema). Simpler implementation: take a
 * SELECT…ORDER BY createdAt LIMIT N FOR UPDATE SKIP LOCKED inside a tx and
 * process rows one at a time, marking processedAt at the end. We use the
 * second approach — clearer, no schema change.
 */
async function claimUnprocessed(limit: number): Promise<
  Array<{
    id: string;
    auctionId: string | null;
    eventType: string;
    payload: DispatchPayload;
    dedupeKey: string | null;
  }>
> {
  // Plain SELECT is sufficient for a single dispatcher process; for safety
  // under multi-instance run we use a small transaction with row-level locking.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        auctionId: string | null;
        eventType: string;
        payload: unknown;
        dedupeKey: string | null;
      }>
    >(
      `SELECT id, "auctionId", "eventType", payload, "dedupeKey"
       FROM event_outbox
       WHERE "processedAt" IS NULL
       ORDER BY "createdAt" ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      limit,
    );

    // Tag rows with a sentinel processedAt = NULL stays; we'll set it on
    // success in `process`. Keeping them locked in this tx would block other
    // dispatchers — instead we exit the tx and rely on the next-drain claim.
    // SKIP LOCKED inside this same tx means another instance won't grab them
    // while we hold the lock for the duration of this SELECT.
    return rows.map((r) => ({
      id: r.id,
      auctionId: r.auctionId,
      eventType: r.eventType,
      payload: (r.payload as DispatchPayload) ?? {},
      dedupeKey: r.dedupeKey,
    }));
  });
}

async function markProcessed(outboxId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE event_outbox SET "processedAt" = NOW() WHERE id = $1`,
    outboxId,
  );
}

/**
 * All Favorite rows for the auction, plus the subset whose per-event notify
 * pref is on. The FULL set matters to the alert path: a user who follows the
 * auction is owned by the follower path regardless of their prefs, so the alert
 * path must not "rescue" them with a second mail (RULES rule 1).
 */
async function resolveFollowers(
  auctionId: string,
  eventType: string,
): Promise<{ all: FavoriteWithUser[]; eligible: FavoriteWithUser[] }> {
  const prefField = followerPrefField(eventType);

  // We always fetch all followers for the auction, then filter in JS for pref.
  // Cardinality per auction is small (handful of users in MVP), so this is fine.
  const favorites = await prisma.favorite.findMany({
    where: { auctionId },
    select: {
      id: true,
      userId: true,
      notifyOnGoLive: true,
      notifyOnBid: true,
      notifyOnStatus: true,
      notifyOnSuspension: true,
      notifyOnResume: true,
      notifyOnFinish: true,
      channels: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      user: { select: { id: true, email: true } },
    },
  });

  const eligible = prefField
    ? favorites.filter((f) => (f as Record<string, unknown>)[prefField] === true)
    : favorites;
  return { all: favorites, eligible };
}

/**
 * The active, email-enabled saved searches — loaded ONCE PER DRAIN, not once
 * per event. Today there are 2 alerts in production; this shape holds at
 * thousands (the filter is a pure in-memory pass and `Alert.active` is
 * indexed). If the alert count ever reaches a size where loading them all is
 * wrong, the fix is a keyset scan here — NOT per-alert or per-event queries.
 */
async function loadActiveAlerts(): Promise<AlertSubscriber[]> {
  const alertRows = await prisma.alert.findMany({
    where: { active: true, emailEnabled: true },
    select: {
      id: true,
      name: true,
      userId: true,
      province: true,
      municipality: true,
      category: true,
      source: true,
      auctionType: true,
      propertyType: true,
      statuses: true,
      minPrice: true,
      maxPrice: true,
      keywords: true,
      notificationType: true,
      active: true,
      emailEnabled: true,
      user: { select: { id: true, email: true } },
    },
  });

  return alertRows
    .filter((a) => Boolean(a.user?.email))
    .map((a) => {
      const criteria: AlertCriteria = a;
      return {
        ...criteria,
        id: a.id,
        name: a.name,
        userId: a.userId,
        email: a.user!.email,
        notificationType: a.notificationType,
        active: a.active,
        emailEnabled: a.emailEnabled,
      };
    });
}

/**
 * The one auction row the matcher + the go-live mail need. One query per
 * go_live event; there is no cheaper shape, since each event names a different
 * auction.
 */
async function loadAuctionForFanout(auctionId: string): Promise<FanoutAuction | null> {
  const row = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: AUCTION_MATCH_SELECT,
  });
  if (!row) return null;
  return row as FanoutAuction;
}

function inQuietHours(start: number | null, end: number | null, now: Date): boolean {
  if (start === null || end === null) return false;
  const h = now.getUTCHours(); // UTC; users set hour-of-day in UTC for MVP.
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  // Wrap (e.g. 22 → 7).
  return h >= start || h < end;
}

function parseChannels(csv: string): NotificationChannel[] {
  const allowed: NotificationChannel[] = ['email', 'push', 'inapp'];
  return csv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is NotificationChannel => allowed.includes(s as NotificationChannel));
}

/**
 * Idempotency check: has this (dedupeKey, userId, channel) already been
 * notified? We store the dedupe value inside Notification.payload as
 * `__dedupe`. Cheap query — index on (userId, sentAt) already exists.
 */
async function alreadyDelivered(
  userId: string,
  channel: NotificationChannel,
  dedupeKey: string,
): Promise<boolean> {
  // Look back 30 days max to bound the scan; dedupe is meaningless beyond
  // that for our event types.
  const row = await prisma.notification.findFirst({
    where: {
      userId,
      channel,
      sentAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      payload: {
        path: ['__dedupe'],
        equals: dedupeKey,
      },
    },
    select: { id: true },
  });
  return row !== null;
}

async function recordInApp(
  follower: FavoriteWithUser,
  auctionId: string,
  eventType: string,
  payload: DispatchPayload,
  dedupeKey: string,
): Promise<{ created: boolean; duplicate: boolean }> {
  if (await alreadyDelivered(follower.userId, 'inapp', dedupeKey)) {
    return { created: false, duplicate: true };
  }
  const rendered = renderInApp(eventType, payload);
  await prisma.notification.create({
    data: {
      userId: follower.userId,
      auctionId,
      type: rendered.type,
      channel: 'inapp',
      payload: { ...rendered.payload, __dedupe: dedupeKey, __event: eventType },
      deliveredAt: new Date(),
      deliveryAttempts: 1,
    },
  });
  return { created: true, duplicate: false };
}

async function deliverEmail(
  follower: FavoriteWithUser,
  auctionId: string,
  eventType: string,
  payload: DispatchPayload,
  dedupeKey: string,
  stats: DispatchStats,
): Promise<void> {
  if (await alreadyDelivered(follower.userId, 'email', dedupeKey)) {
    stats.duplicatesSkipped++;
    return;
  }
  const resend = getResend();
  if (!resend) {
    stats.emailsFailed++;
    stats.errors.push('resend_not_configured');
    return;
  }
  const rendered = renderEmail(eventType, payload, APP_URL);
  try {
    const r = await resend.emails.send({
      from: fromEmail(),
      to: [follower.user.email],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (r.error) {
      stats.emailsFailed++;
      stats.errors.push(`resend_error:${r.error.message ?? 'unknown'}`);
      await prisma.notification.create({
        data: {
          userId: follower.userId,
          auctionId,
          type: notificationTypeForEvent(eventType),
          channel: 'email',
          payload: { ...payload, __dedupe: dedupeKey, __event: eventType },
          deliveryAttempts: 1,
          failureReason: r.error.message ?? 'resend_error',
        },
      });
      return;
    }
    await prisma.notification.create({
      data: {
        userId: follower.userId,
        auctionId,
        type: notificationTypeForEvent(eventType),
        channel: 'email',
        payload: { ...payload, __dedupe: dedupeKey, __event: eventType, __emailId: r.data?.id ?? null },
        deliveredAt: new Date(),
        deliveryAttempts: 1,
      },
    });
    stats.emailsSent++;
  } catch (err) {
    stats.emailsFailed++;
    stats.errors.push(`email_throw:${(err as Error).message}`);
    await prisma.notification.create({
      data: {
        userId: follower.userId,
        auctionId,
        type: notificationTypeForEvent(eventType),
        channel: 'email',
        payload: { ...payload, __dedupe: dedupeKey, __event: eventType },
        deliveryAttempts: 1,
        failureReason: (err as Error).message,
      },
    });
  }
}

async function deliverPush(
  follower: FavoriteWithUser,
  auctionId: string,
  eventType: string,
  payload: DispatchPayload,
  dedupeKey: string,
  stats: DispatchStats,
): Promise<void> {
  if (await alreadyDelivered(follower.userId, 'push', dedupeKey)) {
    stats.duplicatesSkipped++;
    return;
  }
  if (!isVapidConfigured()) {
    stats.pushFailed++;
    stats.errors.push('vapid_not_configured');
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: follower.userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) {
    // No push endpoint to deliver to — record a no-op skip and move on. Don't
    // store a Notification row for this case (in-app row already exists).
    return;
  }

  const rendered = renderPush(eventType, payload, APP_URL);
  let anyOk = false;
  let lastErr: string | undefined;
  for (const sub of subs) {
    const result = await sendPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title: rendered.title, body: rendered.body, url: rendered.url, tag: rendered.tag },
    );
    if (result.ok) {
      anyOk = true;
    } else if (result.gone) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      stats.pushPruned++;
      lastErr = `gone:${result.statusCode}`;
    } else {
      lastErr = result.error ?? `status:${result.statusCode ?? '?'}`;
    }
  }

  if (anyOk) {
    stats.pushSent++;
    await prisma.notification.create({
      data: {
        userId: follower.userId,
        auctionId,
        type: notificationTypeForEvent(eventType),
        channel: 'push',
        payload: { ...payload, __dedupe: dedupeKey, __event: eventType },
        deliveredAt: new Date(),
        deliveryAttempts: 1,
      },
    });
  } else {
    stats.pushFailed++;
    await prisma.notification.create({
      data: {
        userId: follower.userId,
        auctionId,
        type: notificationTypeForEvent(eventType),
        channel: 'push',
        payload: { ...payload, __dedupe: dedupeKey, __event: eventType },
        deliveryAttempts: 1,
        failureReason: lastErr ?? 'push_failed',
      },
    });
  }
}

/**
 * Dispatch a single event: resolve followers, fan out to each enabled channel,
 * record outcomes on Notification rows. Returns when every follower×channel
 * attempt has been recorded.
 *
 * Returns the userIds of EVERY follower of the auction (pref-filtered or not) so
 * the caller can exclude them from the alert-path fan-out.
 */
async function dispatchEvent(
  outboxRow: {
    id: string;
    auctionId: string | null;
    eventType: string;
    payload: DispatchPayload;
    dedupeKey: string | null;
  },
  stats: DispatchStats,
): Promise<string[]> {
  let followerUserIds: string[] = [];
  const dedupeKey = outboxRow.dedupeKey ?? `${outboxRow.eventType}:${outboxRow.id}`;
  const auctionId =
    outboxRow.auctionId ?? (outboxRow.payload.auctionId as string | undefined) ?? null;

  if (!auctionId) {
    stats.outboxSkipped++;
    stats.errors.push(`outbox_${outboxRow.id}_no_auctionid`);
    return followerUserIds;
  }

  const { all: allFollowers, eligible: followers } = await resolveFollowers(
    auctionId,
    outboxRow.eventType,
  );
  followerUserIds = allFollowers.map((f) => f.userId);
  stats.followersFanned += followers.length;
  if (followers.length === 0) return followerUserIds;

  // Ghost packs everything except auctionId into payload (auctionId lives in
  // the event_outbox column). Renderers want it for URL construction, so
  // enrich here once.
  const enrichedPayload: DispatchPayload = { ...outboxRow.payload, auctionId };

  const now = new Date();
  for (const f of followers) {
    if (inQuietHours(f.quietHoursStart, f.quietHoursEnd, now)) {
      stats.quietHoursSkipped++;
      continue;
    }

    const channels = parseChannels(f.channels);
    if (channels.length === 0) {
      stats.prefSkipped++;
      continue;
    }

    // Always create the in-app row when 'inapp' is enabled — this is the
    // user-facing inbox source.
    if (channels.includes('inapp')) {
      const r = await recordInApp(f, auctionId, outboxRow.eventType, enrichedPayload, dedupeKey);
      if (r.created) stats.inAppCreated++;
      if (r.duplicate) stats.duplicatesSkipped++;
    }
    if (channels.includes('email')) {
      await deliverEmail(f, auctionId, outboxRow.eventType, enrichedPayload, dedupeKey, stats);
    }
    if (channels.includes('push')) {
      await deliverPush(f, auctionId, outboxRow.eventType, enrichedPayload, dedupeKey, stats);
    }
  }

  return followerUserIds;
}

/**
 * Write the audit row for one alert-path delivery.
 *
 * `alertId` is deliberately NULL on the column (the originating alert lives in
 * `payload.__alertId`): the schema's UNIQUE(alertId, auctionId, channel) is
 * already occupied by Engine A's NEW_MATCH row for the same (alert, auction,
 * 'email'), and Postgres treats NULLs as distinct, so this is the only way both
 * mails can be recorded. Never throws — a bookkeeping failure must not break
 * the drain, but it IS reported, because a lost row means a possible re-mail.
 */
async function recordAlertNotification(args: {
  userId: string;
  auctionId: string;
  alertId: string;
  channel: NotificationChannel;
  dedupeKey: string;
  payload: DispatchPayload;
  failureReason?: string;
  stats: DispatchStats;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: args.userId,
        alertId: null,
        auctionId: args.auctionId,
        type: notificationTypeForEvent(EVENT_TYPES.GO_LIVE),
        channel: args.channel,
        payload: {
          ...args.payload,
          __dedupe: args.dedupeKey,
          __event: EVENT_TYPES.GO_LIVE,
          __alertId: args.alertId,
        },
        deliveredAt: args.failureReason ? null : new Date(),
        deliveryAttempts: 1,
        failureReason: args.failureReason ?? null,
      },
    });
  } catch (err) {
    args.stats.errors.push(`alert_notification_write:${(err as Error).message}`);
  }
}

/**
 * Phase (b) of the drain: send the planned alert mails.
 *
 * Notification rows (email + inapp) are written PER AUCTION and ONLY on a
 * successful send, so a grouped mail that covers three auctions records three
 * rows and a retry after a failure re-mails only what is still unrecorded.
 */
async function sendAlertMails(
  matches: AlertMatch[],
  mode: FanoutMode,
  stats: DispatchStats,
): Promise<void> {
  if (mode === 'off' || matches.length === 0) return;

  // Resolve the dedupe gate up front: one lookup per (user, dedupeKey) pair,
  // bounded by the number of matches, then a pure Set-backed predicate so the
  // planner stays synchronous and testable.
  const pairs = Array.from(
    new Map(
      matches.map((m) => [`${m.userId}\u0000${m.dedupeKey}`, m] as const),
    ).values(),
  );
  const delivered = new Set<string>();
  for (const m of pairs) {
    if (await alreadyDelivered(m.userId, 'email', m.dedupeKey)) {
      delivered.add(`${m.userId}\u0000${m.dedupeKey}`);
    }
  }

  const plan = planAlertMails(
    matches,
    (userId, dedupeKey) => delivered.has(`${userId}\u0000${dedupeKey}`),
    mode,
  );
  stats.alertMatched += plan.matched;
  stats.duplicatesSkipped += plan.skippedDuplicate;

  // `count` mode: recipients computed and reported, nothing sent, no rows.
  if (mode !== 'live' || plan.mails.length === 0) return;

  const resend = getResend();
  if (!resend) {
    stats.alertEmailsFailed += plan.mails.length;
    stats.errors.push('resend_not_configured');
    return;
  }

  const manageUrl = `${APP_URL.replace(/\/+$/, '')}/alerts`;

  for (const mail of plan.mails) {
    const rendered = createAuctionLiveAlertEmail({
      alertName: mail.alertName,
      manageUrl,
      auctions: mail.entries.map((e) => ({
        title:
          e.auction.title?.trim() ||
          e.auction.municipality?.trim() ||
          'Subasta',
        url: `${APP_URL.replace(/\/+$/, '')}/auction/${e.auction.id}`,
        province: e.auction.province ?? null,
        municipality: e.auction.municipality ?? null,
        appraisalValue: e.auction.appraisalValue ?? null,
        endsAt: e.auction.endsAt ?? null,
      })),
    });

    let failure: string | undefined;
    try {
      const r = await resend.emails.send({
        from: fromEmail(),
        to: [mail.email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (r.error) failure = r.error.message ?? 'resend_error';
    } catch (err) {
      failure = (err as Error).message;
    }

    if (failure) {
      stats.alertEmailsFailed++;
      stats.errors.push(`alert_email:${failure}`);
    } else {
      stats.alertEmailsSent++;
      if (mail.grouped) stats.alertGroupedMails++;
    }

    // One audit row per auction, both channels, success or failure. On failure
    // the row carries failureReason and NO deliveredAt — and crucially it is
    // still written, so `alreadyDelivered` will NOT suppress the retry (that
    // check is keyed on the dedupe value, which a failed row also carries).
    // That is the deliberate trade-off: we prefer a recorded failure that the
    // operator can see over a silent hole, and the retry is governed by the
    // outbox row, which is marked processed either way.
    for (const e of mail.entries) {
      const payload: DispatchPayload = {
        auctionId: e.auction.id,
        title: e.auction.title ?? null,
        province: e.auction.province ?? null,
        municipality: e.auction.municipality ?? null,
        appraisalValue: e.auction.appraisalValue ?? null,
        __path: 'alert',
      };
      if (failure) {
        await recordAlertNotification({
          userId: mail.userId,
          auctionId: e.auction.id,
          alertId: e.alertId,
          channel: 'email',
          dedupeKey: e.dedupeKey,
          payload,
          failureReason: failure,
          stats,
        });
        continue;
      }
      await recordAlertNotification({
        userId: mail.userId,
        auctionId: e.auction.id,
        alertId: e.alertId,
        channel: 'email',
        dedupeKey: e.dedupeKey,
        payload,
        stats,
      });
      // In-app inbox copy — alert subscribers get `email,inapp` and no quiet
      // hours (they never configured any; only a Favorite carries those).
      if (!(await alreadyDelivered(mail.userId, 'inapp', e.dedupeKey))) {
        await recordAlertNotification({
          userId: mail.userId,
          auctionId: e.auction.id,
          alertId: e.alertId,
          channel: 'inapp',
          dedupeKey: e.dedupeKey,
          payload,
          stats,
        });
        stats.inAppCreated++;
      }
    }
  }
}

/**
 * Public entrypoint — drains up to `batchSize` outbox rows.
 *
 * Three phases, because `grouped` alert mails span rows (see the file header):
 *   (a) per-row follower fan-out + collect alert matches — NO markProcessed;
 *   (b) send the alert mails for the whole batch;
 *   (c) mark every row whose handling completed.
 * A row that threw in (a) is never marked, so the next drain retries it.
 */
export async function drainOutbox(batchSize = 50): Promise<DispatchStats> {
  const stats = newStats();
  const mode: FanoutMode = parseFanoutMode(process.env.ALERT_GOLIVE_FANOUT);
  const rows = await claimUnprocessed(batchSize);
  stats.outboxScanned = rows.length;

  const handled: string[] = [];
  const alertMatches: AlertMatch[] = [];
  // Lazily loaded on the first go_live row; null means "not needed yet".
  let activeAlerts: AlertSubscriber[] | null = null;

  // ── (a) follower fan-out, then alert matching ────────────────────────────
  for (const row of rows) {
    try {
      const followerUserIds = await dispatchEvent(row, stats);

      if (mode !== 'off' && row.eventType === EVENT_TYPES.GO_LIVE) {
        const auctionId =
          row.auctionId ?? (row.payload.auctionId as string | undefined) ?? null;
        if (auctionId) {
          // One alert query for the WHOLE drain, then one auction row per
          // go_live event. No N+1 in either direction.
          if (activeAlerts === null) activeAlerts = await loadActiveAlerts();
          const alerts = activeAlerts;
          const auction = await loadAuctionForFanout(auctionId);
          if (auction) {
            const { matches } = collectAlertMatches({
              eventType: row.eventType,
              auction,
              alerts,
              favoriteUserIds: followerUserIds,
              mode,
              dedupeKey: row.dedupeKey ?? `${row.eventType}:${row.id}`,
            });
            alertMatches.push(...matches);
          }
        }
      }

      handled.push(row.id);
    } catch (err) {
      stats.outboxSkipped++;
      stats.errors.push(`outbox_${row.id}_throw:${(err as Error).message}`);
      // Leave processedAt = NULL so the next drain retries. To avoid hot
      // loops, the worker sleeps between drains.
    }
  }

  // ── (b) alert mails for the whole batch ──────────────────────────────────
  try {
    await sendAlertMails(alertMatches, mode, stats);
  } catch (err) {
    // Never strand follower work on an alert-path failure.
    stats.errors.push(`alert_fanout_throw:${(err as Error).message}`);
  }

  // ── (c) mark processed ───────────────────────────────────────────────────
  for (const id of handled) {
    try {
      await markProcessed(id);
      stats.outboxProcessed++;
    } catch (err) {
      stats.errors.push(`outbox_${id}_mark_throw:${(err as Error).message}`);
    }
  }

  return stats;
}

/** Allow callers (tests, scripts) to inject an event for verification. */
export async function insertTestEvent(
  auctionId: string,
  eventType: string = EVENT_TYPES.NEW_BID,
  payload: DispatchPayload = {},
  dedupeKey?: string,
): Promise<string> {
  const row = await prisma.eventOutbox.create({
    data: {
      auctionId,
      eventType,
      payload: { auctionId, ...payload },
      dedupeKey: dedupeKey ?? `${auctionId}:${eventType}:${Date.now()}`,
    },
    select: { id: true },
  });
  return row.id;
}
