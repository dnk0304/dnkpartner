#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backfill-cadastral-ref.py

Populates Auction.cadastralRef / cadastralData / auctionId for ACTIVE rows
missing RC. Multi-source resolution (in order, first hit wins):

  1. PORTAL Bienes tab — if the row has a portal idSub (either already in
     `auctionId`, or `boeId` itself starts with SUB-). This is the highest-
     quality RC source.
  2. GAZETTE edict (`https://www.boe.es/diario_boe/txt.php?id=<boeId>`):
     - Scan the body for an embedded portal idSub (BOE judicial edicts
       conventionally print "Identificador único en el Portal de Subastas:
       SUB-XX-YYYY-NNNNNN" or link to the portal). If discovered → also
       persist to `auctionId` and re-try step 1 on the freshly-found id.
     - Else scan the gazette body text for the RC label/token directly.
  3. PDF EDICTO fallback — follow the gazette page's PDF link (if pypdf is
     available), text-extract, regex for RC.

The script is idempotent. Active-only (Dennis decision C). Status whitelist
defaults to CELEBRANDOSE + PROXIMA_APERTURA (the only two with real volume).

USAGE (run inside the dnksubastas-app or scheduler container so DATABASE_URL
and DNS resolve correctly to the PG container):

    python scripts/backfill-cadastral-ref.py --limit 20      # test slice
    python scripts/backfill-cadastral-ref.py --all           # full pass

Resume via checkpoint file in scripts/_cadastral_backfill_checkpoint.json.
Remove that file or pass --ignore-checkpoint to re-run from scratch.
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
from playwright.sync_api import sync_playwright

# Optional PDF text extraction. pypdf is light and pure-python; if missing we
# skip the PDF fallback rather than fail the whole backfill.
try:
    from pypdf import PdfReader  # type: ignore
    _PYPDF_AVAILABLE = True
except Exception:  # pragma: no cover
    try:
        from PyPDF2 import PdfReader  # type: ignore
        _PYPDF_AVAILABLE = True
    except Exception:
        _PYPDF_AVAILABLE = False

import urllib.request

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

PORTAL_DETAIL_URL = "https://subastas.boe.es/detalleSubasta.php?idSub="
GAZETTE_URL = "https://www.boe.es/diario_boe/txt.php?id="
CHECKPOINT_PATH = Path(__file__).resolve().parent / "_cadastral_backfill_checkpoint.json"
DEFAULT_STATUSES = ("CELEBRANDOSE", "PROXIMA_APERTURA", "ACTIVE", "PRE_AUCTION")

# Spanish Referencia Catastral: 20-char alphanumeric.
_RC_TOKEN = r"[0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2}"
_RC_LABEL_INLINE_RE = re.compile(
    r"(?:Referencia\s+catastral|Ref\.?\s*catastral)\s*[:\-]?\s*(" + _RC_TOKEN + r")",
    re.IGNORECASE,
)
_RC_LABEL_NEXT_LINE_RE = re.compile(
    r"(?:Referencia\s+catastral|Ref\.?\s*catastral)\s*[:\-]?\s*\n+\s*(" + _RC_TOKEN + r")",
    re.IGNORECASE,
)

# Portal idSub format: SUB-{JA|JC|NO|AC|TR|XX}-YYYY-NNNNNN
# Examples observed in scraper logs: SUB-JC-2020-144534, SUB-JA-2018-113171.
_PORTAL_IDSUB_RE = re.compile(r"\b(SUB-[A-Z]{2}-\d{4}-\d+)\b")


