"""
#14 multi-lot SPLIT backfill (Ken runs this AFTER migration slot #2 is applied
and BOTH images are rebuilt). One-shot.

What it does:
  1. Find existing umbrella Auction rows that are actually declared-split
     auctions (lotes sold separately) but were ingested pre-#14 as a SINGLE
     (usually blank-priced) row.
  2. For each, re-scrape via the live split path -> insert/upsert the N
     independent lote rows (boeId = "<idSub>-L<N>").
  3. Suppress the now-superseded umbrella row so the feed shows N rows, not N+1.

Detecting which existing rows are split: there is no stored trigger flag on old
rows, so we re-fetch each candidate's detail page and test the trigger string.
Candidate set = active rows whose boeId is a bare idSub (NOT already a "-L"
composite) and that still look like a single umbrella (no sourceIdSub). To keep
the re-fetch bounded, restrict to non-terminal statuses by default.

Umbrella suppression (§3.4): there is no dedicated "hidden" status in the
AuctionStatus enum and adding one is an app-route change out of #14's scraper
scope. So we suppress by setting the umbrella's status to CONCLUIDA_PORTAL
(terminal => drops out of the active feed) WITHOUT deleting the row (favorites /
history preserved). The row keeps its boeId; its lote children carry the real
listing. If a later wave adds a dedicated SPLIT/HIDDEN status, switch this line.

Usage:
  DATABASE_URL=postgres://... python -m scraper.backfill_split_lotes [--limit N] [--dry-run]
"""
import argparse
import logging
import os

from .scrapers.boe_scraper import BOEScraper, is_split_auction
from .database.adapter import get_database_adapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_split")


def candidate_umbrellas(adapter, limit):
    conn = adapter.connect()
    cur = conn.cursor()
    # Bare idSub rows (no "-L<n>" composite), not already split-tagged, in a
    # state worth re-checking. boeId LIKE 'SUB-%' and NOT LIKE '%-L%'.
    cur.execute(
        """
        SELECT "boeId", "auctionType", province, category, status, municipality
        FROM "Auction"
        WHERE "boeId" LIKE 'SUB-%'
          AND "boeId" NOT LIKE '%-L%'
          AND "sourceIdSub" IS NULL
          AND status IN ('CELEBRANDOSE','PROXIMA_APERTURA','SUSPENDIDA')
        ORDER BY "createdAt" DESC
        """ + (f" LIMIT {int(limit)}" if limit else "")
    )
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def suppress_umbrella(adapter, boe_id, dry_run):
    if dry_run:
        logger.info(f"[dry-run] would suppress umbrella {boe_id} -> CONCLUIDA_PORTAL")
        return
    conn = adapter.connect()
    cur = conn.cursor()
    cur.execute(
        'UPDATE "Auction" SET status = %s, "updatedAt" = NOW() WHERE "boeId" = %s',
        ('CONCLUIDA_PORTAL', boe_id),
    )
    conn.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max umbrellas to scan (0=all)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    os.environ.setdefault("BOE_SPLIT_LOTES", "1")

    adapter = get_database_adapter()
    scraper = BOEScraper()
    candidates = candidate_umbrellas(adapter, args.limit)
    logger.info(f"scanning {len(candidates)} candidate umbrella rows")

    split_count = 0
    lote_rows = 0
    for c in candidates:
        boe_id = c["boeId"]
        detail = scraper._fetch_detail_info(boe_id)
        trigger_text = " ".join(filter(None, [
            detail.get("general_info"), detail.get("bienes_info"), detail.get("warning"),
        ]))
        if not is_split_auction(trigger_text):
            continue
        umbrella = {
            "auction_type": c.get("auctionType"), "province": c.get("province"),
            "category": c.get("category"), "status": c.get("status"),
            "municipality": c.get("municipality"),
        }
        rows = scraper._maybe_split_into_lotes(boe_id, umbrella, detail)
        if not rows:
            continue
        logger.info(f"{boe_id}: SPLIT into {len(rows)} lotes")
        if not args.dry_run:
            scraper._upsert_split_lotes(rows)
        suppress_umbrella(adapter, boe_id, args.dry_run)
        split_count += 1
        lote_rows += len(rows)

    logger.info(
        f"DONE: {split_count} umbrellas split into {lote_rows} independent lote rows "
        f"({'DRY RUN — nothing written' if args.dry_run else 'written'})"
    )
    try:
        scraper.browser_manager.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()
