#!/usr/bin/env python3
"""
Backfill the wave155 scope soft-hide flag on the live PostgreSQL Auction table.

WHAT IT DOES
------------
Sets ``inScope = false`` + ``scopeReason`` on the rows that must be hidden from
the catalog, per the wave155 scope rules (Dennis-approved 2026-07-28):

  scopeReason      selects
  ---------------  -----------------------------------------------------------
  'movable'        category ∈ movable-goods bucket (Joyas/Maquinaria/Arte/…)
  'rights'         category ∈ rights bucket (Derechos/Participaciones/…)
  'unclassified'   category is NULL or matches no known taxonomy label
  'empty-shell'    IN-scope category (property/land or vehicle) BUT no REAL
                   data — no description, no address, no genuine appraisal,
                   no documents (e.g. the €55 PLABI "ACTIVO FRISU" shell).
                   A dead source link ALONE is NOT a reason (this predicate
                   never looks at the link) — a real-data row with a dead link
                   (e.g. the suspended Las Palmas auction) stays inScope=true.

Everything else stays ``inScope = true`` — including the 1,176 property/vehicle
rows that the corrected 410 middleware fix un-retires (they have real data, so
they never match 'empty-shell'; this script does NOT touch them).

The bucket → category mapping and the data-quality predicate are the SAME logic
the ingestion choke-point uses (``scraper/config/scope.py`` /
``scraper/config/categories.py``) — imported here so the backfill can never
drift from live ingestion.

SAFETY
------
- DEFAULT is a DRY-RUN: prints the before/after counts and touches nothing.
  Pass ``--apply`` to write.
- REVERSIBLE: ``--revert`` sets ``inScope = true, scopeReason = NULL`` for every
  row this script manages (scopeReason IN the wave155 set). Zero data loss.
- IDEMPOTENT: re-running ``--apply`` converges to the same state (each UPDATE is
  predicate-scoped and only writes rows whose flag/reason differs).
- One transaction; rolls back on any error.

USAGE (Ken runs this on the box, inside the app/scraper container)
------------------------------------------------------------------
  python -m scraper.scripts.backfill_scope_flag              # dry-run report
  python -m scraper.scripts.backfill_scope_flag --apply      # write soft-hides
  python -m scraper.scripts.backfill_scope_flag --revert --apply   # undo all

Run the additive migration (20260728_add_auction_scope_flag) FIRST — this
script requires the inScope / scopeReason columns to exist.
"""

import argparse
import logging
import sys

try:
    import psycopg2
except ImportError:  # pragma: no cover
    psycopg2 = None

from scraper.config.settings import DATABASE_URL
from scraper.config.categories import CATEGORY_SCOPE_BUCKET

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('backfill_scope_flag')

# Managed reasons — the exhaustive set this script owns (used by --revert and by
# the idempotency guard so we never clobber a reason we don't manage).
MANAGED_REASONS = ('movable', 'rights', 'unclassified', 'empty-shell')

# Category → bucket, sourced from the single mapping used at ingestion.
_MOVABLE = sorted(c for c, b in CATEGORY_SCOPE_BUCKET.items() if b == 'movable')
_RIGHTS = sorted(c for c, b in CATEGORY_SCOPE_BUCKET.items() if b == 'rights')
_ALL_KNOWN = sorted(CATEGORY_SCOPE_BUCKET.keys())
_IN_SCOPE = sorted(
    c for c, b in CATEGORY_SCOPE_BUCKET.items() if b in ('property', 'vehicle')
)

# "No real data" — mirrors scope.has_real_data() (description OR address OR
# genuine appraisal OR ≥1 document). `a` is the Auction alias.
NO_REAL_DATA_SQL = """(
    COALESCE(TRIM(a."lotDescription"), '') = ''
    AND COALESCE(TRIM(a."propertyDescription"), '') = ''
    AND COALESCE(TRIM(a."address"), '') = ''
    AND COALESCE(a."appraisalValue", 0) <= 0
    AND NOT EXISTS (
        SELECT 1 FROM "AuctionDocument" d WHERE d."auctionId" = a.id
    )
)"""


def _in_list(cur, values):
    """Return an SQL placeholder tuple string for an IN (...) list."""
    return '(' + ', '.join(['%s'] * len(values)) + ')'


def _count(cur, where_sql, params):
    cur.execute(f'SELECT COUNT(*) FROM "Auction" a WHERE {where_sql}', params)
    return cur.fetchone()[0]


