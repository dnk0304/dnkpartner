#!/usr/bin/env python3
"""
Finished-auction TEST-BATCH re-scrape + recoverable-% report — 2026-06-08 (Forge, Ken brief Phase 1)

Goal: re-scrape a RANDOM sample of FINISHED-pool auction ids through the EXACT
fetch->enrich pipeline that `backfill_active_full.py --rescrape` uses, then
report a HARD, per-field recoverable % BEFORE any multi-day full run. This is
the gating test batch Dennis approved: representative recoverable %, not
head-of-table.

This is the finished-pool sibling of backfill_active_full.rescrape(). The
per-row machinery (BOEScraper._fetch_detail_info, the updates dict, the
idempotent UPDATE "Auction" SET ... WHERE "boeId"=%s with per-row commit and
reconnect-on-OperationalError retry, the checkpoint) is replicated VERBATIM so
the two can never drift. The ONLY differences are:
  1. Row selection = the FINISHED pool (not the active pool).
  2. RANDOM sample (ORDER BY random() LIMIT N), optional --source-filter.
  3. Each fetched-OK row is CLASSIFIED for the report (the new part).

Finished pool = status in the finished set AND "boeId" IS NOT NULL AND the
legacy-row exclusion (database.legacy_rows.LEGACY_EXCLUSION_SQL), same guard the
active backfill uses. The finished status labels are RESOLVED against the live
enum at runtime (see _resolve_finished_statuses) so an unknown label can never
crash the enum cast — a sibling once died on `"AuctionStatus" = text`. CONCLUIDA
(the legacy ~234k bucket) is kept when present in the enum.

GEOCODING IS NOT DONE HERE. The free-geocode pass is a SEPARATE later step
(Dennis: "First is to fetch the info"). The FULL tier deliberately does NOT
require map coordinates — it is price + address + >=1 doc/photo. No Google /
paid geocoding in this script. The existing backfill_geocode_finished.py owns
the geocode leg; it is NOT touched here.

NO migration. NO AI tokens in the runtime path (pure Python + Playwright +
psycopg2). Idempotent (honest-NULL preserved; real backfill UPDATEs) and
resumable (checkpoint mirrors active_full at /tmp/*.checkpoint.json), so the
same file scales to the full run by raising --sample (or swapping the random
sample for an id-cursor over the full finished pool).

Run inside the scheduler container (has playwright + DATABASE_URL):
  # dry run — count + 10-row preview + report skeleton, writes nothing
  python3 -u backfill_finished_testbatch.py --dry-run --source-filter BOE
  # the approved 400-row BOE batch
  python3 -u backfill_finished_testbatch.py --sample 400 --source-filter BOE

Flags:
  --sample N            random sample size (default 400)
  --source-filter SRC   BOE | SEGSOCIAL | PLABI (default: all sources)
  --dry-run             count + 10-row preview + report skeleton, write nothing
  --max-rows N          cap rows processed THIS invocation (bounded batches;
                        checkpoint resumes seamlessly — mirrors active_full)
"""

import os
import sys
import json
import time
import random
import argparse
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
logger = logging.getLogger(__name__)

import psycopg2

# Legacy first-gen row exclusion (2026-06-02). Same single source of truth the
# active backfill imports — see database/legacy_rows.py.
try:
    from database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore
except ImportError:
    sys.path.insert(0, "/")
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL or DATABASE_URL.startswith("file:"):
    logger.error("DATABASE_URL must be a Postgres URL.")
    sys.exit(1)

# Finished pool definition (brief). These are CANDIDATE labels; the ones that
# actually exist in the live "AuctionStatus" enum are resolved at runtime so the
# enum cast can never throw on an unregistered label. CONCLUIDA is the legacy
# ~234k bucket — kept when present.
FINISHED_STATUS_CANDIDATES = (
    "CONCLUIDA",
    "CONCLUIDA_PORTAL",
    "CANCELADA",
    "FINALIZADA_AUTORIDAD",
    "FINISHED",
    "CANCELLED",
)

VALID_SOURCES = ("BOE", "SEGSOCIAL", "PLABI")

