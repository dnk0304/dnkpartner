#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backfill-cadastral-ref.py

One-shot enrichment that populates Auction.cadastralRef / cadastralData for
ACTIVE rows missing it. The BOE search/summary HTML we scrape on the listing
page does NOT carry the Referencia Catastral — only the deep detail page's
"Bienes" tab does. This script revisits each active auction's detail page,
parses the RC out of the Bienes block, and UPDATEs the row.

Once cadastralRef is populated, the existing image resolver
(`subastas/src/lib/auction-images/resolver.ts`) automatically fetches the
Catastro facade photo on first request and caches it to the Hetzner volume.

USAGE (run inside the dnksubastas-app or scheduler container so DATABASE_URL
and DNS resolve correctly to the PG container):

    # Test slice (default 20 rows)
    python scripts/backfill-cadastral-ref.py --limit 20

    # Full active backfill (~2,028 rows, ~2.5s each => ~85 min)
    python scripts/backfill-cadastral-ref.py --all

    # Resume after a crash — the checkpoint file is read automatically.
    python scripts/backfill-cadastral-ref.py --all

    # Reset checkpoint and re-run from scratch
    rm scripts/_cadastral_backfill_checkpoint.json
    python scripts/backfill-cadastral-ref.py --all

The script reads the same DATABASE_URL the app uses. It is idempotent and safe
to re-run — it only targets rows where cadastralRef IS NULL OR ''.

Active-only by Dennis decision (c): NO historical (CONCLUIDA_PORTAL) backfill.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import psycopg2
from psycopg2.extras import RealDictCursor
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

BASE_URL = "https://subastas.boe.es/detalleSubasta.php?idSub="
CHECKPOINT_PATH = Path(__file__).resolve().parent / "_cadastral_backfill_checkpoint.json"
DEFAULT_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "ACTIVE", "PRE_AUCTION")

# Spanish Referencia Catastral: 20-char alphanumeric.
# Structure: 7 digits + 2 letters + 4 digits + 1 letter + 4 digits + 2 letters
# (e.g. 9872023VH5797S0001WX). Anchored on the label "Referencia catastral" /
# "Ref. catastral" so we don't false-positive on other 14-20 char ids in the
# same block (postal/registry numbers). Mirrors the helper in
# subastas/scraper/scrapers/boe_scraper.py — duplicated here so this script is
# self-contained (no scraper-package import needed at runtime).
_RC_TOKEN = r"[0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2}"
_RC_LABEL_INLINE_RE = re.compile(
    r"(?:Referencia\s+catastral|Ref\.?\s*catastral)\s*[:\-]?\s*(" + _RC_TOKEN + r")",
    re.IGNORECASE,
)
_RC_LABEL_NEXT_LINE_RE = re.compile(
    r"(?:Referencia\s+catastral|Ref\.?\s*catastral)\s*[:\-]?\s*\n+\s*(" + _RC_TOKEN + r")",
    re.IGNORECASE,
)


