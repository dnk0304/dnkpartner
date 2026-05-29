#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enrich BOE auctions with "Información general" and "Advertencias".
"""

import sys
import io
import time
import random
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict

from playwright.sync_api import sync_playwright


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

BASE_URL = "https://subastas.boe.es/detalleSubasta.php?idSub="
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "database" / "prod.db"


def extract_section_text(page, title: str) -> Optional[str]:
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


def extract_warning_banner(page) -> Optional[str]:
    try:
        return page.evaluate(
            """
            () => {
              const candidates = Array.from(document.querySelectorAll('body *'))
                .filter(el => el.textContent && el.textContent.trim().toUpperCase().includes('ADVERTENCIA'));
              if (!candidates.length) return null;
              const text = candidates[0].textContent.trim();
              return text.length ? text : null;
            }
            """
        )
    except Exception:
        return None


def load_targets(limit: int) -> List[str]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        """
        SELECT boeId
        FROM Auction
        WHERE status IN ('PRE_AUCTION', 'PROXIMA_APERTURA')
          AND (
            boeAnnouncement IS NULL OR boeAnnouncement = ''
            OR chargesDetail IS NULL OR chargesDetail = ''
          )
        LIMIT ?
        """,
        (limit,),
    )
    rows = [r[0] for r in cur.fetchall()]
    conn.close()
    return rows


def update_auction(boe_id: str, general_info: Optional[str], warning: Optional[str]) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        UPDATE Auction
        SET boeAnnouncement = ?,
            chargesDetail = ?,
            updatedAt = ?
        WHERE boeId = ?
        """,
        (general_info, warning, datetime.now().isoformat(), boe_id),
    )
    conn.commit()
    conn.close()


def main():
    limit = 100
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        limit = int(sys.argv[1])

    boe_ids = load_targets(limit)
    if not boe_ids:
        print("✅ No pre-auctions missing general info.")
        return

    print(f"🔎 Enriching {len(boe_ids)} pre-auctions...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1366, "height": 768},
            locale="es-ES",
            timezone_id="Europe/Madrid",
        )
        page = context.new_page()
        page.set_default_timeout(15000)

        for idx, boe_id in enumerate(boe_ids, start=1):
            try:
                url = f"{BASE_URL}{boe_id}"
                page.goto(url, wait_until="networkidle", timeout=30000)
                time.sleep(random.uniform(1.0, 2.0))

                general_info = extract_section_text(page, "Información general") or extract_section_text(page, "Datos de la subasta")
                complement = extract_section_text(page, "Información complementaria de la subasta")
                if complement:
                    general_info = f"{general_info}\n{complement}" if general_info else complement

                warning = (
                    extract_section_text(page, "Advertencias")
                    or extract_section_text(page, "Advertencia")
                    or extract_warning_banner(page)
                )

                update_auction(boe_id, general_info, warning)
                print(f"✅ [{idx}/{len(boe_ids)}] {boe_id} updated")
            except Exception as e:
                print(f"⚠️  [{idx}/{len(boe_ids)}] {boe_id} failed: {e}")

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
