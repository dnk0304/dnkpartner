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

Batched drain (FIX 2): a single run only EXAMINES at most --max-rows candidates;
every examined boeId (qualifying or not) is recorded in a checkpoint and skipped
on the next run, so a driver loop of bounded batches drains the whole ~330-row
candidate set instead of re-hitting top-of-list. --dry-run never writes the
checkpoint. Checkpoint path overridable via BACKFILL_SPLIT_CHECKPOINT.

Usage (works both as a module and as a bare script inside the scheduler image):
  DATABASE_URL=postgres://... python -m app.backfill_split_lotes [--limit N] [--max-rows N] [--dry-run]
  DATABASE_URL=postgres://... python -u backfill_split_lotes.py     [--limit N] [--max-rows N] [--dry-run]
  # drain in batches of 50 until DONE reports 0 examined:
  while :; do python -u backfill_split_lotes.py --max-rows 50 || break; done
"""
import argparse
import json
import logging
import os
import sys

# Container import hygiene (see memory + sibling backfill_pujas_occupancy.py /
# backfill_active_full.py / scheduler.py): works both as
# `python -m app.backfill_split_lotes` from / AND as a bare standalone
# `python -u backfill_split_lotes.py` inside the scheduler container (cwd /app,
# '/' on path, package root `app`). The bare-standalone invocation has no parent
# package, so the relative import raises ImportError -> we fall back to the
# proven sys.path.insert(0,'/') + app.* absolute import that the daily scheduler
# path uses successfully.
try:
    from .scrapers.boe_scraper import BOEScraper, is_split_auction
    from .database.adapter import get_database_adapter
except ImportError:  # running as a top-level script inside the container
    sys.path.insert(0, '/')
    from app.scrapers.boe_scraper import BOEScraper, is_split_auction  # type: ignore
    from app.database.adapter import get_database_adapter  # type: ignore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_split")

# Checkpoint of EVERY candidate boeId already EXAMINED (qualifying or not), so
# successive bounded batches advance through the ~330-umbrella candidate set
# instead of repeatedly re-scanning top-of-list. See FIX 2 note in main().
# Env-overridable, mirroring backfill_active_full.py's BACKFILL_CHECKPOINT.
CHECKPOINT = os.environ.get(
    "BACKFILL_SPLIT_CHECKPOINT", "/tmp/backfill_split_lotes.checkpoint.json"
)


def _load_ckpt():
    try:
        with open(CHECKPOINT) as f:
            return set(json.load(f).get("done", []))
    except Exception:
        return set()


def _save_ckpt(done):
    try:
        with open(CHECKPOINT, "w") as f:
            json.dump({"done": sorted(done)}, f)
    except Exception as e:
        logger.warning(f"checkpoint save failed: {e}")


def candidate_umbrellas(adapter, limit, done):
    conn = adapter.connect()
    cur = conn.cursor()
    # Bare idSub rows (no "-L<n>" composite), not already split-tagged, in a
    # state worth re-checking. boeId LIKE 'SUB-%' and NOT LIKE '%-L%'.
    # Already-examined boeIds (per checkpoint) are excluded at the SQL level so
    # a fresh bounded batch picks up where the last left off — without this,
    # ORDER BY createdAt DESC + LIMIT always re-returns the same top rows and a
    # run that hits a run of non-qualifying candidates never reaches the tail.
    params = []
    done_clause = ""
    if done:
        done_clause = ' AND "boeId" <> ALL(%s)'
        params.append(list(done))
    cur.execute(
        """
        SELECT "boeId", "auctionType", province, category, status, municipality
        FROM "Auction"
        WHERE "boeId" LIKE 'SUB-%%'
          AND "boeId" NOT LIKE '%%-L%%'
          AND "sourceIdSub" IS NULL
          AND status IN ('CELEBRANDOSE','PROXIMA_APERTURA','SUSPENDIDA')
        """ + done_clause + """
        ORDER BY "createdAt" DESC
        """ + (f" LIMIT {int(limit)}" if limit else ""),
        params,
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
    ap.add_argument("--limit", type=int, default=0,
                    help="max umbrellas to FETCH from SQL (0=all); top-of-list")
    ap.add_argument("--max-rows", type=int, default=0,
                    help="max umbrellas to EXAMINE this batch (0=all). Bounds a "
                         "single run; the checkpoint lets a driver loop batches "
                         "until the whole candidate set drains.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    os.environ.setdefault("BOE_SPLIT_LOTES", "1")

    # FIX 2 (Ken-flagged): drain ALL ~330 candidate umbrellas across batched
    # runs instead of repeatedly hitting top-of-list. The checkpoint records
    # every boeId we EXAMINE (qualifying or not); candidate_umbrellas excludes
    # them, so each fresh batch advances. --dry-run does NOT persist to the
    # checkpoint (a dry run is a preview — it must not consume candidates).
    done = _load_ckpt()
    if done:
        logger.info(f"resuming: {len(done)} candidates already examined per checkpoint")

    adapter = get_database_adapter()
    scraper = BOEScraper()
    candidates = candidate_umbrellas(adapter, args.limit, done)
    if args.max_rows and len(candidates) > args.max_rows:
        candidates = candidates[: args.max_rows]
    logger.info(
        f"scanning {len(candidates)} candidate umbrella rows "
        f"(limit={args.limit or 'all'}, max_rows={args.max_rows or 'all'})"
    )

    split_count = 0
    lote_rows = 0
    examined = 0
    for c in candidates:
        boe_id = c["boeId"]
        examined += 1
        # Mark examined up-front so a candidate that errors or doesn't qualify is
        # still recorded — that is exactly what lets batched runs reach the tail.
        # Persisted only on a real (non-dry) run; see FIX 2 note above.
        if not args.dry_run:
            done.add(boe_id)
            _save_ckpt(done)
        detail = scraper._fetch_detail_info(boe_id)
        # Count-gated (2026-06-02, matches the live gate in
        # _maybe_split_into_lotes): split iff this auction exposes 2+ distinct
        # lotes. The declaration string is no longer the decider — it's just a
        # logged signal. _fetch_detail_info already populated detail['lote_numbers']
        # by reading the idLote tab bar.
        lote_numbers = detail.get("lote_numbers") or []
        trigger_text = " ".join(filter(None, [
            detail.get("general_info"), detail.get("bienes_info"), detail.get("warning"),
        ]))
        declared = is_split_auction(trigger_text)
        if len(lote_numbers) < 2:
            continue
        logger.info(
            f"{boe_id}: {len(lote_numbers)} lotes qualify for split "
            f"(declaration string {'present' if declared else 'ABSENT — count gate'})"
        )
        umbrella = {
            "auction_type": c.get("auctionType"), "province": c.get("province"),
            "category": c.get("category"), "status": c.get("status"),
            "municipality": c.get("municipality"),
        }
        rows = scraper._maybe_split_into_lotes(boe_id, umbrella, detail)
        if not rows:
            continue
        logger.info(f"{boe_id}: SPLIT into {len(rows)} lotes")
        # wave13-hotfix: suppress-after-success ordering.
        #
        # Old order (bug): we suppressed the umbrella to CONCLUIDA_PORTAL
        # UNCONDITIONALLY, then upserted the children. If ANY child failed (e.g.
        # the 32 `integer out of range` rows on SUB-RC-2026-0155000330073
        # before the BIGINT widen) the umbrella was already hidden — the
        # property vanished from the feed entirely. Ken had to manually
        # restore it to CELEBRANDOSE.
        #
        # New order: upsert ALL children first; only if every single one saved
        # do we suppress the umbrella. On any partial failure leave the umbrella
        # active (it stays in the feed as the umbrella row) and log it so it
        # can be retried after the underlying defect is fixed. Re-running this
        # backfill is idempotent (boeId upsert) so the 32 existing wave13 rows
        # re-upsert cleanly.
        expected = len(rows)
        if args.dry_run:
            logger.info(f"[dry-run] would upsert {expected} lotes for {boe_id} then suppress umbrella")
            saved = expected
        else:
            saved = scraper._upsert_split_lotes(rows)
        if saved < expected:
            logger.error(
                f"{boe_id}: only {saved}/{expected} lote children saved — "
                f"LEAVING umbrella active (not suppressing). Re-run after defect fix."
            )
            continue
        suppress_umbrella(adapter, boe_id, args.dry_run)
        split_count += 1
        lote_rows += saved

    logger.info(
        f"DONE: examined {examined} candidates -> {split_count} umbrellas split "
        f"into {lote_rows} independent lote rows "
        f"({'DRY RUN — nothing written, checkpoint untouched' if args.dry_run else 'written'})"
    )
    try:
        scraper.browser_manager.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()
