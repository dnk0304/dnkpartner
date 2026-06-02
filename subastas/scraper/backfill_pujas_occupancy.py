"""
#16 (pujas/bids) + #17 (occupancy) backfill — Ken runs this ONCE, AFTER the
20260602_add_pujas_occupancy migration is applied and the scheduler image is
rebuilt. Bounded, resumable, idempotent.

What it does:
  For each ACTIVE auction row, re-fetch its BOE detail page through the live
  scraper path (the SAME _navigate_and_extract that the daily update uses, which
  now also reads occupancy from ver=3 + pujas from the ver=5 tab) and upsert the
  3 new fields (pujaStatus, currentBidAmount, occupancy). All other fields are
  refreshed too (harmless — same upsert the scheduler runs), and endsAt keeps
  updating, which satisfies the brief's "keep updating the closing date".

Why bounded to active rows: ~234k historical rows are terminal (CONCLUIDA);
their puja/occupancy state is frozen and not buyer-relevant, and re-fetching all
of them would hammer BOE for no value. The active pool (~1.1-1.5k CELEBRANDOSE +
PROXIMA + SUSPENDIDA) is what the cards show. Terminal rows simply keep NULL
(card layer shows no badge for NULL — correct).

Split-lote rows ("-L<n>" composite boeId) are handled: the scraper rebuilds the
idSub+idLote ver=5 URL from the composite id, so each lote gets its own puja.

Resumability: rows already carrying a non-null occupancy OR pujaStatus are
skipped by default (--skip-done, on by default) so a re-run continues where an
interrupted run stopped. Use --all to force re-fetch every active row.

Politeness: a delay between rows (default 1.5s, --delay) on top of the scraper's
own per-fetch jitter. Circuit breaker: --max-errors consecutive failures aborts.

Usage:
  DATABASE_URL=postgres://... python -m app.backfill_pujas_occupancy \
      [--limit N] [--delay 1.5] [--all] [--dry-run] [--max-errors 10]
"""
import argparse
import logging
import os
import sys
import time

# Container import hygiene (see memory: sys.path.insert(0,'/') + app.* imports).
# Works both as `python -m app.backfill_pujas_occupancy` from / and locally.
try:
    from .scrapers.boe_scraper import BOEScraper, parse_lote_boe_id
    from .database.adapter import get_database_adapter
except ImportError:  # running as a top-level module inside the container
    sys.path.insert(0, '/')
    from app.scrapers.boe_scraper import BOEScraper, parse_lote_boe_id  # type: ignore
    from app.database.adapter import get_database_adapter  # type: ignore

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("backfill_pujas_occupancy")

ACTIVE_STATUSES = ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'SUSPENDIDA')


def candidate_rows(adapter, limit, skip_done):
    conn = adapter.connect()
    cur = conn.cursor()
    placeholders = ', '.join(['%s'] * len(ACTIVE_STATUSES))
    where = f'status IN ({placeholders})'
    params = list(ACTIVE_STATUSES)
    if skip_done:
        # Resume: skip rows that already have either field populated.
        where += ' AND "pujaStatus" IS NULL AND occupancy IS NULL'
    sql = (
        f'SELECT "boeId", "auctionType", province, category, status, '
        f'municipality, "publishedAt", "endsAt" '
        f'FROM "Auction" WHERE {where} ORDER BY "endsAt" ASC NULLS LAST'
    )
    if limit:
        sql += f' LIMIT {int(limit)}'
    cur.execute(sql, params)
    cols = [c[0] for c in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def build_record(row, info):
    """Map a re-fetched detail-info dict onto an upsert record, preserving the
    existing classification columns (province/category/type/status) and only
    layering the freshly-parsed fields."""
    boe_id = row['boeId']
    rec = {
        'boe_id': boe_id,
        'title': info.get('identificador') or boe_id,
        'category': row.get('category') or 'Otros',
        'province': row.get('province') or 'Unknown',
        'municipality': row.get('municipality'),
        'status': info.get('detail_status') or row.get('status') or 'CELEBRANDOSE',
        'auction_type': row.get('auctionType'),
        'source': 'BOE',
        'published_at': row.get('publishedAt'),
        # The 3 target fields (+ raw possession text):
        'puja_status': info.get('puja_status'),
        'current_bid_amount': info.get('current_bid_amount'),
        'occupancy': info.get('occupancy'),
        'possession_status': info.get('possession_status'),
        # Keep the closing date fresh (brief #16).
        'ends_at': info.get('ends_at') or row.get('endsAt'),
    }
    return rec


def lote_url_for(scraper, boe_id):
    """Build the correct ver=3 detail URL: composite '-L<n>' rows resolve to
    idSub + idLote; bare idSubs use the standard detail URL."""
    parsed = parse_lote_boe_id(boe_id)
    if parsed:
        idsub, lote = parsed
        return f"{scraper.DETAIL_URL}?idSub={idsub}&idLote={lote}&ver=3"
    return scraper._detail_url(boe_id)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='Max rows (0 = all active)')
    ap.add_argument('--delay', type=float, default=1.5, help='Seconds between rows')
    ap.add_argument('--all', action='store_true', help='Re-fetch even rows already populated')
    ap.add_argument('--dry-run', action='store_true', help='Parse but do not write')
    ap.add_argument('--max-errors', type=int, default=10, help='Consecutive-failure circuit breaker')
    args = ap.parse_args()

    if not os.environ.get('DATABASE_URL'):
        logger.error('DATABASE_URL is required (point at live Postgres).')
        sys.exit(2)

    adapter = get_database_adapter()
    rows = candidate_rows(adapter, args.limit, skip_done=not args.all)
    logger.info('Candidate active rows to backfill: %d (skip_done=%s)', len(rows), not args.all)

    scraper = BOEScraper()
    stats = {'fetched': 0, 'con_puja': 0, 'sin_puja': 0, 'puja_amt': 0,
             'ocupado': 0, 'no_ocupado': 0, 'no_consta': 0, 'written': 0, 'errors': 0}
    consecutive_errors = 0

    for i, row in enumerate(rows, 1):
        boe_id = row['boeId']
        try:
            url = lote_url_for(scraper, boe_id)
            info = scraper._navigate_and_extract(boe_id, url)
            stats['fetched'] += 1
            consecutive_errors = 0

            ps = info.get('puja_status')
            occ = info.get('occupancy')
            if ps == 'CON_PUJA':
                stats['con_puja'] += 1
            elif ps == 'SIN_PUJA':
                stats['sin_puja'] += 1
            if info.get('current_bid_amount') is not None:
                stats['puja_amt'] += 1
            if occ == 'OCUPADO':
                stats['ocupado'] += 1
            elif occ == 'NO_OCUPADO':
                stats['no_ocupado'] += 1
            elif occ == 'NO_CONSTA':
                stats['no_consta'] += 1

            logger.info('[%d/%d] %s puja=%s amount=%s occ=%s',
                        i, len(rows), boe_id, ps, info.get('current_bid_amount'), occ)

            if not args.dry_run:
                rec = build_record(row, info)
                adapter.upsert_auction(rec)
                stats['written'] += 1
        except Exception as e:
            stats['errors'] += 1
            consecutive_errors += 1
            logger.warning('[%d/%d] %s FAILED: %s', i, len(rows), boe_id, e)
            if consecutive_errors >= args.max_errors:
                logger.error('Circuit breaker: %d consecutive failures — aborting at row %d. '
                             'Re-run to resume (skip_done is on by default).',
                             consecutive_errors, i)
                break
        time.sleep(max(0.0, args.delay))

    logger.info('Backfill done. Stats: %s', stats)


if __name__ == '__main__':
    main()