# Enrich-bearing keys whose presence proves the detail page actually rendered.
# BOEScraper._navigate_and_extract NEVER raises on a missing/purged page — it
# swallows the error and returns _empty_detail_info(boe_id), a dict where
# `general_info` is None and NONE of these keys are present/truthy (only
# detail_url is set). So "no existe"/purged is detected by: general_info falsy
# AND every enrich-bearing key falsy. A real fetched-OK page carries general_info
# and/or at least one of these.
_ENRICH_SIGNAL_KEYS = (
    "appraisal_value", "valor_subasta", "minimum_bid", "deposit_amount",
    "claimed_amount", "identificador", "ends_at", "detail_status",
    "bienes_info", "address",
)


def _is_no_existe(info):
    """True iff `info` is the empty/purged sentinel from _empty_detail_info:
    no general_info panel AND no enrich-bearing signal. The detail fetch swallows
    failures and returns this shape rather than raising, so a purged upstream row
    surfaces here, not in the except branch."""
    if not info:
        return True
    if info.get("general_info"):
        return False
    return not any(info.get(k) for k in _ENRICH_SIGNAL_KEYS)

CHECKPOINT = os.environ.get(
    "BACKFILL_CHECKPOINT", "/tmp/backfill_finished_testbatch.checkpoint.json"
)
REPORT_DIR = "/data/dnksubastas-deploy/scheduler-logs"


def _connect(retries: int = 30, delay: float = 5.0):
    """Connect with retry — verbatim from backfill_active_full. The box PG
    (max_connections=100) can momentarily hit 'too many clients already' under
    load; a long re-scrape must not die on a transient cap."""
    last = None
    for attempt in range(1, retries + 1):
        try:
            return psycopg2.connect(DATABASE_URL)
        except psycopg2.OperationalError as e:
            last = e
            logger.warning(f"  connect attempt {attempt}/{retries} failed: {e}")
            time.sleep(delay)
    raise last


def _resolve_finished_statuses(cur):
    """Return the subset of FINISHED_STATUS_CANDIDATES that actually exist as
    labels in the live "AuctionStatus" enum.

    Why: we bind the status list as `::"AuctionStatus"[]` (the canonical pattern
    in this repo — there is no text-vs-enum operator). Postgres casts every list
    element to the enum, which THROWS `invalid input value for enum` if any
    element is not a registered label. CONCLUIDA is asserted by the brief to be a
    live ~234k bucket but is NOT present in prisma/schema.prisma's enum, so we
    can't assume it. Resolving against pg_enum means: if CONCLUIDA is a real
    (DB-only) label it is included; if it isn't, it is dropped with a warning
    instead of crashing the run. The dry-run prints the resolved set so Ken sees
    ground truth before the real batch.
    """
    cur.execute(
        """
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'AuctionStatus'
        """
    )
    enum_labels = {r[0] for r in cur.fetchall()}
    present = [s for s in FINISHED_STATUS_CANDIDATES if s in enum_labels]
    missing = [s for s in FINISHED_STATUS_CANDIDATES if s not in enum_labels]
    if missing:
        logger.warning(
            "  finished-status labels NOT present in live enum (dropped from "
            f"scope, no crash): {missing}"
        )
    if not present:
        logger.error(
            "  NONE of the finished-status candidates exist in the live "
            '"AuctionStatus" enum — cannot scope the finished pool. Aborting.'
        )
        sys.exit(1)
    logger.info(f"  finished-status labels in scope: {present}")
    return present


def _build_where(finished_statuses, source_filter):
    """Build the finished-pool WHERE clause + bound params.

    status = ANY(%(statuses)s::"AuctionStatus"[])  — enum-cast lesson (a01890a):
    bind the list as "AuctionStatus"[] so = ANY resolves (no text-vs-enum
    operator). Source filter and legacy exclusion AND'd in. boeId NOT NULL.
    """
    where = (
        'status = ANY(%(statuses)s::"AuctionStatus"[]) '
        'AND "boeId" IS NOT NULL '
        f"AND {LEGACY_EXCLUSION_SQL}"
    )
    params = {"statuses": list(finished_statuses)}
    if source_filter:
        where += " AND source = %(source)s"
        params["source"] = source_filter
    return where, params


