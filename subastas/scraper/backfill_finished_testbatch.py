#!/usr/bin/env python3
"""
Finished-auction FULL-RUN re-scrape — balanced sharding + 4 BOE tab-URL capture
— 2026-06-08 (Forge, Ken brief: finished full-run windowing).

PRODUCTION full-run tool for backfilling all 221,615 BOE finished auctions via
~28-30 parallel workers, each owning a BALANCED, EXHAUSTIVE, DISJOINT shard of
the finished pool. Evolved from the 400-row test-batch (which proved the
pipeline: 100% fetched-OK, 100% FULL tier, 11.89 s/card single-thread). The
per-row fetch->enrich->upsert machinery (BOEScraper._fetch_detail_info, the
updates dict, the idempotent UPDATE "Auction" SET ... WHERE "boeId"=%s with
per-row commit and reconnect-on-OperationalError retry, time.sleep(0.5)
politeness) is preserved VERBATIM. Two things change vs the test-batch:

  PART A — WINDOWING. The `ORDER BY random() LIMIT N` sampler is replaced by a
  balanced shard selector keyed on `--shard I --shards N` (worker I of N, I in
  0..N-1). Mechanism = NTILE(N) over the ORDERED cursor
  `ORDER BY "endsAt" NULLS LAST, "boeId"`, partitioned in a CTE; worker I claims
  bucket I+1. This is exhaustive + disjoint + balanced + deterministic by
  construction (see _select_shard). Cursor within a shard is ORDERED (NOT
  random) so a resumed worker re-selects the identical, identically-ordered set.
  Checkpoint is per-shard (/tmp/finished_shard_{I}_of_{N}.checkpoint.json).

  PART B — 4 BOE TAB-URL CAPTURE. 4 nullable columns on "Auction"
  (urlInformacionGeneral ver=1 / urlBienes ver=3 / urlLotes split-lote /
  urlPujas ver=5) are DERIVED from boe_id (no extra navigations, no re-scrape)
  by _derive_boe_tab_urls() and merged into the same `updates` dict, riding the
  same idempotent upsert. Honest-NULL: urlLotes is NULL on single-lot rows.
  urlPujas is ALWAYS written (ver=5 resolves even when bidding is empty).

The expensive classify/Report path (_classify_row, _count_docs_and_image,
Report — 2 extra DB round-trips per row) is GATED behind --report (default OFF).
At 221k x 30 workers that path is ~6.6M needless queries on a 100-connection PG,
so the production run skips it; cheap fetch-outcome counters + a periodic
progress log line are always kept for the monitor.

Finished pool = status in the finished set AND "boeId" IS NOT NULL AND the
legacy-row exclusion (database.legacy_rows.LEGACY_EXCLUSION_SQL). Finished status
labels are RESOLVED against the live enum at runtime (_resolve_finished_statuses)
so an unknown label can never crash the enum cast — a sibling once died on
`"AuctionStatus" = text`.

GEOCODING IS NOT DONE HERE. Info-fetch ONLY. No Google / paid geocoding. The
existing backfill_geocode_finished.py owns the geocode leg; it is NOT touched.

NO AI tokens in the runtime path (pure Python + Playwright + psycopg2).
Idempotent (honest-NULL preserved; real backfill UPDATEs) and per-shard
resumable.

Run inside the scheduler container (has playwright + DATABASE_URL), one worker:
  python3 -u backfill_finished_testbatch.py --shard 0 --shards 30 --source-filter BOE
  python3 -u backfill_finished_testbatch.py --shard 1 --shards 30 --source-filter BOE
  ... (worker I in 0..29)

  # dry run — print shard size + 10-row preview, write nothing:
  python3 -u backfill_finished_testbatch.py --dry-run --shard 0 --shards 30 --source-filter BOE

Flags:
  --shard I             which shard this worker owns (0..N-1). REQUIRED for a run.
  --shards N            total number of shards / parallel workers. REQUIRED.
  --source-filter SRC   BOE | SEGSOCIAL | PLABI (default: all sources)
  --dry-run             count + 10-row preview of THIS shard, write nothing
  --max-rows N          cap rows processed THIS invocation (bounded batches;
                        per-shard checkpoint resumes seamlessly)
  --report              opt-in: keep the per-row classify + recoverable-% Report
                        path (2 extra DB round-trips/row). DEFAULT OFF — the
                        production full run does ZERO classification queries.
"""

import os
import sys
import re
import json
import time
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

REPORT_DIR = "/data/dnksubastas-deploy/scheduler-logs"

