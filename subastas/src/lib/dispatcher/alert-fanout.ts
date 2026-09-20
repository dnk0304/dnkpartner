/**
 * Engine B — saved-search fan-out PLANNER for `auction.go_live` (wave218).
 *
 * This module is PURE on purpose. `dispatcher/index.ts` owns the two Prisma
 * reads (the auction row, the active alert rows) and all the writes; everything
 * that DECIDES who gets which mail lives here, so the decision is unit-testable
 * without a database and without a Resend key.
 *
 * ── The locked rule this implements (Dennis, 2026-09-20) ────────────────────
 * A saved-search subscriber is mailed when a matching auction is first scraped
 * (Engine A, NEW_MATCH) and again when it GOES LIVE (here). After it is live,
 * every further event — ending_soon, finished, suspended, rescheduled,
 * new_bid, status_change — reaches FOLLOWERS ONLY (a `Favorite` row on that
 * auction). That is why `collectAlertMatches` hard-returns [] for every event
 * type except `auction.go_live`. There is deliberately no config list: adding
 * an event type to the alert path must be a reviewed code change.
 *
 * ── Dedupe (RULES rule 1) ──────────────────────────────────────────────────
 * One mail per user per auction per event. Two independent gates:
 *   1. Union-by-userId with the auction's Favorite followers — the FAVORITE
 *      entry wins, because it carries the user's explicit channel and
 *      quiet-hours choices. A user who both follows the auction and has a
 *      matching saved search gets exactly ONE go_live mail, via the follower
 *      path, even if that path then suppresses it for quiet hours (that is the
 *      user's own setting, and honouring it beats routing around it).
 *   2. `alreadyDelivered(userId, 'email', dedupeKey)` — the same
 *      `Notification.payload.__dedupe` check the follower path uses. This is
 *      what makes a retry after a partial batch failure safe.
 *
 * ── Grouping (RULES rule 3) ────────────────────────────────────────────────
 * `Alert.notificationType` is `grouped` (default) or `individual`.
 *   - individual: one mail per matched auction.
 *   - grouped:    one mail per user per DRAIN, listing every auction that went
 *                 live in that batch. There is no time-of-day digest in the
 *                 product; "grouped" has always meant per-run grouping.
 * Grouping is therefore a BATCH-level decision, which is why the planner takes
 * all of a drain's go_live rows at once rather than one row at a time.
 *
 * ── Kill switch ────────────────────────────────────────────────────────────
 * `ALERT_GOLIVE_FANOUT` = `off` | `count` | `live` (code default `live`).
 *   off   — no matching at all; `alertMatched` stays 0.
 *   count — match and report `alertMatched`; send nothing, write no
 *           Notification rows. Used for the first production drain of wave218
 *           because this project has no staging environment.
 *   live  — send.
 * In every mode the outbox rows are still marked processed: the switch governs
 * the ALERT path only and must never strand follower notifications.
 */
import { alertMatchesAuction, type AlertCriteria, type AuctionForMatch } from '@/lib/alerts/matcher';
import { EVENT_TYPES } from '@/lib/dispatcher/templates';

export type FanoutMode = 'off' | 'count' | 'live';

/** Parse the kill switch. Anything unrecognised (or unset) means `live`. */
export function parseFanoutMode(raw: string | null | undefined): FanoutMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'off') return 'off';
  if (v === 'count') return 'count';
  return 'live';
}

/** An active, email-enabled Alert plus the user it belongs to. */
export interface AlertSubscriber extends AlertCriteria {
  id: string;
  userId: string;
  email: string;
  name?: string | null;
  /** `grouped` (default) | `individual`. */
  notificationType?: string | null;
  active?: boolean;
  emailEnabled?: boolean;
}

/** The auction fields the planner needs: matching + rendering. */
export interface FanoutAuction extends AuctionForMatch {
  id: string;
  title?: string | null;
  endsAt?: string | Date | null;
}

/** One go_live outbox row, reduced to what the planner reads. */
export interface FanoutRow {
  eventType: string;
  auction: FanoutAuction;
  dedupeKey: string;
}

/** A single (user, auction) alert hit, before grouping. */
export interface AlertMatch {
  userId: string;
  email: string;
  alertId: string;
  alertName: string | null;
  grouped: boolean;
  auction: FanoutAuction;
  dedupeKey: string;
}

/** One mail the dispatcher should actually send. */
export interface PlannedAlertMail {
  userId: string;
  email: string;
  alertId: string;
  alertName: string | null;
  grouped: boolean;
  /** 1 entry for `individual`; 1..N for `grouped`. */
  entries: Array<{ auction: FanoutAuction; dedupeKey: string; alertId: string }>;
}

export interface AlertFanoutPlan {
  /** Distinct (userId, auctionId) alert hits that survived both dedupe gates. */
  matched: number;
  /** Empty in `off` and `count` mode. */
  mails: PlannedAlertMail[];
  /** Hits dropped because the user is a Favorite follower of that auction. */
  skippedFollower: number;
  /** Hits dropped because a Notification row already carries the dedupe key. */
  skippedDuplicate: number;
}

/**
 * Per-row matching. Returns one hit per (user, auction) — a user with several
 * saved searches matching the same auction is mailed ONCE (first alert wins,
 * and supplies the name shown in the mail).
 *
 * `favoriteUserIds` is the set of users who have a `Favorite` on THIS auction,
 * regardless of their notify prefs: the follower path owns them either way.
 */
