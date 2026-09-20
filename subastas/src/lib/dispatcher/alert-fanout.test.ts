/**
 * Tests for the wave218 saved-search go_live fan-out (Engine B).
 *
 * The planner (`alert-fanout.ts`) is a pure function precisely so this file can
 * assert the LOCKED rule end-to-end without Prisma, without Resend, and without
 * a clock — no mail is ever sent by running this.
 *
 * The rule, in Dennis's words (2026-09-20):
 *   "When a user wants to get notified about auctions in las palmas,
 *    everything. He should also get notified when an auction has changed state
 *    from upcoming to active. What happens after it has gone active shall only
 *    be notified if users chooses to follow that specific auction."
 *
 * The centrepiece is the Las Palmas lifecycle fixture below, which walks ONE
 * auction through its whole life and asserts the exact mail count each side
 * receives at every step.
 *
 * Run: npx tsx src/lib/dispatcher/alert-fanout.test.ts
 */
import {
  collectAlertMatches,
  parseFanoutMode,
  planAlertFanout,
  planAlertMails,
  type AlertSubscriber,
  type FanoutAuction,
} from './alert-fanout';
import { EVENT_TYPES, followerPrefField } from './templates';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  ok(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
const section = (t: string) => console.log(`\n# ${t}`);

// ── Fixture ─────────────────────────────────────────────────────────────────
// No real addresses anywhere in this file: recipients are opaque local ids.
const USER_A = 'user-a-saved-search';
const USER_B = 'user-b-follower';
const MAIL_A = 'a@example.invalid';
const MAIL_B = 'b@example.invalid';

const auction = (over: Partial<FanoutAuction> = {}): FanoutAuction => ({
  id: 'auc-lp-1',
  province: 'Las Palmas',
  municipality: 'Telde',
  category: 'INMUEBLE',
  source: 'BOE',
  auctionType: 'JUDICIAL',
  propertyType: 'VIVIENDA',
  status: 'CELEBRANDOSE',
  appraisalValue: 120000,
  title: 'Piso en Telde',
  endsAt: '2026-10-15T10:00:00.000Z',
  ...over,
});

/** User A: an active, email-enabled Las Palmas saved search, grouped. */
const alertA = (over: Partial<AlertSubscriber> = {}): AlertSubscriber => ({
  id: 'alert-a',
  userId: USER_A,
  email: MAIL_A,
  name: 'Las Palmas',
  province: 'Las Palmas',
  notificationType: 'grouped',
  active: true,
  emailEnabled: true,
  ...over,
});

const goLiveKey = (auctionId: string) => `${auctionId}:${EVENT_TYPES.GO_LIVE}:live`;

/**
 * Minimal stand-in for the FOLLOWER half of `dispatchEvent`, using the REAL
 * `followerPrefField` mapping from templates.ts. User B has every notifyOn*
 * flag on and channels 'email' — so this returns 1 whenever the event type is
 * follower-gated at all.
 */
const followerB = {
  userId: USER_B,
  notifyOnGoLive: true,
  notifyOnBid: true,
  notifyOnStatus: true,
  notifyOnSuspension: true,
  notifyOnResume: true,
  notifyOnFinish: true,
} as Record<string, unknown> & { userId: string };

function followerMailCount(eventType: string): number {
  const field = followerPrefField(eventType);
  if (!field) return 1; // ungated event types fall through to "send by default"
  return followerB[field] === true ? 1 : 0;
}

// ════════════════════════════════════════════════════════════════════════════
section('LAS PALMAS LIFECYCLE — the locked rule, asserted exactly');
// One auction: PROXIMA_APERTURA -> CELEBRANDOSE (go_live) -> ending_soon ->
// CONCLUIDA_PORTAL (finished). A = saved search only. B = follower only.
{
  let mailsToA = 0;
  let mailsToB = 0;

  const step = (eventType: string, auctionRow: FanoutAuction) => {
    const plan = planAlertFanout({
      mode: 'live',
      alerts: [alertA()],
      favorites: [USER_B],
      eventType,
      auction: auctionRow,
      dedupeKey: `${auctionRow.id}:${eventType}:x`,
    });
    const toA = plan.mails.filter((m) => m.userId === USER_A).length;
    const toB = followerMailCount(eventType);
    mailsToA += toA;
    mailsToB += toB;
    return { toA, toB };
  };

  const s1 = step(EVENT_TYPES.GO_LIVE, auction({ status: 'CELEBRANDOSE' }));
  eq('go_live -> exactly 1 mail to the saved-search subscriber A', s1.toA, 1);
  eq('go_live -> exactly 1 mail to the follower B', s1.toB, 1);

  const s2 = step(EVENT_TYPES.ENDING_SOON, auction({ status: 'CELEBRANDOSE' }));
  eq('ending_soon -> 0 mails to A (after live = followers only)', s2.toA, 0);
  eq('ending_soon -> 1 mail to B', s2.toB, 1);

  const s3 = step(EVENT_TYPES.FINISHED, auction({ status: 'CONCLUIDA_PORTAL' }));
  eq('finished -> 0 mails to A', s3.toA, 0);
  eq('finished -> 1 mail to B', s3.toB, 1);

  eq('A receives EXACTLY 1 mail over the whole lifecycle', mailsToA, 1);
  eq('B receives 3 over the whole lifecycle (one per followed event)', mailsToB, 3);
}

section('every non-go_live event type is hard-excluded from the alert path');
{
  const nonGoLive = Object.values(EVENT_TYPES).filter((t) => t !== EVENT_TYPES.GO_LIVE);
  const anyMail = nonGoLive.filter(
    (t) =>
      planAlertFanout({
        mode: 'live',
        alerts: [alertA()],
        favorites: [],
        eventType: t,
        auction: auction(),
      }).mails.length > 0,
  );
  eq('no alert mail for any of them', anyMail.length, 0);
  eq('and that covers all 6 of them', nonGoLive.length, 6);
  // Proof the detector can fire: the same call WITH go_live does produce one.
  eq(
    'control: go_live on the same fixture does produce a mail',
    planAlertFanout({
      mode: 'live',
      alerts: [alertA()],
      favorites: [],
      eventType: EVENT_TYPES.GO_LIVE,
      auction: auction(),
    }).mails.length,
    1,
  );
}

// ════════════════════════════════════════════════════════════════════════════
section('DEDUPE — one mail per user per auction per event');
{
  const key = goLiveKey('auc-lp-1');

  // Same go_live twice (a retried drain): the second run sees the
  // Notification row written by the first and sends nothing.
  const first = planAlertFanout({
    mode: 'live',
    alerts: [alertA()],
    favorites: [],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
    dedupeKey: key,
  });
  eq('first drain sends 1', first.mails.length, 1);

  const sentKeys = new Set<string>();
  for (const m of first.mails) for (const e of m.entries) sentKeys.add(`${m.userId}|${e.dedupeKey}`);

  const second = planAlertFanout({
    mode: 'live',
    alerts: [alertA()],
    favorites: [],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
    dedupeKey: key,
    alreadyDelivered: (userId, dedupeKey) => sentKeys.has(`${userId}|${dedupeKey}`),
  });
  eq('second drain of the SAME go_live sends 0', second.mails.length, 0);
  eq('and reports it as a duplicate', second.skippedDuplicate, 1);
  eq('and does not count it as matched', second.matched, 0);

  // A user who is BOTH a follower and a saved-search subscriber gets ONE mail:
  // the follower path owns them, so the alert path yields nothing.
  const both = planAlertFanout({
    mode: 'live',
    alerts: [alertA({ userId: USER_B, email: MAIL_B, id: 'alert-b' })],
    favorites: [USER_B],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
  });
  eq('follower + subscriber -> 0 alert mails', both.mails.length, 0);
  eq('...recorded as a follower-owned skip', both.skippedFollower, 1);
  eq('...so total mails for that user is 1 (the follower one)', both.mails.length + followerMailCount(EVENT_TYPES.GO_LIVE), 1);

  // Two matching saved searches owned by the same user still mean one mail.
  const twoAlerts = planAlertFanout({
    mode: 'live',
    alerts: [alertA(), alertA({ id: 'alert-a2', name: 'Telde', municipality: 'Telde' })],
    favorites: [],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
  });
  eq('two matching alerts, same user -> 1 mail', twoAlerts.mails.length, 1);
  eq('...and matched counts the user once', twoAlerts.matched, 1);
}

// ════════════════════════════════════════════════════════════════════════════
section('GROUPING — two auctions in one drain');
{
  const rows = [
    { eventType: EVENT_TYPES.GO_LIVE, auction: auction({ id: 'auc-1' }), dedupeKey: goLiveKey('auc-1') },
    { eventType: EVENT_TYPES.GO_LIVE, auction: auction({ id: 'auc-2' }), dedupeKey: goLiveKey('auc-2') },
  ];

  const grouped = planAlertFanout({
    mode: 'live',
    alerts: [alertA({ notificationType: 'grouped' })],
    rows,
  });
  eq('grouped -> 1 mail', grouped.mails.length, 1);
  eq('...listing both auctions', grouped.mails[0].entries.length, 2);
  eq('...and flagged grouped', grouped.mails[0].grouped, true);
  eq('...matched still counts 2 (user, auction) hits', grouped.matched, 2);
  ok(
    '...carrying one dedupe key per auction, so a partial retry is safe',
    grouped.mails[0].entries.map((e) => e.dedupeKey).join(',') ===
      `${goLiveKey('auc-1')},${goLiveKey('auc-2')}`,
  );

  const individual = planAlertFanout({
    mode: 'live',
    alerts: [alertA({ notificationType: 'individual' })],
    rows,
  });
  eq('individual -> 2 mails', individual.mails.length, 2);
  ok('...one auction each', individual.mails.every((m) => m.entries.length === 1));
  ok('...none flagged grouped', individual.mails.every((m) => m.grouped === false));

  // A grouped batch where one auction was already mailed keeps the other.
  const partial = planAlertFanout({
    mode: 'live',
    alerts: [alertA()],
    rows,
    alreadyDelivered: (_u, k) => k === goLiveKey('auc-1'),
  });
  eq('grouped with one already delivered -> still 1 mail', partial.mails.length, 1);
  eq('...covering only the un-mailed auction', partial.mails[0].entries.length, 1);
  eq('...which is auc-2', partial.mails[0].entries[0].auction.id, 'auc-2');
}

// ════════════════════════════════════════════════════════════════════════════
section('KILL SWITCH — ALERT_GOLIVE_FANOUT');
{
  eq("parse 'off'", parseFanoutMode('off'), 'off');
  eq("parse 'count'", parseFanoutMode('count'), 'count');
  eq("parse 'live'", parseFanoutMode('live'), 'live');
  eq('parse is case/whitespace tolerant', parseFanoutMode('  COUNT '), 'count');
  eq('unset defaults to live', parseFanoutMode(undefined), 'live');
  eq('null defaults to live', parseFanoutMode(null), 'live');
  eq('garbage defaults to live (fail-OPEN is the product default)', parseFanoutMode('yes'), 'live');

  const args = {
    alerts: [alertA()],
    favorites: [] as string[],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
    dedupeKey: goLiveKey('auc-lp-1'),
  };

  const live = planAlertFanout({ ...args, mode: 'live' });
  eq('live  -> 1 mail', live.mails.length, 1);
  eq('live  -> alertMatched 1', live.matched, 1);

  const count = planAlertFanout({ ...args, mode: 'count' });
  eq('count -> 0 mails', count.mails.length, 0);
  eq('count -> alertMatched still 1 (that is the whole point)', count.matched, 1);

  const off = planAlertFanout({ ...args, mode: 'off' });
  eq('off   -> 0 mails', off.mails.length, 0);
  eq('off   -> alertMatched 0', off.matched, 0);
}

// ════════════════════════════════════════════════════════════════════════════
section('ALERT GATES — active, emailEnabled, and the filters themselves');
{
  const base = {
    mode: 'live' as const,
    favorites: [] as string[],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
  };

  eq(
    'a Madrid alert matches nothing in Las Palmas',
    planAlertFanout({ ...base, alerts: [alertA({ province: 'Madrid' })] }).mails.length,
    0,
  );
  eq(
    'active = false -> 0',
    planAlertFanout({ ...base, alerts: [alertA({ active: false })] }).mails.length,
    0,
  );
  eq(
    'emailEnabled = false -> 0',
    planAlertFanout({ ...base, alerts: [alertA({ emailEnabled: false })] }).mails.length,
    0,
  );
  eq(
    'an alert whose user has no address -> 0',
    planAlertFanout({ ...base, alerts: [alertA({ email: '' })] }).mails.length,
    0,
  );
  eq(
    'propertyType now narrows the fan-out too (wave218)',
    planAlertFanout({ ...base, alerts: [alertA({ propertyType: 'GARAJE' })] }).mails.length,
    0,
  );
  eq('control: the unmodified alert still matches', planAlertFanout({ ...base, alerts: [alertA()] }).mails.length, 1);
  eq('no alerts at all -> 0', planAlertFanout({ ...base, alerts: [] }).mails.length, 0);
}

section('mail payload carries what the template needs');
{
  const plan = planAlertFanout({
    mode: 'live',
    alerts: [alertA()],
    favorites: [],
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
  });
  const mail = plan.mails[0];
  eq('recipient is the alert owner', mail.userId, USER_A);
  eq('alert name travels with the mail', mail.alertName, 'Las Palmas');
  eq('originating alertId is recorded for the audit row', mail.entries[0].alertId, 'alert-a');
  eq('auction id travels for the URL', mail.entries[0].auction.id, 'auc-lp-1');
}

section('collectAlertMatches / planAlertMails are usable separately (the drain path)');
{
  const c = collectAlertMatches({
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
    alerts: [alertA()],
    favoriteUserIds: [],
    mode: 'live',
    dedupeKey: goLiveKey('auc-lp-1'),
  });
  eq('collect finds the hit', c.matches.length, 1);
  const p = planAlertMails(c.matches, () => false, 'live');
  eq('plan turns it into one mail', p.mails.length, 1);
  eq('collect in off-mode finds nothing', collectAlertMatches({
    eventType: EVENT_TYPES.GO_LIVE,
    auction: auction(),
    alerts: [alertA()],
    favoriteUserIds: [],
    mode: 'off',
    dedupeKey: goLiveKey('auc-lp-1'),
  }).matches.length, 0);
}

console.log(`\nalert-fanout: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