# Canonical BOE detail base. Source of truth: BOEScraper.DETAIL_URL in
# app/scrapers/boe_scraper.py (line ~598). Hardcoded here (instead of importing
# the scraper at module load) so the pure URL-derivation helper has no Playwright
# import dependency and the dry-run path stays import-light. If BOE ever changes
# the host, update it in boe_scraper.py AND here.
DETAIL_URL = "https://subastas.boe.es/detalleSubasta.php"

# Mirror of boe_scraper._LOTE_COMPOSITE_RE (line 130). A composite split-lote
# boeId is "<idSub>-L<N>". Kept local so the URL-derivation helper and the
# dry-run path do NOT import the Playwright-heavy boe_scraper module. The real
# parse_lote_boe_id is preferred when the scraper is already imported (run loop)
# via _resolve_parse_lote_boe_id(); this local copy is the import-light fallback.
_LOTE_COMPOSITE_RE = re.compile(r'^(?P<idsub>.+)-L(?P<lote>\d+)$')


def _local_parse_lote_boe_id(boe_id):
    """Import-light copy of boe_scraper.parse_lote_boe_id — recover
    (idSub, lote_n:int) from a composite split-lote boeId, else None for a bare
    idSub. Byte-equivalent semantics to the canonical function (same regex)."""
    if not boe_id:
        return None
    m = _LOTE_COMPOSITE_RE.match(boe_id)
    if not m:
        return None
    return (m.group('idsub'), int(m.group('lote')))


# Resolved lazily to the canonical scraper function once the scraper is imported
# (run loop); falls back to the local copy for the dry-run / no-Playwright path.
parse_lote_boe_id = _local_parse_lote_boe_id


def _bind_canonical_parse_lote():
    """After the scraper is imported in the run loop, repoint parse_lote_boe_id
    at the canonical boe_scraper implementation so the two can never drift. No-op
    if the import is unavailable (keeps the local mirror)."""
    global parse_lote_boe_id
    try:
        from app.scrapers.boe_scraper import parse_lote_boe_id as canonical
        parse_lote_boe_id = canonical
    except Exception:
        pass  # keep the local mirror


def _shard_checkpoint_path(shard, shards):
    """Per-shard checkpoint path. A worker re-launched with the same
    --shard I --shards N resumes exactly where it left off. BACKFILL_CHECKPOINT
    env overrides (for manual relocation), else derive from shard/shards so 30
    parallel workers never collide on one file."""
    override = os.environ.get("BACKFILL_CHECKPOINT")
    if override:
        return override
    return f"/tmp/finished_shard_{shard}_of_{shards}.checkpoint.json"


def _derive_boe_tab_urls(boe_id):
    """Derive the 4 BOE per-tab source URLs from boe_id ALONE — pure function, no
    scraping, no navigation. Mirrors the canonical URL builders in
    boe_scraper.py (_detail_url / v1_url / puja_url / the split-lote ver=3 URL)
    so the two can never drift.

    parse_lote_boe_id(boe_id) -> (src, lote_n) for a composite split-lote row,
    else None for a bare single auction.

    Honest-NULL:
      * urlLotes  = the per-lote ver=3 page for split rows; NULL for single-lot
                    (a bare idSub auction has no separate Lotes tab).
      * urlPujas  = ALWAYS written (Ken's decision): the ver=5 URL resolves even
                    when bidding is empty (it shows "no bids") — a valid BOE
                    source page, so we do NOT gate it on whether bids exist.
      * urlInformacionGeneral / urlBienes = always present for a fetched-OK row.
    """
    parsed = parse_lote_boe_id(boe_id)
    if parsed:
        src, n = parsed
        return {
            '"urlInformacionGeneral"': f"{DETAIL_URL}?idSub={src}&ver=1",
            '"urlBienes"':             f"{DETAIL_URL}?idSub={src}&idLote={n}&ver=3",
            '"urlLotes"':              f"{DETAIL_URL}?idSub={src}&idLote={n}&ver=3",
            '"urlPujas"':              f"{DETAIL_URL}?idSub={src}&idLote={n}&ver=5",
        }
    return {
        '"urlInformacionGeneral"': f"{DETAIL_URL}?idSub={boe_id}&ver=1",
        '"urlBienes"':             f"{DETAIL_URL}?idSub={boe_id}&ver=3",
        '"urlLotes"':              None,   # single-lot -> no Lotes tab -> honest-NULL
        '"urlPujas"':              f"{DETAIL_URL}?idSub={boe_id}&ver=5",
    }


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


def _load_ckpt(path):
    try:
        with open(path) as f:
            return set(json.load(f).get("done", []))
    except Exception:
        return set()


def _save_ckpt(done, path):
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


