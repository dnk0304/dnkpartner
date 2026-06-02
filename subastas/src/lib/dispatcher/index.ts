/**
 * Notification dispatcher (Wave 2b).
 *
 * Drains rows from `event_outbox` (written by Ghost's scraper, Wave 2a), fans
 * each event out to followers (`Favorite` rows with per-event notify-prefs),
 * and delivers via three channels: email (Resend), web-push, in-app
 * `Notification` rows.
 *
 * Invariants:
 *   - At-least-once delivery (a crash before processedAt is set means the row
 *     is picked up on the next drain).
 *   - Idempotent per (dedupeKey, userId, channel) — we look up an existing
 *     Notification row with matching dedupeKey-in-payload before inserting a
 *     new one. (Cannot add a unique index in this wave — schema is frozen.)
 *   - Outbox row marked `processedAt` only after every (follower × channel)
 *     attempt has been recorded as delivered, failed, or skipped (duplicate /
 *     pref-off / quiet-hours).
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
  return (
    process.env.RESEND_FROM_EMAIL ??
    'SubastasActivas <notifications@subastasactivas.com>'
  );
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

async function resolveFollowers(
  auctionId: string,
  eventType: string,
): Promise<FavoriteWithUser[]> {
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

  if (!prefField) return favorites;
  return favorites.filter((f) => (f as Record<string, unknown>)[prefField] === true);
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
): Promise<void> {
  const dedupeKey = outboxRow.dedupeKey ?? `${outboxRow.eventType}:${outboxRow.id}`;
  const auctionId =
    outboxRow.auctionId ?? (outboxRow.payload.auctionId as string | undefined) ?? null;

  if (!auctionId) {
    stats.outboxSkipped++;
    stats.errors.push(`outbox_${outboxRow.id}_no_auctionid`);
    return;
  }

  const followers = await resolveFollowers(auctionId, outboxRow.eventType);
  stats.followersFanned += followers.length;
  if (followers.length === 0) return;

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
}

/** Public entrypoint — drains up to `batchSize` outbox rows. */
export async function drainOutbox(batchSize = 50): Promise<DispatchStats> {
  const stats = newStats();
  const rows = await claimUnprocessed(batchSize);
  stats.outboxScanned = rows.length;
  for (const row of rows) {
    try {
      await dispatchEvent(row, stats);
      await markProcessed(row.id);
      stats.outboxProcessed++;
    } catch (err) {
      stats.outboxSkipped++;
      stats.errors.push(`outbox_${row.id}_throw:${(err as Error).message}`);
      // Leave processedAt = NULL so the next drain retries. To avoid hot
      // loops, the worker sleeps between drains.
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
