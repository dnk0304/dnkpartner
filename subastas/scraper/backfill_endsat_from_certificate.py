#!/usr/bin/env python3
"""Backfill NULL ``Auction.endsAt`` from the BOE closure-certificate PDF.

WHY
---
BOE removes "Fecha de conclusión" from the detail page of a cancelled auction,
so those rows have no end date to parse. The old scraper filled the hole with
``now() + 7 days``; that fabrication was removed and 17,829 rows were reset to
an honest NULL on 2026-08-04. The real end instant is published in the closure
certificate (``verCertificadoCierre.php``), which this script reads.

DESIGN
------
* Two phases. ``fetch`` only reads BOE and writes a local JSONL; ``apply``
  only reads that JSONL and writes the DB. Nothing is written to the DB on the
  network path, so a flaky run can never corrupt a row.
* Fill-NULL-only. Every UPDATE carries ``AND "endsAt" IS NULL``: this pass can
  add a date, never change or erase one.
* Never synthesise. A row with no certificate, no terminal event, or a value
  that fails validation is recorded as ``skipped`` and stays NULL.
* Snapshot table written before apply -> rollback is a single UPDATE.
* Resumable: the JSONL is the checkpoint; a re-run skips ids already in it.

VALIDATION GATES (a candidate failing any gate is skipped, not written)
  G1  2015-01-01 <= ends_at <= now()          (portal start; no future dates)
  G2  year(ends_at) >= year encoded in boeId  (an auction cannot end before it
                                               was published)
  G3  ends_at > opensAt when opensAt is known

USAGE
  python3 -u backfill_endsat_from_certificate.py fetch [--limit N] [--workers 3]
  python3 -u backfill_endsat_from_certificate.py apply --dry-run
  python3 -u backfill_endsat_from_certificate.py apply
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import random
import re
import sys
import threading
import time
from datetime import datetime
from typing import Optional

import psycopg2
import psycopg2.extras
import requests

# Import the certificate reader directly by path: `scrapers/__init__.py` pulls
# in the whole scraper package (playwright et al.) and only resolves when this
# file runs as part of the `app` package inside the container. The reader is a
# leaf module with no intra-package imports, so load it standalone.
sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapers")
)
from closure_certificate import fetch_closure_event  # type: ignore # noqa: E402

OUT_PATH = os.environ.get(
    "ENDSAT_CERT_JSONL", "/tmp/endsat_certificate_results.jsonl"
)
SNAPSHOT_TABLE = "ghost_endsat_cert_snapshot_20260813"

# Adaptive politeness: proven-safe envelope from the 2026-08-04 full refetch.
BASE_DELAY = (1.2, 2.8)
BREAKER_LIMIT = 15

POOL_SQL = """
    SELECT id, "boeId", status, "opensAt"
    FROM "Auction"
    WHERE "endsAt" IS NULL
      AND source = 'BOE'
      AND "boeId" LIKE 'SUB-%%'
    ORDER BY id