def _select_shard(cur, where, params, shard, shards):
    """Return (boeId, source) rows for worker `shard` of `shards`, as an ORDERED,
    BALANCED, DISJOINT, EXHAUSTIVE slice of the finished pool.

    Mechanism — NTILE over the ordered cursor:

        WITH pool AS (
          SELECT "boeId", source,
                 ntile(N) OVER (ORDER BY "endsAt" NULLS LAST, "boeId") AS bucket
          FROM "Auction" WHERE <finished-pool predicate>
        )
        SELECT "boeId", source FROM pool
        WHERE bucket = shard + 1
        ORDER BY "endsAt" NULLS LAST, "boeId"

    Why this satisfies the contract by construction:
      * EXHAUSTIVE + DISJOINT: ntile(N) assigns EVERY row in the window exactly
        one bucket in 1..N. The union of buckets 1..N is the whole window with
        zero overlap. Worker I claims bucket I+1, so the 30 workers partition the
        221,615-row pool perfectly (SUM of the 30 counts == 221,615, no boeId in
        two shards). The window predicate is byte-identical across all workers
        (same `where`/`params`), so the partition is consistent run-to-run.
      * BALANCED: ntile makes buckets differ in size by AT MOST 1 row. With
        221,615 / 30, the first 221615 mod 30 = 5 buckets get 7,388 rows and the
        rest get 7,387 — a spread of one row, far inside "±a few %".
      * DETERMINISTIC: the ORDER BY ("endsAt" NULLS LAST, "boeId") is a TOTAL
        order ("boeId" is unique here — UNIQUE in schema + the boeId IS NOT NULL
        guard), so ntile is reproducible: same boeId -> same bucket every run. A
        resumed worker re-selects the identical, identically-ordered set.
      * The 4 endsAt-NULL rows sort to the very end (NULLS LAST) tie-broken by
        boeId, so they land in the LAST bucket(s) deterministically — never
        dropped, never duplicated.
      * ORDERED CURSOR WITHIN SHARD: the outer ORDER BY walks each worker along a
        contiguous date band (lighter on BOE caches, matches the "windowed"
        mental model). NOT random().

    Note: ntile() rescans/orders the whole finished window per worker. That is a
    single indexed sort over ~221k rows on a fast box (one-time per worker
    launch, sub-second to low-seconds), not per-row — acceptable for a launch
    that then runs for hours.
    """
    p = dict(params)
    p["nbuckets"] = shards
    p["bucket"] = shard + 1  # ntile is 1-based; --shard is 0-based
    cur.execute(
        f'''
        WITH pool AS (
          SELECT "boeId", source,
                 ntile(%(nbuckets)s) OVER (
                   ORDER BY "endsAt" NULLS LAST, "boeId"
                 ) AS bucket
          FROM "Auction"
          WHERE {where}
        )
        SELECT "boeId", source
        FROM pool
        WHERE bucket = %(bucket)s
        ORDER BY "endsAt" NULLS LAST, "boeId"
        ''',
        p,
    )
    return cur.fetchall()