def _load_ckpt(path=CHECKPOINT):
    try:
        with open(path) as f:
            return set(json.load(f).get("done", []))
    except Exception:
        return set()


def _save_ckpt(done, path=CHECKPOINT):
    try:
        with open(path, "w") as f:
            json.dump({"done": sorted(done)}, f)
    except Exception as e:
        logger.warning(f"  checkpoint save failed: {e}")


# --------------------------------------------------------------------------- #
# Report accumulator
# --------------------------------------------------------------------------- #
class Report:
    """Per-field recoverable counts + tiering + per-source breakdown.

    Tiers (brief, geocode-free):
      FULL         = price + address + >=1 doc/photo
      PARTIAL      = some recoverable signal, not FULL
      UNRECOVERABLE = nothing recoverable (no price, no address, no doc/photo)
    "price" = appraisalValue OR valorSubasta present after enrich.
    """

    FIELDS = ("price", "province", "municipality", "address", "doc_or_photo", "endsAt")

    def __init__(self):
        self.attempted = 0
        self.fetched_ok = 0
        self.no_existe = 0          # "no existe" / purged upstream
        self.transient_fail = 0     # network / timeout / other transient
        self.field_recoverable = {f: 0 for f in self.FIELDS}
        self.tier = {"FULL": 0, "PARTIAL": 0, "UNRECOVERABLE": 0}
        # per-source: source -> {attempted, fetched_ok, full}
        self.by_source = {}

    def _src(self, source):
        s = source or "UNKNOWN"
        if s not in self.by_source:
            self.by_source[s] = {"attempted": 0, "fetched_ok": 0, "full": 0}
        return self.by_source[s]

    def attempt(self, source):
        self.attempted += 1
        self._src(source)["attempted"] += 1

    def classify(self, source, fields, tier):
        """fields: dict field->bool (recoverable). tier: FULL|PARTIAL|UNRECOVERABLE."""
        self.fetched_ok += 1
        self._src(source)["fetched_ok"] += 1
        for f in self.FIELDS:
            if fields.get(f):
                self.field_recoverable[f] += 1
        self.tier[tier] += 1
        if tier == "FULL":
            self._src(source)["full"] += 1

    def render(self, sample_scope_total, source_filter, started, ended):
        wall = (ended - started).total_seconds() if started and ended else 0.0
        rps = (self.attempted / wall) if wall > 0 else 0.0
        # Full-run extrapolation band (brief: ~190-210k).
        def extrap(n):
            return (n / rps / 3600.0) if rps > 0 else 0.0
        ok = self.fetched_ok or 1  # avoid /0 in percentages
        lines = []
        lines.append("=" * 70)
        lines.append("FINISHED TEST-BATCH RESCRAPE REPORT")
        lines.append("=" * 70)
        lines.append(f"source-filter        : {source_filter or 'ALL'}")
        lines.append(f"finished pool in scope (total, this filter): {sample_scope_total:,}")
        lines.append("")
        lines.append("--- Fetch outcome ---")
        lines.append(f"  attempted          : {self.attempted:,}")
        lines.append(f"  fetched-OK         : {self.fetched_ok:,}")
        lines.append(f'  "no existe"/purged : {self.no_existe:,}')
        lines.append(f"  transient-fail     : {self.transient_fail:,}")
        lines.append("")
        lines.append("--- Per-field recoverable (of fetched-OK) ---")
        for f in self.FIELDS:
            c = self.field_recoverable[f]
            lines.append(f"  {f:<14} : {c:,} / {self.fetched_ok:,}  ({100.0*c/ok:.1f}%)")
        lines.append("    (price = appraisalValue OR valorSubasta; "
                     "doc_or_photo = AuctionDocument rows OR imageUrl)")
        lines.append("")
        lines.append("--- Tier (of fetched-OK) ---")
        for t in ("FULL", "PARTIAL", "UNRECOVERABLE"):
            c = self.tier[t]
            lines.append(f"  {t:<14} : {c:,}  ({100.0*c/ok:.1f}%)")
        lines.append("    (FULL = price + address + >=1 doc/photo; coords NOT required)")
        lines.append("")
        lines.append("--- By source (fetched-OK rate + FULL rate) ---")
        for s in sorted(self.by_source):
            d = self.by_source[s]
            a = d["attempted"] or 1
            fok = d["fetched_ok"] or 1
            lines.append(
                f"  {s:<10} attempted={d['attempted']:,} "
                f"fetched-OK={d['fetched_ok']:,} ({100.0*d['fetched_ok']/a:.1f}%) "
                f"FULL={d['full']:,} ({100.0*d['full']/fok:.1f}% of fetched-OK)"
            )
        lines.append("")
        lines.append("--- Wall clock / throughput ---")
        lines.append(f"  start              : {started.isoformat() if started else 'n/a'}")
        lines.append(f"  end                : {ended.isoformat() if ended else 'n/a'}")
        lines.append(f"  elapsed            : {wall:.1f}s")
        lines.append(f"  rows/sec           : {rps:.3f}")
        lines.append(f"  full-run extrapolation (rows/sec held):")
        lines.append(f"    190,000 rows     : {extrap(190000):.1f}h")
        lines.append(f"    200,000 rows     : {extrap(200000):.1f}h")
        lines.append(f"    210,000 rows     : {extrap(210000):.1f}h")
        lines.append("=" * 70)
        return "\n".join(lines)


