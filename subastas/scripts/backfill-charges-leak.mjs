#!/usr/bin/env node
/**
 * backfill-charges-leak.mjs — one-shot cleanup for the 2026-06-08 BOE
 * scraper leak.
 *
 * BACKGROUND
 * ----------
 * Between ~late May and 2026-06-08 the BOE scraper's overly-greedy fallback
 * extractors dumped the entire BOE detail page's HTML/JS — site nav chrome
 * + the `var hoy = new Date()` JS clock + "Iniciar sesión" labels — into
 * the `Auction.chargesDetail` (~3,232 rows) and `Auction.lotDescription`
 * (~468 rows) columns. Display defence already rejects this content at
 * render time, but the columns also need a one-shot scrub so the DB doesn't
 * carry junk forever.
 *
 * STRATEGY
 * --------
 * For every row where either column matches the page-dump fingerprints,
 * set that column to NULL. This is the honest call — we DO NOT have the
 * real charges/lot text for these rows (the scraper overwrote it with
 * junk), so NULL is the correct "missing" representation. The next BOE
 * cron re-scrape (post-Ghost-fix) will populate the field with the real
 * value when the row appears in the active corpus again.
 *
 * SAFETY
 * ------
 * Dry-run by default. Reports per-source breakdown + total counts and
 * exits without writing. Re-run with `--apply` to UPDATE. The UPDATE is
 * idempotent (re-running after success is a no-op — predicate matches
 * zero rows). The job is resumable in the trivial sense: each UPDATE is
 * a single statement, no batching state to track.
 *
 * SEQUENCING (NON-NEGOTIABLE)
 * ---------------------------
 * RUN THIS AFTER Ghost's scraper fix (DISPATCH-BRIEF-GHOST-boe-chargesDetail-leak.md)
 * is LIVE. Backfilling before the scraper fix is live means the next BOE
 * cron will immediately re-poison the same rows the script just cleaned.
 *
 * RUNTIME
 * -------
 * The script connects via PrismaClient using the app container's
 * `DATABASE_URL`. Designed to run inside the `dnksubastas-app` container:
 *
 *     # DRY-RUN — inspect counts + per-source breakdown:
 *     docker exec dnksubastas-app node /app/scripts/backfill-charges-leak.mjs
 *
 *     # APPLY — set the matched fields to NULL:
 *     docker exec dnksubastas-app node /app/scripts/backfill-charges-leak.mjs --apply
 *
 * Exit code is 0 on success, 1 on any error.
 */

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

/**
 * Page-dump SQL fingerprints. Each predicate matches one tell-tale token
 * left behind by the BOE site-chrome leak. Mirrors PAGE_DUMP_TOKENS in
 * src/lib/sanitize-extracted-text.ts — if you add a token there, mirror
 * it here so the backfill scope tracks the display rejection scope.
 *
 * `{COL}` is replaced with the target column at call time.
 */
const PAGE_DUMP_PREDICATE = (col) => `(
    "${col}" ILIKE '%var hoy%'
    OR "${col}" ILIKE '%function reloj%'
    OR "${col}" ILIKE '%new Date(%'
    OR "${col}" ILIKE '%Iniciar sesi%'
    OR "${col}" ILIKE '%Buscar Ayuda%'
    OR "${col}" ILIKE '%<script%'
    OR "${col}" ILIKE '%<style%'
    OR "${col}" ILIKE '%window.location%'
    OR "${col}" ILIKE '%document.write%'
  )`;

const prisma = new PrismaClient();

/**
 * Per-source breakdown for the dry-run report. Returns rows like:
 *   [{ source: 'BOE_SUBASTAS', auctionType: 'judicial', n: 1234 }, ...]
 */
async function breakdown(col) {
  const sql = `
    SELECT
      COALESCE(source, '(null)') AS source,
      COALESCE("auctionType", '(null)') AS "auctionType",
      COUNT(*)::int AS n
    FROM "Auction"
    WHERE ${PAGE_DUMP_PREDICATE(col)}
    GROUP BY source, "auctionType"
    ORDER BY n DESC
  `;
  return prisma.$queryRawUnsafe(sql);
}

async function totalCount(col) {
  const sql = `SELECT COUNT(*)::int AS n FROM "Auction" WHERE ${PAGE_DUMP_PREDICATE(col)}`;
  const rows = await prisma.$queryRawUnsafe(sql);
  return rows[0]?.n ?? 0;
}

async function applyNull(col) {
  // Single-statement UPDATE — atomic; resumable in the sense that a
  // partial-failure leaves the predicate intact, so a re-run continues
  // from where it left off. No batching needed at the expected ~3.7k row
  // scale.
  const sql = `UPDATE "Auction" SET "${col}" = NULL WHERE ${PAGE_DUMP_PREDICATE(col)}`;
  const affected = await prisma.$executeRawUnsafe(sql);
  return affected;
}

function logHeader() {
  console.log('—'.repeat(72));
  console.log(`backfill-charges-leak.mjs — mode: ${DRY ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`started: ${new Date().toISOString()}`);
  console.log('—'.repeat(72));
}

async function main() {
  logHeader();

  const targets = ['chargesDetail', 'lotDescription'];

  for (const col of targets) {
    const n = await totalCount(col);
    console.log(`\n[${col}] page-dump matches: ${n} row(s)`);
    if (n === 0) continue;
    const rows = await breakdown(col);
    console.log(`[${col}] per-source breakdown:`);
    for (const r of rows) {
      console.log(`  ${r.source} / ${r.auctionType}: ${r.n}`);
    }
  }

  if (DRY) {
    console.log(
      '\nDRY-RUN complete. Re-run with --apply to set the matched fields to NULL.',
    );
    return;
  }

  console.log('\n— APPLYING UPDATE —');
  for (const col of targets) {
    const before = await totalCount(col);
    if (before === 0) {
      console.log(`[${col}] nothing to clean (predicate matches 0 rows).`);
      continue;
    }
    const affected = await applyNull(col);
    const after = await totalCount(col);
    console.log(`[${col}] UPDATE affected ${affected} row(s) — predicate count: ${before} → ${after}`);
    if (after !== 0) {
      console.warn(`[${col}] WARNING: post-apply predicate count is ${after}, expected 0.`);
    }
  }

  console.log('\nAPPLY complete.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('backfill-charges-leak.mjs FAILED:', err);
    try {
      await prisma.$disconnect();
    } catch {
      /* noop */
    }
    process.exit(1);
  });