def report_counts(cur):
    """Log the current inScope distribution by reason."""
    cur.execute(
        'SELECT "scopeReason", COUNT(*) FROM "Auction" '
        'WHERE "inScope" = false GROUP BY "scopeReason" ORDER BY 2 DESC'
    )
    hidden = cur.fetchall()
    total_hidden = sum(n for _, n in hidden)
    cur.execute('SELECT COUNT(*) FROM "Auction" WHERE "inScope" = true')
    shown = cur.fetchone()[0]
    logger.info('  inScope=true  (shown):  %d', shown)
    logger.info('  inScope=false (hidden): %d', total_hidden)
    for reason, n in hidden:
        logger.info('      %-14s %d', reason, n)
    return shown, total_hidden


def do_revert(cur):
    cur.execute(
        f'UPDATE "Auction" SET "inScope" = true, "scopeReason" = NULL '
        f'WHERE "scopeReason" IN {_in_list(cur, MANAGED_REASONS)}',
        list(MANAGED_REASONS),
    )
    return cur.rowcount


def do_apply(cur):
    """Set inScope=false + reason for each hidden bucket. Idempotent — only
    writes rows whose (inScope, scopeReason) differ. Returns per-reason counts."""
    results = {}

    # 1) movable
    cur.execute(
        f'''UPDATE "Auction" a SET "inScope" = false, "scopeReason" = 'movable'
            WHERE a."category" IN {_in_list(cur, _MOVABLE)}
              AND ("inScope" IS DISTINCT FROM false OR "scopeReason" IS DISTINCT FROM 'movable')''',
        _MOVABLE,
    )
    results['movable'] = cur.rowcount

    # 2) rights
    cur.execute(
        f'''UPDATE "Auction" a SET "inScope" = false, "scopeReason" = 'rights'
            WHERE a."category" IN {_in_list(cur, _RIGHTS)}
              AND ("inScope" IS DISTINCT FROM false OR "scopeReason" IS DISTINCT FROM 'rights')''',
        _RIGHTS,
    )
    results['rights'] = cur.rowcount

    # 3) unclassified — NULL category or a label in no known bucket.
    cur.execute(
        f'''UPDATE "Auction" a SET "inScope" = false, "scopeReason" = 'unclassified'
            WHERE (a."category" IS NULL OR a."category" NOT IN {_in_list(cur, _ALL_KNOWN)})
              AND ("inScope" IS DISTINCT FROM false OR "scopeReason" IS DISTINCT FROM 'unclassified')''',
        _ALL_KNOWN,
    )
    results['unclassified'] = cur.rowcount

    # 4) empty-shell — in-scope category but no real data.
    cur.execute(
        f'''UPDATE "Auction" a SET "inScope" = false, "scopeReason" = 'empty-shell'
            WHERE a."category" IN {_in_list(cur, _IN_SCOPE)}
              AND {NO_REAL_DATA_SQL}
              AND ("inScope" IS DISTINCT FROM false OR "scopeReason" IS DISTINCT FROM 'empty-shell')''',
        _IN_SCOPE,
    )
    results['empty-shell'] = cur.rowcount

    return results


def main():
    ap = argparse.ArgumentParser(description='wave155 scope soft-hide backfill')
    ap.add_argument('--apply', action='store_true', help='write changes (default: dry-run)')
    ap.add_argument('--revert', action='store_true', help='undo: set inScope=true for managed rows')
    args = ap.parse_args()

    if psycopg2 is None:
        logger.error('psycopg2 not available — cannot run against PostgreSQL.')
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        cur = conn.cursor()

        # Guard: columns must exist (migration applied).
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'Auction' AND column_name IN ('inScope', 'scopeReason')"
        )
        have = {r[0] for r in cur.fetchall()}
        if not {'inScope', 'scopeReason'} <= have:
            logger.error(
                'Missing columns %s — apply migration 20260728_add_auction_scope_flag first.',
                {'inScope', 'scopeReason'} - have,
            )
            conn.rollback()
            sys.exit(2)

        logger.info('BEFORE:')
        report_counts(cur)

        if args.revert:
            n = do_revert(cur)
            logger.info('REVERT: %d rows reset to inScope=true, scopeReason=NULL', n)
        else:
            results = do_apply(cur)
            logger.info(
                'APPLY (rows changed this run): movable=%d rights=%d unclassified=%d empty-shell=%d',
                results['movable'], results['rights'],
                results['unclassified'], results['empty-shell'],
            )

        logger.info('AFTER (in-transaction, %s):', 'COMMITTED' if args.apply else 'ROLLED BACK — dry run')
        report_counts(cur)

        if args.apply:
            conn.commit()
            logger.info('COMMITTED.')
        else:
            conn.rollback()
            logger.info('DRY-RUN — nothing written. Re-run with --apply to persist.')
    except Exception:
        conn.rollback()
        logger.exception('Backfill failed — rolled back.')
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