def extract_cadastral_refs(text: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return (first_rc, all_rcs_joined) parsed from any text blob, or (None, None)."""
    if not text:
        return (None, None)
    upper = text.upper()
    found: List[str] = []
    seen = set()
    for m in _RC_LABEL_INLINE_RE.finditer(upper):
        rc = m.group(1)
        if rc not in seen:
            seen.add(rc)
            found.append(rc)
    for m in _RC_LABEL_NEXT_LINE_RE.finditer(upper):
        rc = m.group(1)
        if rc not in seen:
            seen.add(rc)
            found.append(rc)
    if not found:
        return (None, None)
    return (found[0], "\n".join(found))


def extract_portal_idsub(text: Optional[str]) -> Optional[str]:
    """First SUB-XX-YYYY-NNNNNN token in the blob, or None."""
    if not text:
        return None
    m = _PORTAL_IDSUB_RE.search(text)
    return m.group(1) if m else None


def extract_section_text(page, title: str) -> Optional[str]:
    """Pull text under an h2/h3/h4 whose name contains `title` (ci)."""
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


def get_page_text(page) -> Optional[str]:
    """Whole-body text (used when there's no Bienes heading, e.g. gazette pages)."""
    try:
        return page.inner_text("body")
    except Exception:
        return None


def extract_pdf_link(page) -> Optional[str]:
    """Find a PDF/edicto link on the current page. Prefers anchors whose
    text/href mentions PDF or EDICTO."""
    try:
        return page.evaluate(
            """
            () => {
              const anchors = Array.from(document.querySelectorAll('a[href]'));
              for (const a of anchors) {
                const h = (a.getAttribute('href') || '');
                const t = (a.textContent || '').toUpperCase();
                if (h.toLowerCase().endsWith('.pdf')) return a.href;
                if (t.includes('PDF') && h) return a.href;
                if (t.includes('EDICTO') && h.toLowerCase().includes('.pdf')) return a.href;
              }
              return null;
            }
            """
        )
    except Exception:
        return None


def fetch_pdf_text(pdf_url: str, timeout: int = 20) -> Optional[str]:
    """Download a PDF and extract its text. Returns None if pypdf is missing
    or the download/extract fails."""
    if not _PYPDF_AVAILABLE:
        return None
    try:
        req = urllib.request.Request(
            pdf_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; dnksubastas-backfill/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        reader = PdfReader(io.BytesIO(data))
        out = []
        for pg in reader.pages:
            try:
                t = pg.extract_text() or ""
            except Exception:
                t = ""
            if t:
                out.append(t)
        return "\n".join(out) if out else None
    except Exception:
        return None


def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print(
            "FATAL: DATABASE_URL not set. Run this script inside the app container "
            "where the env is already populated (docker exec dnksubastas-app sh -c "
            "'cd /app && python scripts/backfill-cadastral-ref.py ...').",
            file=sys.stderr,
        )
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
            json.dumps(
                {"processed": sorted(processed), "savedAt": datetime.now(timezone.utc).isoformat()}
            ),
            encoding="utf-8",
        )
    except Exception as e:
        print(f"WARN: checkpoint write failed: {e}", file=sys.stderr)


def load_targets(conn, statuses: tuple, limit: Optional[int]) -> List[Tuple[str, Optional[str]]]:
    """Returns list of (boeId, auctionId) tuples. Uses status::text cast — the
    `status` column is PG enum AuctionStatus and won't compare to text directly."""
    sql = """
        SELECT "boeId", "auctionId"
        FROM "Auction"
        WHERE status::text = ANY(%s)
          AND ("cadastralRef" IS NULL OR "cadastralRef" = '')
        ORDER BY "endsAt" ASC NULLS LAST
    """
    params: list = [list(statuses)]
    if limit is not None:
        sql += " LIMIT %s"
        params.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [(r[0], r[1]) for r in cur.fetchall()]


def update_row(
    conn,
    boe_id: str,
    rc: Optional[str],
    rc_data: Optional[str],
    discovered_auction_id: Optional[str],
) -> None:
    """Patch in whatever we found. Avoid clobbering an existing auctionId with
    NULL — only write it when we actually discovered one."""
    sets = []
    params: list = []
    if rc:
        sets.append('"cadastralRef" = %s')
        params.append(rc)
        sets.append('"cadastralData" = %s')
        params.append(rc_data or rc)
    if discovered_auction_id:
        sets.append('"auctionId" = COALESCE("auctionId", %s)')
        params.append(discovered_auction_id)
    if not sets:
        return
    sets.append('"updatedAt" = %s')
    params.append(datetime.now(timezone.utc))
    params.append(boe_id)
    sql = f'UPDATE "Auction" SET {", ".join(sets)} WHERE "boeId" = %s'
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def try_portal(page, portal_id: str, min_delay: float, max_delay: float) -> Optional[str]:
    """Fetch portal detail page for `portal_id` and return Bienes section text.
    Returns None if the portal errors (e.g. invalid idSub)."""
    try:
        page.goto(f"{PORTAL_DETAIL_URL}{portal_id}", wait_until="networkidle", timeout=30000)
        time.sleep(random.uniform(min_delay, max_delay))
        body = get_page_text(page) or ""
        if "identificador de subasta incorrecto" in body.lower():
            return None
        return extract_section_text(page, "Bienes")
    except Exception:
        return None


def try_gazette(page, boe_id: str, min_delay: float, max_delay: float) -> Optional[str]:
    """Fetch the gazette edict page; return full body text or None."""
    try:
        page.goto(f"{GAZETTE_URL}{boe_id}", wait_until="networkidle", timeout=30000)
        time.sleep(random.uniform(min_delay, max_delay))
        return get_page_text(page)
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill cadastralRef on active BOE auctions.")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--limit", type=int, default=20, help="Process up to N rows (default 20).")
    g.add_argument("--all", action="store_true", help="Process the entire active set.")
    ap.add_argument(
        "--statuses",
        nargs="+",
        default=list(DEFAULT_STATUSES),
        help=f"Status whitelist (default: {' '.join(DEFAULT_STATUSES)}).",
    )
    ap.add_argument("--min-delay", type=float, default=1.5, help="Min per-fetch delay seconds.")
    ap.add_argument("--max-delay", type=float, default=3.5, help="Max per-fetch delay seconds.")
    ap.add_argument(
        "--ignore-checkpoint",
        action="store_true",
        help="Process all selected rows even if previously seen.",
    )
    ap.add_argument(
        "--skip-pdf",
        action="store_true",
        help="Disable the PDF-edicto fallback (faster, lower coverage).",
    )
    args = ap.parse_args()

    db_url = get_db_url()
    statuses = tuple(args.statuses)
    limit = None if args.all else args.limit

    print("[backfill-rc] connecting to PG ...")
    conn = psycopg2.connect(db_url)
    try:
        targets = load_targets(conn, statuses, limit)
        print(
            f"[backfill-rc] {len(targets)} candidate rows "
            f"(statuses={list(statuses)}, limit={'ALL' if limit is None else limit})"
        )
        print(f"[backfill-rc] pdf fallback: "
              f"{'DISABLED (--skip-pdf)' if args.skip_pdf else ('available' if _PYPDF_AVAILABLE else 'unavailable (pypdf not installed)')}")

        if not targets:
            print("[backfill-rc] nothing to do.")
            return 0

        checkpoint = set() if args.ignore_checkpoint else load_checkpoint()
        if checkpoint:
            before = len(targets)
            targets = [t for t in targets if t[0] not in checkpoint]
            print(
                f"[backfill-rc] checkpoint skipped {before - len(targets)} already-processed rows"
            )

        attempted = 0
        rc_from_portal = 0
        rc_from_gazette = 0
        rc_from_pdf = 0
        idsub_discovered = 0
        still_null = 0
        errors = 0
        samples: List[Tuple[str, str, str]] = []  # (boe_id, source, rc)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1366, "height": 768},
                locale="es-ES",
                timezone_id="Europe/Madrid",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            page.set_default_timeout(20000)

            try:
                for idx, (boe_id, existing_auction_id) in enumerate(targets, start=1):
                    attempted += 1
                    rc: Optional[str] = None
                    rc_data: Optional[str] = None
                    discovered_idsub: Optional[str] = None
                    source = "—"

                    try:
                        # Resolve which portal id to try first.
                        portal_id = (
                            existing_auction_id
                            if existing_auction_id
                            else (boe_id if boe_id.startswith("SUB-") else None)
                        )

                        # STEP 1: Portal Bienes tab (highest quality source).
                        if portal_id:
                            bienes = try_portal(page, portal_id, args.min_delay, args.max_delay)
                            rc, rc_data = extract_cadastral_refs(bienes)
                            if rc:
                                source = "portal"

                        # STEP 2: Gazette edict — search body for embedded
                        # portal idSub AND for the RC label directly.
                        gazette_body: Optional[str] = None
                        if not rc:
                            gazette_body = try_gazette(
                                page, boe_id, args.min_delay, args.max_delay
                            )
                            if gazette_body:
                                # Try to discover a portal idSub we didn't have.
                                if not portal_id:
                                    found_id = extract_portal_idsub(gazette_body)
                                    if found_id:
                                        discovered_idsub = found_id
                                        idsub_discovered += 1
                                        # Try the portal Bienes tab now.
                                        bienes = try_portal(
                                            page, found_id, args.min_delay, args.max_delay
                                        )
                                        rc, rc_data = extract_cadastral_refs(bienes)
                                        if rc:
                                            source = "portal_via_gazette"
                                # Fallback: parse RC from gazette body directly.
                                if not rc:
                                    rc, rc_data = extract_cadastral_refs(gazette_body)
                                    if rc:
                                        source = "gazette"

                        # STEP 3: PDF edicto fallback.
                        if not rc and not args.skip_pdf and _PYPDF_AVAILABLE:
                            # We need to be on a page that has the PDF link.
                            # If we haven't loaded the gazette yet (because we
                            # had a portal_id but it errored), load it now.
                            if not gazette_body:
                                gazette_body = try_gazette(
                                    page, boe_id, args.min_delay, args.max_delay
                                )
                            if gazette_body:
                                pdf_url = extract_pdf_link(page)
                                if pdf_url:
                                    pdf_text = fetch_pdf_text(pdf_url)
                                    if pdf_text:
                                        rc, rc_data = extract_cadastral_refs(pdf_text)
                                        if rc:
                                            source = "pdf"
                                        # Also try idSub from PDF if not yet found.
                                        if not (existing_auction_id or discovered_idsub):
                                            found_id = extract_portal_idsub(pdf_text)
                                            if found_id:
                                                discovered_idsub = found_id
                                                idsub_discovered += 1

                        # Bookkeeping + write.
                        if rc:
                            if source == "portal":
                                rc_from_portal += 1
                            elif source in ("portal_via_gazette", "gazette"):
                                rc_from_gazette += 1
                            elif source == "pdf":
                                rc_from_pdf += 1
                            if len(samples) < 8:
                                samples.append((boe_id, source, rc))
                            tag = "OK "
                        else:
                            still_null += 1
                            tag = "—  "

                        if rc or discovered_idsub:
                            update_row(conn, boe_id, rc, rc_data, discovered_idsub)

                        checkpoint.add(boe_id)
                        if idx % 25 == 0:
                            save_checkpoint(checkpoint)

                        suffix = ""
                        if rc:
                            suffix = f" rc={rc} src={source}"
                        elif discovered_idsub:
                            suffix = f" (no rc; persisted idSub={discovered_idsub})"
                        print(f"[{idx}/{len(targets)}] {tag} {boe_id}{suffix}")
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
        print(f"  attempted          : {attempted}")
        print(f"  rc from portal     : {rc_from_portal}")
        print(f"  rc from gazette    : {rc_from_gazette}")
        print(f"  rc from pdf        : {rc_from_pdf}")
        print(f"  idsub discovered   : {idsub_discovered}")
        print(f"  still_null         : {still_null}")
        print(f"  errors             : {errors}")
        if samples:
            print("  samples            : " + ", ".join(
                f"({b}, src={s}, rc={r})" for b, s, r in samples
            ))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
