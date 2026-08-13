#!/usr/bin/env python3
"""Repair the fabricated non-NULL ``endsAt`` values (Ken ruling 2026-08-13, MUNI-B (a)).

Background
----------
The deleted celery-only scrapers (``scraper/boe_scraper.py``,
``scraper/property_scraper.py``) wrote ``ends_at = datetime.now() + timedelta(...)``.
A ``datetime.now()`` value carries **sub-second microseconds**; a real BOE date
never does -- BOE publishes to the minute, and a closure certificate to the
second. So ``"endsAt" <> date_trunc('second', "endsAt")`` is an exact fingerprint
for the fabricated rows and matches nothing legitimate.

Ruling executed here
--------------------
* certificate exists -> **overwrite** with the real closure date;
* no certificate    -> **set NULL**.

A fabricated date silently files an auction into the wrong year hub, permanently,
inside a URL. NULL is handled by the ``COALESCE(endsAt, publishedAt)`` ladder and
is visibly absent. We do not keep invented data.

Reuses the fetch/validate/politeness machinery of
``backfill_endsat_from_certificate.py`` -- nothing is re-implemented.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapers"))

from backfill_endsat_from_certificate import (  # noqa: E402
    BASE_DELAY,
    BREAKER_LIMIT,
    connect,
    validate,
)
from closure_certificate import fetch_closure_event  # type: ignore # noqa: E402

OUT_PATH = os.environ.get(
    "FABRICATED_ENDSAT_JSONL", "/tmp/fabricated_endsat_results.jsonl"
)
SNAPSHOT_TABLE = "ghost_fabricated_endsat_snapshot_20260813"

# The fingerprint. Kept in one place so fetch and apply can never disagree.
FABRICATED_PREDICATE = '"endsAt" IS NOT NULL AND "endsAt" <> date_trunc(\'second\', "endsAt")'

POOL_SQL = f"""
    SELECT id, "boeId", status, "opensAt", "endsAt"
    FROM "Auction"
    WHERE {FABRICATED_PREDICATE}
    ORDER BY id