"""

_BOEID_YEAR = re.compile(r"^SUB-[A-Z]{2}-(\d{4})-")


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set")
    return psycopg2.connect(url)


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #
def validate(ends_at: datetime, boe_id: str, opens_at) -> Optional[str]:
    """Return a rejection reason, or None when the value is acceptable."""
    now = datetime.now()
    if not (datetime(2015, 1, 1) <= ends_at <= now):
        return "G1_out_of_range"
    m = _BOEID_YEAR.match(boe_id)
    if m and ends_at.year < int(m.group(1)):
        return "G2_before_boeid_year"
    if opens_at is not None and ends_at <= opens_at:
        return "G3_not_after_opensAt"
    return None


# --------------------------------------------------------------------------- #
# fetch phase
# --------------------------------------------------------------------------- #
def load_done() -> set:
    done = set()
    if os.path.exists(OUT_PATH):
        with open(OUT_PATH, encoding="utf-8") as fh:
            for line in fh:
                try:
                    done.add(json.loads(line)["boeId"])
                except Exception:
                    continue
    return done


def phase_fetch(limit: Optional[int], workers: int) -> None:
    conn = connect()
    with conn.cursor() as cur:
        cur.execute(POOL_SQL)
        rows = cur.fetchall()
    conn.close()

    done = load_done()
    pool = [r for r in rows if r[1] not in done]
    if limit:
        pool = pool[:limit]
    print(f"pool={len(rows)} already_done={len(done)} to_fetch={len(pool)}", flush=True)

    work: "queue.Queue" = queue.Queue()
    for r in pool:
        work.put(r)

    lock = threading.Lock()
    out = open(OUT_PATH, "a", encoding="utf-8")
    stats = {"hit": 0, "no_cert": 0, "rejected": 0, "error": 0}
    consecutive_errors = {"n": 0}
    stop = threading.Event()

    def worker() -> None:
        sess = requests.Session()
        while not stop.is_set():
            try:
                auction_id, boe_id, status, opens_at = work.get_nowait()
            except queue.Empty:
                return
            rec = {"id": auction_id, "boeId": boe_id, "status": status}
            try:
                event = fetch_closure_event(boe_id, session=sess)
                with lock:
                    consecutive_errors["n"] = 0
            except Exception as exc:
                with lock:
                    stats["error"] += 1
                    consecutive_errors["n"] += 1
                    if consecutive_errors["n"] >= BREAKER_LIMIT:
                        print("CIRCUIT BREAKER: 15 consecutive failures", flush=True)
                        stop.set()
                # transport failure: do NOT record a decision, retry next run
                print(f"ERR {boe_id}: {exc}", flush=True)
                time.sleep(random.uniform(4, 9))
                continue

            if event is None:
                rec.update(endsAt=None, skipped="no_certificate")
                with lock:
                    stats["no_cert"] += 1
            else:
                reason = validate(event.ends_at, boe_id, opens_at)
                if reason:
                    rec.update(endsAt=None, skipped=reason,
                               raw=event.ends_at.isoformat())
                    with lock:
                        stats["rejected"] += 1
                else:
                    rec.update(endsAt=event.ends_at.isoformat(),
                               kind=event.kind, label=event.label)
                    with lock:
                        stats["hit"] += 1
            with lock:
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                out.flush()
                total = sum(stats.values())
                if total % 250 == 0:
                    print(f"  {total} processed {stats}", flush=True)
            time.sleep(random.uniform(*BASE_DELAY))

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    out.close()
    print(f"FINISHED {stats}", flush=True)


# --------------------------------------------------------------------------- #
# apply phase
# --------------------------------------------------------------------------- #
def phase_apply(dry_run: bool) -> None:
    if not os.path.exists(OUT_PATH):
        sys.exit(f"no results file at {OUT_PATH} — run the fetch phase first")
    updates = []
    with open(OUT_PATH, encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            if rec.get("endsAt"):
                updates.append((rec["id"], rec["boeId"],
                                datetime.fromisoformat(rec["endsAt"]),
                                rec.get("kind"), rec.get("label")))
    print(f"candidate updates: {len(updates)}", flush=True)

    conn = connect()
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute('SELECT count(*) FROM "Auction" WHERE "endsAt" IS NULL')
        before = cur.fetchone()[0]
        print(f'NULL endsAt BEFORE: {before}', flush=True)

        if dry_run:
            ids = [u[0] for u in updates]
            cur.execute(
                'SELECT count(*) FROM "Auction" WHERE id = ANY(%s) AND "endsAt" IS NULL',
                (ids,),
            )
            print(f"would update (still NULL): {cur.fetchone()[0]}", flush=True)
            conn.rollback()
            conn.close()
            return

        cur.execute(
            f'''CREATE TABLE IF NOT EXISTS {SNAPSHOT_TABLE} (
                    id text PRIMARY KEY,
                    "boeId" text,
                    old_endsat timestamp,
                    new_endsat timestamp,
                    kind text,
                    label text,
                    applied_at timestamptz DEFAULT now()
                )'''
        )
        written = 0
        for auction_id, boe_id, ends_at, kind, label in updates:
            cur.execute(
                # updatedAt is deliberately NOT bumped: this is a repair of our
                # own hole, not a lifecycle event. The PA-withdrawal sweep keys
                # off `updatedAt < now() - 36h`, so bumping it would silently
                # postpone that sweep. No outbox event either, for the same
                # reason (2026-08-04 precedent).
                '''UPDATE "Auction" SET "endsAt" = %s
                   WHERE id = %s AND "endsAt" IS NULL''',
                (ends_at, auction_id),
            )
            if cur.rowcount == 1:
                cur.execute(
                    f'''INSERT INTO {SNAPSHOT_TABLE}
                        (id, "boeId", old_endsat, new_endsat, kind, label)
                        VALUES (%s, %s, NULL, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING''',
                    (auction_id, boe_id, ends_at, kind, label),
                )
                written += 1
        cur.execute('SELECT count(*) FROM "Auction" WHERE "endsAt" IS NULL')
        after = cur.fetchone()[0]
        print(f"rows written: {written}", flush=True)
        print(f"NULL endsAt AFTER: {after} (delta {before - after})", flush=True)
        if before - after != written:
            conn.rollback()
            sys.exit("ABORT: NULL-count delta does not match rows written")
        conn.commit()
    conn.close()
    print("committed", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["fetch", "apply"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.phase == "fetch":
        phase_fetch(args.limit, args.workers)
    else:
        phase_apply(args.dry_run)


if __name__ == "__main__":
    main()
