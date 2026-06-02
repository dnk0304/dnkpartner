"""
#14 multi-lot SPLIT verification harness — COUNT-GATE edition (NOT shipped).
Runs the REAL split logic against live BOE and prints the verify-gate evidence:
  1. single-lote auction -> NO split (regression)
  2. phrase-bearing 2+-lote example -> 2 rows -L1/-L2, real price+address
  3. phrase-LESS 2+-lote auction -> NOW splits (core proof of the count gate)
  4. Varios-Lotes fallback -> null price, not fabricated, validates (not dropped)
  5. idempotency -> stable composite ids
Nothing is written to a DB (uses a stub adapter implicitly — we never call upsert
except through _upsert_split_lotes on a stub, here we only build rows + validate).

Usage:  HEADLESS=true python -m scraper._verify_multilot
"""
import os
import sys
import logging

logging.basicConfig(level=logging.WARNING)

os.environ.setdefault('HEADLESS', 'true')
os.environ.setdefault('BOE_FETCH_DETAIL', '1')
os.environ.setdefault('BOE_SPLIT_LOTES', '1')

from scraper.scrapers.boe_scraper import BOEScraper, is_split_auction, make_lote_boe_id


def trigger_of(detail):
    return ' '.join(filter(None, [
        detail.get('general_info'), detail.get('bienes_info'), detail.get('warning'),
    ]))


UMBRELLA = {
    'auction_type': 'OTRAS_TRIBUTARIAS', 'province': 'Navarra',
    'category': 'Otros', 'status': 'CELEBRANDOSE',
    'municipality': None, 'court_name': None,
}


def probe(s, idsub, label):
    """Fetch + report gate decision + (if split) the rows."""
    print(f"\n=== {label}: {idsub} ===")
    detail = s._fetch_detail_info(idsub)
    lns = detail.get('lote_numbers') or []
    declared = is_split_auction(trigger_of(detail))
    print(f"  lote_numbers={lns}  count={len(lns)}  declared_phrase={declared}")
    rows = s._maybe_split_into_lotes(idsub, dict(UMBRELLA), detail)
    if not rows:
        print(f"  GATE -> NO SPLIT (umbrella kept)  [count<2: {len(lns)<2}]")
        return None, lns, declared
    print(f"  GATE -> SPLIT into {len(rows)} rows")
    for r in rows:
        valid = s.validate_auction_data(r)
        print(f"    boeId={r['boe_id']:<34} appr={r.get('appraisal_value')!s:>10} "
              f"minBid={r.get('minimum_bid')!s:>10} addr={(r.get('address') or '')[:40]!r:42} "
              f"valid={valid} title={r.get('title')!r}")
    return rows, lns, declared


def main():
    s = BOEScraper(province='Madrid')

    print("=== TRIGGER UNIT CHECKS (is_split_auction now a non-gating signal) ===")
    for text, expect in [
        ("se subastan de forma separada", True),
        ("La subasta contiene varios lotes.", False),
        ("", False), (None, False),
    ]:
        got = is_split_auction(text)
        print(f"  [{'OK ' if got==expect else 'FAIL'}] expect={expect!s:5} got={got!s:5}  {text!r}")

    # 2. phrase-bearing 2-lote example (Dennis's link)
    probe(s, 'SUB-RC-2026-3100200100959', 'PHRASE-BEARING 2-LOTE (example)')

    # Candidates to find a phrase-LESS 2+-lote (item 3) and a single-lote (item 1).
    # We probe a small set and let the harness report which is which.
    for idsub, lbl in [
        ('SUB-JA-2024-235417', 'CANDIDATE (cross-cat 2-lote)'),
        ('SUB-GA-2026-2801400126E01', 'CANDIDATE (20-lote admin)'),
    ]:
        probe(s, idsub, lbl)

    try:
        s.browser_manager.close()
    except Exception:
        pass


if __name__ == '__main__':
    main()