"""


# --------------------------------------------------------------------------- #
# phase 1: fetch
# --------------------------------------------------------------------------- #
def phase_fetch(limit: Optional[int], workers: int) -> None:
    conn = connect()
    with conn.cursor() as cur:
        cur.execute(POOL_SQL + (f" LIMIT {int(limit)}" if limit else ""))
        pool = cur.fetchall()
    conn.close()
    print(f"fabricated rows to repair: {len(pool)}", flush=True)

    done = set()
    if os.path.exists(OUT_PATH):
        with open(OUT_PATH, encoding="utf-8") as fh:
            for line in fh:
                try:
                    done.add(json.loads(line)["id"])
                except Exception:
                    pass
        print(f"resuming, already fetched: {len(done)}", flush=True)

    todo = [r for r in pool if r[0] not in done]
    print(f"to fetch: {len(todo)}", flush=True)

    fh = open(OUT_PATH, "a", encoding="utf-8")
    consecutive_failures = 0
    lock_note = {"n": 0}

    def work(row):
        nonlocal consecutive_failures
        auction_id, boe_id, status, opens_at, old_ends = row
        time.sleep(random.uniform(*BASE_DELAY))
        rec = {
            "id": auction_id,
            "boeId": boe_id,
            "old_endsAt": old_ends.isoformat() if old_ends else None,
        }
        # Only BOE `SUB-` auctions have a BOE closure certificate. TEJU (`BOE-J-`)
        # rows have no such document, so there is nothing to look up and the
        # ruling resolves them directly to NULL. Skipping avoids pointless
        # requests that would also trip the circuit breaker.
        if not (boe_id or "").startswith("SUB-"):
            rec["kind"] = "NO_CERTIFICATE"
            rec["reason"] = "non-SUB boeId: no BOE closure certificate exists"
            return rec
        try:
            ev = fetch_closure_event(boe_id)
        except Exception as exc:  # noqa: BLE001
            rec["error"] = str(exc)[:200]
            return rec
        if ev is None or getattr(ev, "ends_at", None) is None:
            rec["kind"] = "NO_CERTIFICATE"
            return rec
        reason = validate(ev.ends_at, boe_id, opens_at)
        if reason:
            rec["kind"] = "REJECTED"
            rec["reason"] = reason
            return rec
        rec["kind"] = "CERTIFICATE"
        rec["new_endsAt"] = ev.ends_at.isoformat()
        rec["label"] = ev.label
        rec["cert_kind"] = ev.kind
        return rec

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for rec in ex.map(work, todo):
            if rec.get("error"):
                consecutive_failures += 1
            else:
                consecutive_failures = 0
            if consecutive_failures >= BREAKER_LIMIT:
                print("CIRCUIT BREAKER: too many consecutive failures", flush=True)
                break
            if rec.get("error"):
                # A transport failure is NOT a decision. Do not persist it, so the
                # row is retried on the next run instead of being read as
                # "no certificate" and wrongly NULLed. (2026-08-13 precedent: a
                # missing PyPDF2 turned 100 live certificates into false negatives.)
                continue
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fh.flush()
            lock_note["n"] += 1
            if lock_note["n"] % 100 == 0:
                print(f"  fetched {lock_note['n']}", flush=True)
    fh.close()
    print("FINISHED", flush=True)


# --------------------------------------------------------------------------- #
# phase 2: apply
# --------------------------------------------------------------------------- #
def phase_apply(dry_run: bool) -> None:
    recs = []
    with open(OUT_PATH, encoding="utf-8") as fh:
        for line in fh:
            try:
                recs.append(json.loads(line))
            except Exception:
                pass
    # last record per id wins
    by_id = {r["id"]: r for r in recs}
    to_cert = [r for r in by_id.values() if r.get("kind") == "CERTIFICATE"]
    to_null = [r for r in by_id.values()
               if r.get("kind") in ("NO_CERTIFICATE", "REJECTED")]
    errored = [r for r in by_id.values() if r.get("error")]

    print(f"fetched records: {len(by_id)}")
    print(f"  -> overwrite with certificate date: {len(to_cert)}")
    print(f"  -> set NULL (no certificate):       {len(to_null)}")
    print(f"  -> transport errors (skipped):      {len(errored)}")
    if dry_run:
        print("DRY RUN - nothing written")
        return

    conn = connect()
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute(f'SELECT count(*) FROM "Auction" WHERE {FABRICATED_PREDICATE}')
        before = cur.fetchone()[0]
        print(f"fabricated BEFORE: {before}", flush=True)

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
        for r in to_cert + to_null:
            new_val = r.get("new_endsAt") if r.get("kind") == "CERTIFICATE" else None
            # updatedAt deliberately NOT bumped and no outbox event: this is a
            # repair of our own hole, not a lifecycle event (2026-08-04 precedent).
            cur.execute(
                f'''UPDATE "Auction" SET "endsAt" = %s
                    WHERE id = %s AND {FABRICATED_PREDICATE}''',
                (new_val, r["id"]),
            )
            if cur.rowcount == 1:
                cur.execute(
                    f'''INSERT INTO {SNAPSHOT_TABLE}
                        (id, "boeId", old_endsat, new_endsat, kind, label)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING''',
                    (r["id"], r.get("boeId"), r.get("old_endsAt"),
                     new_val, r.get("kind"), r.get("label")),
                )
                written += 1

        cur.execute(f'SELECT count(*) FROM "Auction" WHERE {FABRICATED_PREDICATE}')
        after = cur.fetchone()[0]
        print(f"rows written: {written}", flush=True)
        print(f"fabricated AFTER: {after} (delta {before - after})", flush=True)

        # in-transaction delta assert
        if before - after != written:
            conn.rollback()
            sys.exit("ABORT: fabricated-count delta does not match rows written")
        # no fabricated row may survive among those we fetched
        if after != before - written:
            conn.rollback()
            sys.exit("ABORT: residual fabricated rows unaccounted for")
        conn.commit()
        print("COMMITTED", flush=True)
    conn.close()


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
