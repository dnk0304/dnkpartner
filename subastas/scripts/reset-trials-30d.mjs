#!/usr/bin/env node
/**
 * reset-trials-30d.mjs — one-shot, reversible reset of EVERY user's trial
 * window to a fresh 30 days. (Dispatch: dnksubastas 30-Day Free Access Reset.)
 *
 * WHY
 * ---
 * The freemium gate (src/lib/access.ts) grants full access when
 * `isPaid(tier) OR now < trialEndDate`. Existing users' `trialEndDate` clocks
 * quietly expired while the gate was effectively dormant, so they are now
 * locked out of alerts / full auction info. Dennis's call (2026-07-31): give
 * ALL users 30 days free access now; payment enforcement lands next week.
 * This script re-extends every user's trial to now+30d.
 *
 * WHAT IT DOES (in order)
 * -----------------------
 *   1. BACKUP FIRST  — dumps (id, email, tier, trialStartDate, trialEndDate)
 *      for EVERY user to a timestamped JSON before any write. This file is the
 *      rollback artifact. Written in BOTH dry-run and apply mode.
 *   2. COUNT BEFORE  — totals + status breakdown (paid / trial-active /
 *      expired) using the SAME logic as GET /api/admin/users.
 *   3. UPDATE (apply only) — sets `trialStartDate = now` and
 *      `trialEndDate = now + 30 days` for ALL users via a single atomic
 *      updateMany. Resetting paid users too is harmless: isPaid(tier) already
 *      grants them access, and the UI keys "Pagado" off tier/status, not the
 *      trial clock. Matches Dennis's "reset ALL users".
 *   4. COUNT AFTER   — re-logs the status breakdown and asserts every user is
 *      now trial-active with ~30 days left.
 *
 * IDEMPOTENT — running twice just re-extends to now+30d again (fine, no drift).
 * REVERSIBLE — see --revert below.
 *
 * MODES
 * -----
 *   # DRY-RUN (default) — backup + before-counts + preview, NO write:
 *   docker exec dnksubastas-app node /app/scripts/reset-trials-30d.mjs
 *
 *   # APPLY — backup, then set trialEndDate = now+30d for all users:
 *   docker exec dnksubastas-app node /app/scripts/reset-trials-30d.mjs --apply
 *
 *   # REVERT (dry-run) — preview restoring from a backup file:
 *   docker exec dnksubastas-app node /app/scripts/reset-trials-30d.mjs \
 *       --revert --backup /app/trial-reset-backup-<ISO>.json
 *
 *   # REVERT (apply) — actually restore each row's trialStartDate/trialEndDate
 *   # from the backup file:
 *   docker exec dnksubastas-app node /app/scripts/reset-trials-30d.mjs \
 *       --revert --backup /app/trial-reset-backup-<ISO>.json --apply
 *
 * The backup JSON is written to the current working directory (inside the
 * container that's `/app`) unless --backup-dir <path> is given. The apply run
 * prints the exact absolute path — keep it; it is the ONLY way to --revert.
 *
 * NOT wired to any request path, cron, or boot hook. One-shot, manual only.
 * Exit code 0 on success, 1 on any error.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as dotenv } from 'dotenv';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load DATABASE_URL the same way prisma.config.ts does — .env then .env.local.
// In the Coolify container DATABASE_URL is already in process.env; these calls
// are harmless no-ops when the files are absent.
dotenv({ path: '.env', quiet: true });
dotenv({ path: '.env.local', quiet: true });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const REVERT = argv.includes('--revert');
const TRIAL_DAYS = 30;
const DAY_MS = 86_400_000;

function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

// Prisma 7 requires a driver adapter — mirror src/lib/prisma.ts (@prisma/adapter-pg
// against the same DATABASE_URL). Bare `new PrismaClient()` throws on v7.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run inside the app container (env-injected) or with .env present.');
  process.exit(1);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  log: ['warn', 'error'],
});

// ---- status helpers (mirror GET /api/admin/users) -------------------------
const PAID_TIERS = new Set(['ACCESO', 'GOLD', 'DIAMOND']);

function statusOf(user, now) {
  if (PAID_TIERS.has(user.tier)) return 'paid';
  const end = user.trialEndDate ? new Date(user.trialEndDate) : null;
  const active = end !== null && Number.isFinite(end.getTime()) && end.getTime() > now;
  return active ? 'trial' : 'expired';
}

function tallyStatuses(users, now) {
  const t = { paid: 0, trial: 0, expired: 0 };
  for (const u of users) t[statusOf(u, now)] += 1;
  return t;
}

function logHeader(mode) {
  console.log('—'.repeat(72));
  console.log(`reset-trials-30d.mjs — mode: ${mode}`);
  console.log(`started: ${new Date().toISOString()}`);
  console.log('—'.repeat(72));
}

// ---------------------------------------------------------------------------
// FORWARD: backup -> count -> (apply) reset -> count
// ---------------------------------------------------------------------------
async function runReset() {
  logHeader(APPLY ? 'APPLY (reset all trials -> now+30d)' : 'DRY-RUN (reset)');

  // 1. BACKUP FIRST — read every user's current trial state.
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      tier: true,
      trialStartDate: true,
      trialEndDate: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const now = Date.now();
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const backupDir = argValue('--backup-dir') ?? process.cwd();
  const backupPath = resolve(backupDir, `trial-reset-backup-${stamp}.json`);

  const backup = {
    generatedAt: new Date(now).toISOString(),
    trialDays: TRIAL_DAYS,
    count: users.length,
    // Each row carries the ORIGINAL values so --revert can restore exactly.
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      tier: u.tier,
      trialStartDate: u.trialStartDate ? new Date(u.trialStartDate).toISOString() : null,
      trialEndDate: u.trialEndDate ? new Date(u.trialEndDate).toISOString() : null,
    })),
  };
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\n[backup] wrote ${users.length} row(s) -> ${backupPath}`);
  console.log('[backup] KEEP THIS FILE — it is the rollback artifact for --revert.');

  // 2. COUNT BEFORE.
  const before = tallyStatuses(users, now);
  console.log(`\n[before] total users: ${users.length}`);
  console.log(`[before] paid: ${before.paid}  trial-active: ${before.trial}  expired: ${before.expired}`);

  const newEnd = new Date(now + TRIAL_DAYS * DAY_MS);
  const newStart = new Date(now);
  console.log(`\n[plan] set trialStartDate = ${newStart.toISOString()}`);
  console.log(`[plan] set trialEndDate   = ${newEnd.toISOString()}  (now + ${TRIAL_DAYS} days)`);
  console.log(`[plan] target rows: ${users.length} (ALL users, incl. paid — harmless)`);

  if (!APPLY) {
    console.log('\nDRY-RUN complete. No rows changed. Re-run with --apply to write.');
    return;
  }

  // 3. UPDATE — single atomic updateMany over all rows.
  console.log('\n— APPLYING RESET —');
  const res = await prisma.user.updateMany({
    data: { trialStartDate: newStart, trialEndDate: newEnd },
  });
  console.log(`[apply] updateMany affected ${res.count} row(s).`);

  // 4. COUNT AFTER — re-read and re-tally.
  const afterUsers = await prisma.user.findMany({
    select: { id: true, tier: true, trialEndDate: true },
  });
  const nowAfter = Date.now();
  const after = tallyStatuses(afterUsers, nowAfter);
  console.log(`\n[after] total users: ${afterUsers.length}`);
  console.log(`[after] paid: ${after.paid}  trial-active: ${after.trial}  expired: ${after.expired}`);

  // Assert: every non-paid user is now trial-active (0 expired).
  if (after.expired !== 0) {
    console.warn(`[after] WARNING: expected 0 expired, got ${after.expired}. Investigate before deploy.`);
  } else {
    console.log('[after] OK — 0 expired; every non-paid user is trial-active with ~30 days left.');
  }
  console.log('\nAPPLY complete.');
  console.log(`Rollback: node /app/scripts/reset-trials-30d.mjs --revert --backup ${backupPath} --apply`);
}

// ---------------------------------------------------------------------------
// REVERT: restore trialStartDate/trialEndDate per row from a backup file
// ---------------------------------------------------------------------------
async function runRevert() {
  logHeader(APPLY ? 'APPLY (revert from backup)' : 'DRY-RUN (revert)');

  const backupArg = argValue('--backup');
  if (!backupArg) {
    throw new Error('--revert requires --backup <path-to-trial-reset-backup-*.json>');
  }
  const backupPath = resolve(backupArg);
  const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
  const rows = Array.isArray(parsed?.users) ? parsed.users : null;
  if (!rows) {
    throw new Error(`Backup file ${backupPath} has no "users" array — wrong file?`);
  }
  console.log(`\n[revert] loaded ${rows.length} row(s) from ${backupPath}`);
  console.log(`[revert] backup generatedAt: ${parsed.generatedAt ?? '(unknown)'}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. Would restore trialStartDate/trialEndDate for ${rows.length} row(s).`);
    console.log('Re-run with --apply to write.');
    return;
  }

  console.log('\n— APPLYING REVERT —');
  let restored = 0;
  let missing = 0;
  // Per-row update: only the two trial columns are touched. Rows deleted since
  // the backup are skipped (P2025) rather than aborting the whole restore.
  for (const r of rows) {
    try {
      await prisma.user.update({
        where: { id: r.id },
        data: {
          trialStartDate: r.trialStartDate ? new Date(r.trialStartDate) : null,
          trialEndDate: r.trialEndDate ? new Date(r.trialEndDate) : null,
        },
      });
      restored += 1;
    } catch (err) {
      if (err && err.code === 'P2025') {
        missing += 1; // user no longer exists — skip
      } else {
        throw err;
      }
    }
  }
  console.log(`[revert] restored ${restored} row(s); skipped ${missing} missing row(s).`);
  console.log('\nREVERT complete.');
}

async function main() {
  if (REVERT) return runRevert();
  return runReset();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('reset-trials-30d.mjs FAILED:', err);
    try {
      await prisma.$disconnect();
    } catch {
      /* noop */
    }
    process.exit(1);
  });
