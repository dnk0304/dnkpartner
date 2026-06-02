"""
#14 multi-lot SPLIT verification harness (NOT shipped — local proof only).
Runs the REAL split logic against the live BOE example and prints the N
independent lote rows with their per-lote pricing/titles. Captures upserts via a
stub adapter so nothing is written to a DB.

Usage:  HEADLESS=true python -m scraper._verify_multilot
        (run from the subastas/ dir so the package import resolves)
"""
import os
import sys
import logging

logging.basicConfig(level=logging.WARNING)

# Force the env flags on.
os.environ.setdefault('BOE_FETCH_DETAIL', '1')
os.environ.setdefault('BOE_SPLIT_LOTES', '1')

from scraper.scrapers.boe_scraper import (
    BOEScraper, is_split_auction, make_lote_boe_id,
)


def main():
    s = BOEScraper(province='Madrid')

    # --- 1. trigger-string unit checks (no network) ---
    print("=== TRIGGER UNIT CHECKS ===")
    cases = [
        ("La subasta contiene varios lotes que se subastan de forma separada.", True),
        ("(los lotes se subastan de forma independiente)", True),
        ("Se subastan DE FORMA SEPARADA varias fincas", True),
        ("La subasta contiene varios lotes.", False),
        ("Lote único. Vivienda en Madrid.", False),
        ("", False),
        (None, False),
    ]
    for text, expect in cases:
        got = is_split_auction(text)
        ok = "OK " if got == expect else "FAIL"
        print(f"  [{ok}] expect={expect!s:5} got={got!s:5}  {text!r}")
    print(f"  composite id sample: {make_lote_boe_id('SUB-GA-2026-2801400126E01', 7)}")

    # --- 2. live split on the example ---
    EXAMPLE = 'SUB-GA-2026-2801400126E01'
    print(f"\n=== LIVE SPLIT: {EXAMPLE} ===")
    detail = s._fetch_detail_info(EXAMPLE)
    trigger_text = ' '.join(filter(None, [
        detail.get('general_info'), detail.get('bienes_info'), detail.get('warning'),
    ]))
    print(f"  trigger present : {is_split_auction(trigger_text)}")
    print(f"  lote_numbers    : {detail.get('lote_numbers')}")

    umbrella = {
        'auction_type': 'ADMINISTRATIVAS', 'province': 'Madrid',
        'category': 'Otros', 'status': 'CELEBRANDOSE',
        'municipality': 'Madrid', 'court_name': None,
    }
    rows = s._maybe_split_into_lotes(EXAMPLE, umbrella, detail)
    if not rows:
        print("  !! NO SPLIT ROWS PRODUCED")
        sys.exit(1)
    print(f"  -> produced {len(rows)} independent rows\n")
    for r in rows:
        print(
            f"  boeId={r['boe_id']:<32} "
            f"lote#={r.get('lote_number'):>2} "
            f"appraisal={r.get('appraisal_value')} "
            f"minBid={r.get('minimum_bid')} "
            f"deposit={r.get('deposit_amount')} "
            f"src={r.get('source_id_sub')} "
            f"type={r.get('auction_type')} "
            f"title={r.get('title')!r}"
        )

    # --- 3. idempotency: same lote -> same composite id ---
    print("\n=== IDEMPOTENCY ===")
    ids = [r['boe_id'] for r in rows]
    print(f"  unique ids == row count: {len(set(ids)) == len(ids)} ({len(set(ids))}/{len(ids)})")
    print(f"  re-run lote 1 id stable: {make_lote_boe_id(EXAMPLE,1)} == {ids[0]}: {make_lote_boe_id(EXAMPLE,1)==ids[0]}")

    try:
        s.browser_manager.close()
    except Exception:
        pass


if __name__ == '__main__':
    main()