def _count_docs_and_image(cur, boe_id):
    """Recoverable media for the row: AuctionDocument rows (joined on auctionId
    -> Auction.id) OR a non-empty imageUrl. Measured from current DB state (the
    document-archive path is a SEPARATE leg, not in scope here), so this reports
    media RECOVERABILITY for the row as it stands."""
    cur.execute(
        '''
        SELECT
          (SELECT COUNT(*) FROM "AuctionDocument" d WHERE d."auctionId" = a.id),
          (a."imageUrl" IS NOT NULL AND length(trim(a."imageUrl")) > 0)
        FROM "Auction" a
        WHERE a."boeId" = %s
        ''',
        (boe_id,),
    )
    row = cur.fetchone()
    if not row:
        return 0, False
    return (row[0] or 0), bool(row[1])


def _classify_row(cur, boe_id, updates):
    """Given the enrich updates dict + current DB state, return
    (fields: dict, tier: str) for the report.

    price        = appraisalValue OR valorSubasta present after enrich
    province     = "Auction".province present (set by upstream parse; we read DB)
    municipality = "Auction".municipality present
    address      = address in updates OR already present on the row
    doc_or_photo = >=1 AuctionDocument OR imageUrl present
    endsAt       = endsAt in updates OR already present on the row
    """
    has_price = ('"appraisalValue"' in updates) or ('"valorSubasta"' in updates)
    has_addr_update = "address" in updates
    has_endsat_update = '"endsAt"' in updates

    cur.execute(
        '''
        SELECT
          (province IS NOT NULL AND length(trim(province)) > 0),
          (municipality IS NOT NULL AND length(trim(municipality)) > 0),
          (address IS NOT NULL AND length(trim(address)) > 0),
          ("endsAt" IS NOT NULL),
          ("appraisalValue" IS NOT NULL OR "valorSubasta" IS NOT NULL)
        FROM "Auction"
        WHERE "boeId" = %s
        ''',
        (boe_id,),
    )
    r = cur.fetchone() or (False, False, False, False, False)
    db_prov, db_muni, db_addr, db_endsat, db_price = (bool(x) for x in r)

    doc_count, has_image = _count_docs_and_image(cur, boe_id)
    has_doc_or_photo = (doc_count > 0) or has_image

    fields = {
        "price": has_price or db_price,
        "province": db_prov,
        "municipality": db_muni,
        "address": has_addr_update or db_addr,
        "doc_or_photo": has_doc_or_photo,
        "endsAt": has_endsat_update or db_endsat,
    }

    if fields["price"] and fields["address"] and fields["doc_or_photo"]:
        tier = "FULL"
    elif any(fields.values()):
        tier = "PARTIAL"
    else:
        tier = "UNRECOVERABLE"
    return fields, tier