def run(shard, shards, source_filter, dry_run, max_rows, do_report):
    ckpt_path = _shard_checkpoint_path(shard, shards)

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

    sharded = _select_shard(cur, where, params, shard, shards)
    expected = scope_total / shards if shards else 0
    logger.info(
        f"Shard {shard}/{shards}: {len(sharded):,} rows "
        f"(expected ~{expected:,.0f} = {scope_total:,}/{shards}; "
        f"ntile balances to +-1 row). checkpoint={ckpt_path}"
    )

    if dry_run:
        logger.info("--- DRY RUN: 10-row preview of THIS shard (no fetch, no writes) ---")
        for i, (boe_id, source) in enumerate(sharded[:10], 1):
            logger.info(f"  [dry] {i:>2}. boeId={boe_id}  source={source or 'UNKNOWN'}")
        logger.info(
            f"DRY RUN complete — shard {shard}/{shards} owns {len(sharded):,} rows; "
            "0 fetches, 0 writes."
        )
        cur.close()
        conn.close()
        return

    # --- Real run: per-shard cursor + verbatim per-row upsert machinery ---
    done = _load_ckpt(ckpt_path)
    if done:
        logger.info(f"  resuming shard {shard}/{shards}: "
                    f"{len(done):,} already done per checkpoint")
    queue = [(b, s) for (b, s) in sharded if b not in done]
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
    # Repoint parse_lote_boe_id at the canonical scraper impl now that it is
    # imported, so _derive_boe_tab_urls uses the source-of-truth parser (the
    # import-light local mirror was only for the dry-run / no-Playwright path).
    _bind_canonical_parse_lote()

    # The classify/Report path costs 2 extra DB round-trips per row — dead weight
    # at 221k x 30 workers. Only built when --report is passed (default OFF).
    report = Report() if do_report else None
    started = datetime.utcnow()
    touched = failed = 0
    # Cheap fetch-outcome counters — ALWAYS kept (the monitor reads these), even
    # without --report.
    fetched_ok = no_existe = transient_fail = 0

    for i, (boe_id, source) in enumerate(queue, 1):
        if report is not None:
            report.attempt(source)
        try:
            info = scraper._fetch_detail_info(boe_id)
        except Exception as e:
            # Distinguish "no existe"/purged from transient. The detail fetch
            # raising is treated as transient; an empty/None info is purged.
            failed += 1
            transient_fail += 1
            if report is not None:
                report.transient_fail += 1
            logger.warning(f"  fetch failed (transient) for {boe_id}: {e}")
            done.add(boe_id)
            continue

        if _is_no_existe(info):
            # Empty/purged sentinel — page did not render ("no existe" / purged
            # upstream). Counted distinctly from transient fetch failures.
            no_existe += 1
            if report is not None:
                report.no_existe += 1
            done.add(boe_id)
            continue

        fetched_ok += 1

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

        # PART B — the 4 BOE per-tab source URLs, DERIVED from boe_id (no extra
        # navigation, no re-scrape). Merge into the SAME updates dict so they
        # ride the same idempotent UPDATE. Honest-NULL: urlLotes is None on
        # single-lot rows and writes SQL NULL (not coerced to ''); urlPujas is
        # always written. The keys are already SQL-quoted ('"urlBienes"' etc.).
        updates.update(_derive_boe_tab_urls(boe_id))

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

        # CLASSIFY the row for the report — ONLY when --report (2 extra DB
        # round-trips/row; skipped on the production full run).
        if report is not None:
            fields, tier = _classify_row(cur, boe_id, updates)
            report.classify(source, fields, tier)

        done.add(boe_id)
        time.sleep(0.5)  # ~2/s per-worker politeness throttle (brief — KEEP)

        if i % 25 == 0:
            _save_ckpt(done, ckpt_path)
            logger.info(
                f"  shard {shard}/{shards} {i}/{len(queue)} touched={touched} "
                f"fetched-OK={fetched_ok} no-existe={no_existe} "
                f"transient={transient_fail}"
            )

    _save_ckpt(done, ckpt_path)
    ended = datetime.utcnow()
    cur.close()
    conn.close()

    wall = (ended - started).total_seconds()
    logger.info(
        f"DONE shard {shard}/{shards}: processed={len(queue):,} touched={touched} "
        f"fetched-OK={fetched_ok} no-existe={no_existe} transient={transient_fail} "
        f"elapsed={wall:.1f}s "
        f"({(len(queue)/wall) if wall > 0 else 0:.3f} rows/s)"
    )

    # --- Optional report: stdout + marker file (only with --report) ---
    if report is not None:
        body = report.render(scope_total, source_filter, started, ended)
        logger.info("\n" + body)

        ts = ended.strftime("%Y%m%dT%H%M%SZ")
        marker = os.path.join(
            REPORT_DIR, f"finished_shard_{shard}_of_{shards}_{ts}.report"
        )
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
        description="Finished-pool full-run re-scrape — balanced sharding + "
                    "4 BOE tab-URL capture."
    )
    ap.add_argument("--shard", type=int, required=True,
                    help="which shard this worker owns (0..N-1)")
    ap.add_argument("--shards", type=int, required=True,
                    help="total number of shards / parallel workers (N)")
    ap.add_argument("--source-filter", choices=VALID_SOURCES, default=None,
                    help="restrict to one source (BOE|SEGSOCIAL|PLABI); default all")
    ap.add_argument("--dry-run", action="store_true",
                    help="count + 10-row preview of this shard, write nothing")
    ap.add_argument("--max-rows", type=int, default=None,
                    help="cap rows processed this invocation (per-shard "
                         "checkpoint resumes)")
    ap.add_argument("--report", action="store_true",
                    help="opt-in: keep the per-row classify + recoverable-%% "
                         "Report path (2 extra DB round-trips/row). DEFAULT OFF "
                         "— the production full run does ZERO classify queries.")
    args = ap.parse_args()

    if args.shards < 1:
        ap.error("--shards must be >= 1")
    if not (0 <= args.shard < args.shards):
        ap.error(f"--shard must be in 0..{args.shards - 1} (got {args.shard})")

    if args.dry_run:
        logger.info("DRY RUN mode — no fetches, no writes will occur")
    logger.info(
        f"shard={args.shard}/{args.shards} "
        f"source-filter={args.source_filter or 'ALL'} "
        f"max-rows={args.max_rows} report={'ON' if args.report else 'OFF'}"
    )
    run(args.shard, args.shards, args.source_filter, args.dry_run,
        args.max_rows, args.report)


if __name__ == "__main__":
    main()
