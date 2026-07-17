"""
Mechanism 3 — ONE-TIME HISTORICAL SALE-RESULT BACKFILL (bounded ~200k crawl).
Ghost, 2026-07-17. Ken deploys + gates the launch; do NOT run against prod
without Ken's green light.

WHY THIS EXISTS: today only ~3.6% of the 217k concluded BOE rows carry a usable
price. Mechanisms 1 (freeze-at-close) + 2 (daily re-scrape) only cover rows
concluding from now on. This one-time crawl reaches back over the full concluded
inventory and captures each auction's puja máxima (highest bid) / desierta from
the ver=5 page (the portal retains results indefinitely — verified 2021-2024).

The number is the highest BID ("puja máxima"), NOT a legally-confirmed
adjudication. saleResult ADJUDICADA = "had a winning bid". Never a sale price.

DESIGN
------
Fetch key (brief-locked): base id = split_part(boeId,'-L',1); the '-L<n>' suffix
  is the lote, lifted from the multi-lote table. sourceIdSub is NEVER used
  (null/unreliable on ~191k legacy rows).

Phasing (LOCKED, property-first / recent-first):
  Phase A: property rows (real-estate categories) only, saleResult IS NULL,
           concluded, ORDER BY endsAt DESC. Feeds the discount-vs-tasación
           analytics + the live benchmark first.
  Phase B: the remainder (vehicles/movables + older tail), same driver.
  Run A to completion (report counts) before B so Ken can gate.

Rate limit: ~1 req/s with jitter (pujas_fetcher sleeps 0.8-1.6s per GET). A
  ~200k crawl is multi-day; that's fine — it is unattended + resumable.

Checkpoint / resume: resultCheckedAt is the durable done-marker — a captured or
  attempted row is stamped, and the scope query excludes freshly-stamped rows, so
  a crash resumes without re-hammering. A JSON checkpoint records progress + the
  last cursor for observability. Re-run is idempotent.

DB writes: BATCHED (executemany every --batch-size rows, one commit per batch) so
  we never write one row per HTTP round-trip into prod.

Attempt-memory: undetermined pass (wiped/empty/network miss) bumps
  resultCheckAttempts + stamps resultCheckedAt; at N=--attempt-cap it sets
  saleResult=SIN_RESULTADO so the row stops being retried.

Usage:
  DATABASE_URL=postgres://... python -m app.backfill_sale_results \
      --phase A [--limit N] [--batch-size 50] [--attempt-cap 5] \
      [--recheck-after-hours 24] [--dry-run] [--max-errors 25]
"""
import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime

try:
    from .scrapers.pujas_fetcher import make_session, fetch_pujas_result
    from .database.legacy_rows import LEGACY_EXCLUSION_SQL
    from .config.categories import CATEGORIES
except ImportError:  # in-container top-level
    sys.path.insert(0, '/')
    from app.scrapers.pujas_fetcher import make_session, fetch_pujas_result  # type: ignore
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore
    from app.config.categories import CATEGORIES  # type: ignore

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("backfill_sale_results")

PROPERTY_CATEGORIES = tuple(CATEGORIES['real_estate']['subcategories'])
SALE_COLS = ('saleResult', 'soldPrice', 'soldDate', 'resultCheckedAt', 'resultCheckAttempts')


def _connect():
    import psycopg2
    url = os.environ['DATABASE_URL']
    return psycopg2.connect(url)


def _cols_present(cur) -> bool:
    cur.execute(
        "SELECT count(*) FROM information_schema.columns "
        "WHERE table_name='Auction' AND column_name = ANY(%s)",
        (list(SALE_COLS),),
    )
    return cur.fetchone()[0] == len(SALE_COLS)


def _scope_sql(phase: str, recheck_after_hours: int) -> str:
    if phase == 'A':
        cat_pred = 'category = ANY(%(cats)s)'
    elif phase == 'B':
        cat_pred = '(category IS NULL OR NOT (category = ANY(%(cats)s)))'
    else:  # all
        cat_pred = 'TRUE'
    return f"""
        SELECT "boeId", "endsAt", COALESCE("resultCheckAttempts", 0)
        FROM "Auction"
        WHERE status = 'CONCLUIDA_PORTAL'
          AND "endsAt" IS NOT NULL AND "endsAt" < NOW()
          AND "saleResult" IS NULL
          AND ("resultCheckedAt" IS NULL
               OR "resultCheckedAt" < NOW() - INTERVAL '{int(recheck_after_hours)} hours')
          AND {cat_pred}
          AND {LEGACY_EXCLUSION_SQL}
        ORDER BY "endsAt" DESC
        LIMIT %(limit)s
    """