def _select_sample(cur, where, params, sample_n):
    """RANDOM sample of (boeId, source) from the finished pool. ORDER BY random()
    LIMIT N — fine at N<=500 (brief). Random draw is load-bearing: a
    representative recoverable %, not head-of-table."""
    p = dict(params)
    p["lim"] = sample_n
    cur.execute(
        f'''
        SELECT "boeId", source FROM "Auction"
        WHERE {where}
        ORDER BY random()
        LIMIT %(lim)s
        ''',
        p,
    )
    return cur.fetchall()


def run(sample_n, source_filter, dry_run, max_rows):
    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("SELECT current_database()")
        logger.info(f"Connected to DB '{cur.fetchone()[0]}'")
    except Exception:
        logger.info("Connected (db introspection unavailable)")

    finished_statuses = _resolve_finished_statuses(cur)
    where, params = _build_where(finished_statuses, source_filter)

    # Total finished pool in scope (this filter) — sanity vs ~221k (brief).
    cur.execute(f'SELECT COUNT(*) FROM "Auction" WHERE {where}', params)
    scope_total = cur.fetchone()[0]
    logger.info(
        f"Finished pool in scope (source={source_filter or 'ALL'}): {scope_total:,}"
    )

    sampled = _select_sample(cur, where, params, sample_n)
    logger.info(f"Random sample drawn: {len(sampled):,} rows (requested {sample_n})")

    if dry_run:
        logger.info("--- DRY RUN: 10-row preview (no fetch, no writes) ---")
        for i, (boe_id, source) in enumerate(sampled[:10], 1):
            logger.info(f"  [dry] {i:>2}. boeId={boe_id}  source={source or 'UNKNOWN'}")
        logger.info("--- DRY RUN: report skeleton ---")
        skel = Report()
        for _boe_id, source in sampled:
            skel.attempt(source)
        logger.info(
            "\n" + skel.render(scope_total, source_filter, None, None)
        )
        logger.info("DRY RUN complete — 0 fetches, 0 writes.")
        cur.close()
        conn.close()
        return

    # --- Real run: replicate backfill_active_full.rescrape() per-row machinery ---
    done = _load_ckpt()
    if done:
        logger.info(f"  resuming: {len(done):,} already done per checkpoint")
    queue = [(b, s) for (b, s) in sampled if b not in done]
    if max_rows is not None:
        queue = queue[:max_rows]
    logger.info(f"  {len(queue):,} rows to process this run (cap={max_rows})")
    if not queue:
        logger.info("  QUEUE_EMPTY")
        cur.close()
        conn.close()
        return

    # valorSubasta is an additive column (migration 20260605). Probe so an
    # out-of-order run is a safe no-op rather than a write failure. Verbatim from
    # active_full.
    try:
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Auction' AND column_name = 'valorSubasta'
            """
        )
        has_valor_subasta = cur.fetchone() is not None
    except Exception:
        has_valor_subasta = False

    os.environ.setdefault("BOE_FETCH_DETAIL", "1")
    sys.path.insert(0, "/")
    from app.scrapers.boe_scraper import BOEScraper, extract_address
    scraper = BOEScraper()

    report = Report()
    started = datetime.utcnow()
    touched = failed = 0

    for i, (boe_id, source) in enumerate(queue, 1):
        report.attempt(source)
        try:
            info = scraper._fetch_detail_info(boe_id)
        except Exception as e:
            # Distinguish "no existe"/purged from transient. The detail fetch
            # raising is treated as transient; an empty/None info is purged.
            failed += 1
            report.transient_fail += 1
            logger.warning(f"  fetch failed (transient) for {boe_id}: {e}")
            done.add(boe_id)
            continue

        if _is_no_existe(info):
            # Empty/purged sentinel — page did not render ("no existe" / purged
            # upstream). Counted distinctly from transient fetch failures.
            report.no_existe += 1
            done.add(boe_id)
            continue

        # Build the SAME updates dict as backfill_active_full.rescrape().
        updates = {}
        appr = info.get("appraisal_value")
        valor = info.get("valor_subasta")
        if appr is not None and appr != 0:
            updates['"appraisalValue"'] = appr
        if has_valor_subasta and valor is not None and valor != 0:
            updates['"valorSubasta"'] = valor
        if info.get("minimum_bid") is not None:
            updates['"minimumBid"'] = info["minimum_bid"]
        if info.get("deposit_amount") is not None:
            updates['"depositAmount"'] = info["deposit_amount"]
        if info.get("claimed_amount") is not None:
            updates['"claimedAmount"'] = info["claimed_amount"]
        if info.get("identificador"):
            updates['title'] = info["identificador"]
        addr = info.get('address') or extract_address(info.get('bienes_info'))
        if addr:
            updates['address'] = addr
        if info.get("ends_at") is not None:
            updates['"endsAt"'] = info["ends_at"]
        if info.get("detail_url"):
            updates['"boeLink"'] = info["detail_url"]
        new_status = info.get("detail_status")
        if new_status:
            updates['status'] = new_status

        # WRITE the upsert — same UPDATE "Auction" SET ... WHERE "boeId"=%s,
        # per-row commit, reconnect-on-OperationalError retry verbatim.
        if updates:
            set_clause = ", ".join(f"{k} = %s" for k in updates) + ', "updatedAt" = NOW()'
            try:
                cur.execute(
                    f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s',
                    tuple(list(updates.values()) + [boe_id]),
                )
                conn.commit()
            except psycopg2.OperationalError:
                logger.warning("  DB connection lost; reconnecting...")
                conn = _connect()
                cur = conn.cursor()
                cur.execute(
                    f'UPDATE "Auction" SET {set_clause} WHERE "boeId" = %s',
                    tuple(list(updates.values()) + [boe_id]),
                )
                conn.commit()
            touched += 1

        # CLASSIFY the row for the report (reads post-write DB state).
        fields, tier = _classify_row(cur, boe_id, updates)
        report.classify(source, fields, tier)

        done.add(boe_id)
        time.sleep(0.5)  # ~2/s — measures real throttled speed (brief)

        if i % 25 == 0:
            _save_ckpt(done)
            logger.info(
                f"  {i}/{len(queue)} touched={touched} "
                f"fetched-OK={report.fetched_ok} "
                f"no-existe={report.no_existe} transient={report.transient_fail}"
            )

    _save_ckpt(done)
    ended = datetime.utcnow()
    cur.close()
    conn.close()

    # --- Emit the report: stdout + marker file ---
    body = report.render(scope_total, source_filter, started, ended)
    logger.info("\n" + body)

    ts = ended.strftime("%Y%m%dT%H%M%SZ")
    marker = os.path.join(REPORT_DIR, f"finished_testbatch_{ts}.report")
    try:
        os.makedirs(REPORT_DIR, exist_ok=True)
        with open(marker, "w") as f:
            f.write(body + "\n")
        logger.info(f"Report marker written: {marker}")
    except OSError as e:
        logger.warning(f"Could not write report marker ({e}) — non-fatal; "
                       "the report is printed above.")


def main():
    ap = argparse.ArgumentParser(
        description="Finished-pool test-batch re-scrape + recoverable-% report."
    )
    ap.add_argument("--sample", type=int, default=400,
                    help="random sample size (default 400)")
    ap.add_argument("--source-filter", choices=VALID_SOURCES, default=None,
                    help="restrict to one source (BOE|SEGSOCIAL|PLABI); default all")
    ap.add_argument("--dry-run", action="store_true",
                    help="count + 10-row preview + report skeleton, write nothing")
    ap.add_argument("--max-rows", type=int, default=None,
                    help="cap rows processed this invocation (checkpoint resumes)")
    args = ap.parse_args()

    if args.dry_run:
        logger.info("DRY RUN mode — no fetches, no writes will occur")
    logger.info(
        f"sample={args.sample} source-filter={args.source_filter or 'ALL'} "
        f"max-rows={args.max_rows}"
    )
    run(args.sample, args.source_filter, args.dry_run, args.max_rows)


if __name__ == "__main__":
    main()