def extract_cadastral_refs(bienes_text: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return (first_rc, all_rcs_joined) parsed from a Bienes-section blob, or (None, None)."""
    if not bienes_text:
        return (None, None)
    text = bienes_text.upper()
    found: List[str] = []
    seen = set()
    for m in _RC_LABEL_INLINE_RE.finditer(text):
        rc = m.group(1)
        if rc not in seen:
            seen.add(rc)
            found.append(rc)
    for m in _RC_LABEL_NEXT_LINE_RE.finditer(text):
        rc = m.group(1)
        if rc not in seen:
            seen.add(rc)
            found.append(rc)
    if not found:
        return (None, None)
    return (found[0], "\n".join(found))


def extract_section_text(page, title: str) -> Optional[str]:
    """Pull the text under a heading whose name contains `title` (case-insensitive)."""
    try:
        return page.evaluate(
            """
            (title) => {
              const headings = Array.from(document.querySelectorAll('h2, h3, h4'))
                .filter(h => (h.textContent || '').toLowerCase().includes(title.toLowerCase()));
              if (!headings.length) return null;
              const heading = headings[0];
              const parts = [];
              let el = heading.nextElementSibling;
              while (el) {
                if (['H2','H3','H4'].includes(el.tagName)) break;
                if (el.innerText) parts.push(el.innerText.trim());
                el = el.nextElementSibling;
              }
              const text = parts.join('\\n').trim();
              return text.length ? text : null;
            }
            """,
            title,
        )
    except Exception:
        return None


def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("FATAL: DATABASE_URL not set. Run this script inside the app container "
              "where the env is already populated (docker exec dnksubastas-app sh -c "
              "'cd /app && python scripts/backfill-cadastral-ref.py ...').",
              file=sys.stderr)
        sys.exit(2)
    return url


def load_checkpoint() -> set:
    if not CHECKPOINT_PATH.exists():
        return set()
    try:
        data = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
        return set(data.get("processed", []))
    except Exception as e:
        print(f"WARN: checkpoint unreadable ({e}); starting fresh", file=sys.stderr)
        return set()


def save_checkpoint(processed: set) -> None:
    try:
        CHECKPOINT_PATH.write_text(
            json.dumps({"processed": sorted(processed),
                        "savedAt": datetime.now(timezone.utc).isoformat()}),
            encoding="utf-8",
        )
    except Exception as e:
        print(f"WARN: checkpoint write failed: {e}", file=sys.stderr)


def load_targets(conn, statuses: tuple, limit: Optional[int]) -> List[str]:
    sql = """
        SELECT "boeId"
        FROM "Auction"
        WHERE status = ANY(%s)
          AND ("cadastralRef" IS NULL OR "cadastralRef" = '')
        ORDER BY "endsAt" ASC NULLS LAST
    """
    params: list = [list(statuses)]
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [r[0] for r in cur.fetchall()]


def update_row(conn, boe_id: str, rc: str, rc_data: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "Auction" SET "cadastralRef" = %s, "cadastralData" = %s, '
            '"updatedAt" = %s WHERE "boeId" = %s',
            (rc, rc_data, datetime.now(timezone.utc), boe_id),
        )
    conn.commit()


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill cadastralRef on active BOE auctions.")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--limit", type=int, default=20, help="Process up to N rows (default 20).")
    g.add_argument("--all", action="store_true", help="Process the entire active set.")
    ap.add_argument("--statuses", nargs="+", default=list(DEFAULT_STATUSES),
                    help=f"Status whitelist (default: {' '.join(DEFAULT_STATUSES)}).")
    ap.add_argument("--min-delay", type=float, default=1.5, help="Min per-fetch delay seconds.")
    ap.add_argument("--max-delay", type=float, default=3.5, help="Max per-fetch delay seconds.")
    ap.add_argument("--ignore-checkpoint", action="store_true",
                    help="Process all selected rows even if previously seen.")
    args = ap.parse_args()

    db_url = get_db_url()
    statuses = tuple(args.statuses)
    limit = None if args.all else args.limit

    print(f"[backfill-rc] connecting to PG ...")
    conn = psycopg2.connect(db_url)
    try:
        targets = load_targets(conn, statuses, limit)
        print(f"[backfill-rc] {len(targets)} candidate rows "
              f"(statuses={list(statuses)}, limit={'ALL' if limit is None else limit})")

        if not targets:
            print("[backfill-rc] nothing to do.")
            return 0

        checkpoint = set() if args.ignore_checkpoint else load_checkpoint()
        if checkpoint:
            before = len(targets)
            targets = [t for t in targets if t not in checkpoint]
            print(f"[backfill-rc] checkpoint skipped {before - len(targets)} already-processed rows")

        attempted = 0
        rc_found = 0
        still_null = 0
        errors = 0
        samples: List[Tuple[str, str]] = []

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1366, "height": 768},
                locale="es-ES",
                timezone_id="Europe/Madrid",
            )
            page = context.new_page()
            page.set_default_timeout(20000)

            try:
                for idx, boe_id in enumerate(targets, start=1):
                    attempted += 1
                    try:
                        url = f"{BASE_URL}{boe_id}"
                        page.goto(url, wait_until="networkidle", timeout=30000)
                        time.sleep(random.uniform(args.min_delay, args.max_delay))

                        bienes = extract_section_text(page, "Bienes")
                        rc, rc_data = extract_cadastral_refs(bienes)

                        if rc:
                            update_row(conn, boe_id, rc, rc_data or rc)
                            rc_found += 1
                            if len(samples) < 5:
                                samples.append((boe_id, rc))
                            tag = "OK "
                        else:
                            still_null += 1
                            tag = "—  "

                        checkpoint.add(boe_id)
                        if idx % 25 == 0:
                            save_checkpoint(checkpoint)

                        print(f"[{idx}/{len(targets)}] {tag} {boe_id}"
                              + (f" rc={rc}" if rc else ""))
                    except KeyboardInterrupt:
                        print("\n[backfill-rc] interrupted — saving checkpoint")
                        save_checkpoint(checkpoint)
                        raise
                    except Exception as e:
                        errors += 1
                        print(f"[{idx}/{len(targets)}] ERR {boe_id}: {e}", file=sys.stderr)
            finally:
                save_checkpoint(checkpoint)
                try:
                    context.close()
                    browser.close()
                except Exception:
                    pass

        print("\n[backfill-rc] DONE")
        print(f"  attempted      : {attempted}")
        print(f"  rc_found (tab) : {rc_found}")
        print(f"  rc_from_pdf    : 0 (PDF fallback deferred to v2)")
        print(f"  still_null     : {still_null}")
        print(f"  errors         : {errors}")
        if samples:
            print(f"  samples        : " + ", ".join(f"({b}, {r})" for b, r in samples))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