def _plan_write(boe_id, ends_at, cur_attempts, res, attempt_cap, now):
    """Compute the 5-col UPDATE tuple + a status label for one row."""
    sale_result = res.sale_result if res else None
    cents = res.sold_price_cents if res else None
    if sale_result in ('ADJUDICADA', 'DESIERTA'):
        # a capture
        return (sale_result, cents, ends_at, now, 0, boe_id), (
            'adjudicada' if sale_result == 'ADJUDICADA' else 'desierta')
    # undetermined pass: attempt-memory drain
    new_attempts = (cur_attempts or 0) + 1
    if new_attempts >= attempt_cap:
        return ('SIN_RESULTADO', None, None, now, new_attempts, boe_id), 'exhausted'
    return (None, None, None, now, new_attempts, boe_id), 'attempt'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--phase', choices=['A', 'B', 'all'], default='A')
    ap.add_argument('--limit', type=int, default=0, help='Max rows this run (0 = all due)')
    ap.add_argument('--batch-size', type=int, default=50, help='Rows per DB commit')
    ap.add_argument('--attempt-cap', type=int, default=5)
    ap.add_argument('--recheck-after-hours', type=int, default=24,
                    help='Re-touch a stamped-but-uncaptured row only after this many hours')
    ap.add_argument('--max-errors', type=int, default=25, help='Consecutive-failure circuit breaker')
    ap.add_argument('--checkpoint', default='/tmp/backfill_sale_results.checkpoint.json')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    if not os.environ.get('DATABASE_URL'):
        logger.error('DATABASE_URL is required (point at live Postgres).')
        sys.exit(2)

    conn = _connect()
    cur = conn.cursor()
    if not _cols_present(cur):
        logger.error('Sale-result columns not present — Forge migration not applied yet. Aborting.')
        sys.exit(3)

    # Effective scope size — pull the batch of due rows.
    fetch_limit = args.limit if args.limit > 0 else 10_000_000
    cur.execute(_scope_sql(args.phase, args.recheck_after_hours),
                {'cats': list(PROPERTY_CATEGORIES), 'limit': fetch_limit})
    rows = cur.fetchall()
    logger.info('Phase %s: %d concluded rows due for sale-result capture (dry_run=%s)',
                args.phase, len(rows), args.dry_run)
    if not rows:
        return

    session = make_session()
    stats = {'adjudicada': 0, 'desierta': 0, 'attempt': 0, 'exhausted': 0,
             'errors': 0, 'written': 0}
    consecutive_errors = 0
    batch = []
    last_cursor = None

    UPDATE_SQL = (
        'UPDATE "Auction" SET "saleResult"=%s, "soldPrice"=%s, "soldDate"=%s, '
        '"resultCheckedAt"=%s, "resultCheckAttempts"=%s WHERE "boeId"=%s'
    )

    def flush():
        if not batch or args.dry_run:
            batch.clear()
            return
        wcur = conn.cursor()
        wcur.executemany(UPDATE_SQL, batch)
        conn.commit()
        wcur.close()
        stats['written'] += len(batch)
        batch.clear()

    def save_ckpt():
        try:
            with open(args.checkpoint, 'w') as fh:
                json.dump({'phase': args.phase, 'last_cursor': last_cursor,
                           'stats': stats, 'ts': datetime.utcnow().isoformat()}, fh)
        except Exception:
            pass

    total = len(rows)
    for i, (boe_id, ends_at, cur_attempts) in enumerate(rows, 1):
        now = datetime.utcnow()
        try:
            res = fetch_pujas_result(session, boe_id)
            if res is None:
                consecutive_errors += 1
            else:
                consecutive_errors = 0
            params, label = _plan_write(boe_id, ends_at, cur_attempts, res, args.attempt_cap, now)
            stats[label] = stats.get(label, 0) + 1
            batch.append(params)
            last_cursor = {'boeId': boe_id, 'endsAt': ends_at.isoformat() if ends_at else None}
        except Exception as e:
            stats['errors'] += 1
            consecutive_errors += 1
            logger.warning('[%d/%d] %s FAILED: %s', i, total, boe_id, e)

        if len(batch) >= args.batch_size:
            flush()
            save_ckpt()
            logger.info('[%d/%d] committed. stats=%s', i, total, stats)

        if consecutive_errors >= args.max_errors:
            logger.error('Circuit breaker: %d consecutive fetch failures — aborting at row %d. '
                         'Re-run to resume (resultCheckedAt done-marker skips captured rows).',
                         consecutive_errors, i)
            break

    flush()
    save_ckpt()
    logger.info('Phase %s backfill done. stats=%s', args.phase, stats)
    logger.info('  ADJUDICADA=%d DESIERTA=%d attempt(pending)=%d SIN_RESULTADO=%d errors=%d written=%d',
                stats['adjudicada'], stats['desierta'], stats['attempt'],
                stats['exhausted'], stats['errors'], stats['written'])


if __name__ == '__main__':
    main()
