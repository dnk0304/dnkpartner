/**
 * Smoke test for the notification dispatcher (Wave 2b).
 *
 * Run: `tsx scripts/smoke-dispatcher.ts`
 *
 * What it does:
 *   1. Pick (or create) a test user.
 *   2. Pick a random Auction.
 *   3. Ensure the user follows that auction with all channels enabled.
 *   4. Insert a fake event_outbox row.
 *   5. Run drainOutbox(1).
 *   6. Assert a Notification row was created.
 *   7. Insert the SAME event again (same dedupeKey) — assert NO new Notification row.
 *
 * Expects DATABASE_URL set + PG reachable.
 */
import { prisma } from '@/lib/prisma';
import { drainOutbox, insertTestEvent } from '@/lib/dispatcher';
import { EVENT_TYPES } from '@/lib/dispatcher/templates';

function log(msg: string, extra?: unknown) {
  const line = extra === undefined ? msg : `${msg} ${JSON.stringify(extra)}`;
  console.log(`[smoke ${new Date().toISOString()}] ${line}`);
}

async function main() {
  log('start');

  // 1. test user
  const testEmail = 'forge-smoke@dnk.test';
  const user = await prisma.user.upsert({
    where: { email: testEmail },
    create: { email: testEmail, tier: 'FREE' },
    update: {},
    select: { id: true, email: true },
  });
  log('user', user);

  // 2. random auction
  const auction = await prisma.auction.findFirst({ select: { id: true, title: true } });
  if (!auction) {
    log('no_auction_in_db — abort');
    process.exit(2);
  }
  log('auction', auction);

  // 3. follow with all prefs on, inapp channel only (avoid sending real email)
  await prisma.favorite.upsert({
    where: { userId_auctionId: { userId: user.id, auctionId: auction.id } },
    create: {
      userId: user.id,
      auctionId: auction.id,
      channels: 'inapp', // smoke = no real email, no real push
    },
    update: { channels: 'inapp' },
  });
  log('follow_ready');

  // 4. fake outbox event
  const dedupeKey = `${auction.id}:${EVENT_TYPES.NEW_BID}:smoke-${Date.now()}`;
  const outboxId = await insertTestEvent(
    auction.id,
    EVENT_TYPES.NEW_BID,
    {
      title: auction.title,
      currentBid: 12345,
      province: 'Madrid',
      municipality: 'Madrid',
    },
    dedupeKey,
  );
  log('outbox_inserted', { outboxId, dedupeKey });

  // 5. drain
  const stats1 = await drainOutbox(10);
  log('drain_1', stats1);

  // 6. check in-app row
  const notif = await prisma.notification.findFirst({
    where: { userId: user.id, auctionId: auction.id, channel: 'inapp' },
    orderBy: { sentAt: 'desc' },
    select: { id: true, type: true, payload: true },
  });
  if (!notif) {
    log('FAIL: no notification row created');
    process.exit(3);
  }
  log('notification_created', notif);

  // 7. re-insert SAME dedupeKey → expect dedupe
  const outboxId2 = await insertTestEvent(
    auction.id,
    EVENT_TYPES.NEW_BID,
    {
      title: auction.title,
      currentBid: 12345,
      province: 'Madrid',
    },
    `${dedupeKey}:rerun`, // different outbox row...
  );

  // Manually re-insert with the same dedupe-in-payload effect:
  // We use a different outbox dedupeKey here (uniqueness on EventOutbox prevents
  // exact reuse), but the dispatcher dedupes on Notification.payload.__dedupe.
  // To exercise that, we patch the second outbox row to carry the same dedupeKey
  // string as the first by writing a fresh outbox row whose internal handling
  // collapses to the same dedupe. Easiest: re-run drainOutbox after deleting the
  // marker on the outbox row.
  // For this smoke we just confirm the channel-level dedupe by re-running the
  // dispatcher on the second outbox row and confirming no SECOND in-app row
  // for the same user+dedupe.
  log('second_outbox_inserted', { outboxId2 });
  // Force the second outbox row to share the FIRST dedupeKey so it triggers
  // dedupe (not duplicate-row): UPDATE its dedupeKey AND payload-embedded one
  // is handled by Notification.payload.__dedupe set by the dispatcher itself
  // from the outbox.dedupeKey. So we update the outbox row's dedupeKey to
  // match the first.
  await prisma.eventOutbox.update({
    where: { id: outboxId2 },
    data: { dedupeKey, processedAt: null },
  });

  const stats2 = await drainOutbox(10);
  log('drain_2', stats2);

  const count = await prisma.notification.count({
    where: { userId: user.id, auctionId: auction.id, channel: 'inapp' },
  });
  log('inapp_notification_count_for_user_auction', { count });
  if (count !== 1) {
    log('FAIL: expected 1 in-app notification, got ' + count);
    process.exit(4);
  }

  log('PASS — dispatcher delivered once and deduped on re-drain');
  process.exit(0);
}

main().catch((err) => {
  log('smoke_threw', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