export function collectAlertMatches(input: {
  eventType: string;
  auction: FanoutAuction;
  alerts: AlertSubscriber[];
  favoriteUserIds: Iterable<string>;
  mode?: FanoutMode;
  dedupeKey: string;
}): { matches: AlertMatch[]; skippedFollower: number } {
  const mode = input.mode ?? 'live';
  if (mode === 'off') return { matches: [], skippedFollower: 0 };

  // Rule 6 / constraint 3: the alert path is hard-limited to go_live.
  if (input.eventType !== EVENT_TYPES.GO_LIVE) return { matches: [], skippedFollower: 0 };

  const followers = new Set(input.favoriteUserIds);
  const seenUsers = new Set<string>();
  const matches: AlertMatch[] = [];
  let skippedFollower = 0;

  for (const alert of input.alerts) {
    // Belt-and-braces: index.ts filters these in SQL, but the planner must be
    // correct on its own so the unit tests exercise the real gate.
    if (alert.active === false) continue;
    if (alert.emailEnabled === false) continue;
    if (!alert.email) continue;
    if (seenUsers.has(alert.userId)) continue;
    if (!alertMatchesAuction(alert, input.auction)) continue;

    if (followers.has(alert.userId)) {
      skippedFollower += 1;
      seenUsers.add(alert.userId);
      continue;
    }

    seenUsers.add(alert.userId);
    matches.push({
      userId: alert.userId,
      email: alert.email,
      alertId: alert.id,
      alertName: alert.name ?? null,
      grouped: (alert.notificationType ?? 'grouped') !== 'individual',
      auction: input.auction,
      dedupeKey: input.dedupeKey,
    });
  }

  return { matches, skippedFollower };
}

/**
 * Batch-level grouping + the second dedupe gate.
 *
 * `alreadyDelivered` is injected (sync predicate) so the planner stays pure;
 * `index.ts` pre-resolves the Notification lookups and passes a Set-backed
 * closure.
 */
export function planAlertMails(
  matches: AlertMatch[],
  alreadyDelivered: (userId: string, dedupeKey: string) => boolean,
  mode: FanoutMode = 'live',
): AlertFanoutPlan {
  const plan: AlertFanoutPlan = { matched: 0, mails: [], skippedFollower: 0, skippedDuplicate: 0 };
  if (mode === 'off') return plan;

  const live: AlertMatch[] = [];
  const seenPair = new Set<string>();
  for (const m of matches) {
    const pair = `${m.userId} ${m.auction.id}`;
    if (seenPair.has(pair)) continue;
    seenPair.add(pair);
    if (alreadyDelivered(m.userId, m.dedupeKey)) {
      plan.skippedDuplicate += 1;
      continue;
    }
    live.push(m);
  }

  plan.matched = live.length;
  if (mode === 'count') return plan;

  // grouped -> one mail per user for the whole batch; individual -> one per hit.
  const groupedByUser = new Map<string, PlannedAlertMail>();
  for (const m of live) {
    const entry = { auction: m.auction, dedupeKey: m.dedupeKey, alertId: m.alertId };
    if (!m.grouped) {
      plan.mails.push({
        userId: m.userId,
        email: m.email,
        alertId: m.alertId,
        alertName: m.alertName,
        grouped: false,
        entries: [entry],
      });
      continue;
    }
    const existing = groupedByUser.get(m.userId);
    if (existing) {
      existing.entries.push(entry);
    } else {
      const mail: PlannedAlertMail = {
        userId: m.userId,
        email: m.email,
        alertId: m.alertId,
        alertName: m.alertName,
        grouped: true,
        entries: [entry],
      };
      groupedByUser.set(m.userId, mail);
      plan.mails.push(mail);
    }
  }

  return plan;
}

/**
 * Convenience entrypoint used by the tests and by `index.ts`: match every row
 * of a drain, then plan the mails. Accepts either a batch (`rows`) or the
 * single-event shorthand (`eventType` + `auction` + `dedupeKey`).
 */
export function planAlertFanout(input: {
  mode?: FanoutMode;
  alerts: AlertSubscriber[];
  /** userIds with a Favorite on the auction, per auctionId. */
  favoriteUserIdsByAuction?: Record<string, string[]>;
  /** Shorthand for a single-auction batch. */
  favorites?: string[];
  rows?: FanoutRow[];
  eventType?: string;
  auction?: FanoutAuction;
  dedupeKey?: string;
  alreadyDelivered?: (userId: string, dedupeKey: string) => boolean;
}): AlertFanoutPlan {
  const mode = input.mode ?? 'live';
  const rows: FanoutRow[] =
    input.rows ??
    (input.auction
      ? [
          {
            eventType: input.eventType ?? EVENT_TYPES.GO_LIVE,
            auction: input.auction,
            dedupeKey: input.dedupeKey ?? `${input.auction.id}:${EVENT_TYPES.GO_LIVE}:live`,
          },
        ]
      : []);

  const all: AlertMatch[] = [];
  let skippedFollower = 0;
  for (const row of rows) {
    const favs =
      input.favoriteUserIdsByAuction?.[row.auction.id] ?? input.favorites ?? [];
    const r = collectAlertMatches({
      eventType: row.eventType,
      auction: row.auction,
      alerts: input.alerts,
      favoriteUserIds: favs,
      mode,
      dedupeKey: row.dedupeKey,
    });
    all.push(...r.matches);
    skippedFollower += r.skippedFollower;
  }

  const plan = planAlertMails(all, input.alreadyDelivered ?? (() => false), mode);
  plan.skippedFollower = skippedFollower;
  return plan;
}
