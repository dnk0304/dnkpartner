"""
Fixture-pinned tests for scrapers/pujas_result_parser (Ghost, 2026-07-17).

MANDATE (Dennis, DISPATCH-BRIEF-GHOST-capture-v2 Change A.1): the retargeted
"Pujas máximas" selectors must be pinned against REAL saved ver=5 snapshots and
assert each fixture parses to its known-correct saleResult/price. These greens
are the gate: no freeze hook, no daily pass, and NO ~200k backfill until every
fixture below passes.

Fixtures in tests/fixtures/pujas/ (raw HTML captured live 2026-07-17):
  single_sold_AT.html ............... SUB-AT-2026-26R0886001155  ADJUDICADA 625199
  multi_table_umbrella_JA.html ...... SUB-JA-2026-259908         table (L1=1.372.637,35, L2=257.808,64 ...)
  multi_table_perlote_JA_L2.html .... SUB-JA-2026-259908&idLote=2  same table (per-lote fetch does NOT collapse)
  desierta_single_JA.html ........... SUB-JA-2025-256171         DESIERTA
  desierta_single_NE.html ........... SUB-NE-2025-1486050        DESIERTA
  banner_finalizada_amount_retained_JC.html  SUB-JC-2026-262395  ADJUDICADA 120505 (banner must NOT wipe)
  old2021_desierta_banner_JA.html ... SUB-JA-2021-170644         DESIERTA (portal retains indefinitely)
  live_actual_single_RC.html ........ SUB-RC-2021-3100200104047  DESIERTA ("Puja máxima ACTUAL" live variant)
  SYNTH_multi_table_sinpuja_L3.html . synthetic: L3 cell = "Sin puja" -> that lote DESIERTA
  SYNTH_wiped_block_JC.html ......... synthetic: block shows only the finalizada notice -> None (NULL+attempt)
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scrapers"))

from pujas_result_parser import (  # noqa: E402
    parse_pujas_html, eur_to_cents, ADJUDICADA, DESIERTA,
)

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "pujas")


def _load(name: str) -> str:
    with open(os.path.join(FIX, name), encoding="utf-8", errors="replace") as fh:
        return fh.read()


def test_single_sold():
    r = parse_pujas_html(_load("single_sold_AT.html"))
    assert r.sale_result == ADJUDICADA
    assert r.sold_price_cents == 625199


def test_banner_present_amount_retained_is_not_wiped():
    # The page-wide "FINALIZADA POR LA AUTORIDAD GESTORA" banner must be ignored;
    # the block still carries the real amount 1.205,05 €.
    r = parse_pujas_html(_load("banner_finalizada_amount_retained_JC.html"))
    assert r.sale_result == ADJUDICADA
    assert r.sold_price_cents == 120505


def test_desierta_single_ja():
    r = parse_pujas_html(_load("desierta_single_JA.html"))
    assert r.sale_result == DESIERTA
    assert r.sold_price_cents is None


def test_desierta_single_ne():
    r = parse_pujas_html(_load("desierta_single_NE.html"))
    assert r.sale_result == DESIERTA


def test_old_2021_desierta_still_parses():
    r = parse_pujas_html(_load("old2021_desierta_banner_JA.html"))
    assert r.sale_result == DESIERTA


def test_live_actual_variant_desierta():
    # "Puja máxima ACTUAL de la subasta" (live) is handled by the single-block path.
    r = parse_pujas_html(_load("live_actual_single_RC.html"))
    assert r.sale_result == DESIERTA


def test_multi_table_umbrella_perlote_map():
    r = parse_pujas_html(_load("multi_table_umbrella_JA.html"))
    # per_lote populated; no top-level result without an id_lote
    assert r.sale_result is None
    assert r.per_lote[1].sale_result == ADJUDICADA
    assert r.per_lote[1].sold_price_cents == 137263735
    assert r.per_lote[2].sale_result == ADJUDICADA
    assert r.per_lote[2].sold_price_cents == 25780864
    # table has 46 lotes
    assert len(r.per_lote) == 46


def test_multi_table_perlote_fetch_lifts_id_lote():
    # Fetching with &idLote=2 returns the SAME table; parser lifts lote 2 to top.
    r = parse_pujas_html(_load("multi_table_perlote_JA_L2.html"), id_lote=2)
    assert r.sale_result == ADJUDICADA
    assert r.sold_price_cents == 25780864


def test_synthetic_sin_puja_lote_is_desierta():
    r = parse_pujas_html(_load("SYNTH_multi_table_sinpuja_L3.html"), id_lote=3)
    assert r.sale_result == DESIERTA
    assert r.sold_price_cents is None
    # sibling lotes still adjudicated
    assert r.per_lote[1].sale_result == ADJUDICADA


def test_synthetic_wiped_block_is_undetermined():
    # Block shows only the finalizada notice, amount replaced -> undetermined.
    r = parse_pujas_html(_load("SYNTH_wiped_block_JC.html"))
    assert r.sale_result is None
    assert r.sold_price_cents is None


def test_missing_block_is_undetermined():
    r = parse_pujas_html("<html><body>no pujas block here</body></html>")
    assert r.sale_result is None


# --- soldPrice parse-fix hardening (Ghost, 2026-07-18) ---------------------
# Investigation verdict: the reported "€6.01B" tail was a UNIT MISREAD (BigInt
# cents read as euros; true max €60.1M). Every real outlier page is a FAITHFUL
# read. These cases pin that large legitimate amounts still parse EXACTLY (no
# regression from grouping validation) and that malformed/concatenated captures
# are honest-None instead of silent giant ints.

def test_real_60M_outlier_parses_faithfully():
    # SUB-JV-2017-70412 — live page prints "Puja máxima de la subasta
    # 60.111.949,00 €". This is a REAL value, not a parse error; it must survive.
    r = parse_pujas_html(_load("single_sold_60M_JV.html"))
    assert r.sale_result == ADJUDICADA
    assert r.sold_price_cents == 6011194900  # €60,111,949.00


def test_real_sentinel_outlier_parses_faithfully():
    # SUB-JC-2021-177256 — page prints "8.888.888,88 €" (a portal sentinel that
    # 83 auctions literally display). Well-formed grouping => parsed as-is; it is
    # NOT our parse bug and must not be nulled by the hardening.
    r = parse_pujas_html(_load("single_sold_sentinel_JC.html"))
    assert r.sale_result == ADJUDICADA
    assert r.sold_price_cents == 888888888  # €8,888,888.88


def test_eur_to_cents_accepts_well_formed_spanish_money():
    assert eur_to_cents("60.111.949,00") == 6011194900
    assert eur_to_cents("8.888.888,88") == 888888888
    assert eur_to_cents("1.205,05") == 120505
    assert eur_to_cents("625,19") == 62519
    assert eur_to_cents("1.372.637,35") == 137263735


def test_eur_to_cents_rejects_concatenated_or_malformed():
    # Two amounts run together (broken 3-digit grouping / two commas) -> None,
    # never a giant int. This is the concatenation class the fix guards against.
    assert eur_to_cents("1.234.5678.901,23") is None   # 4-digit group
    assert eur_to_cents("111.111,11222.222,22") is None  # two decimals
    assert eur_to_cents("60.111.949,00 39.513.274,92") is None  # whitespace-joined
    assert eur_to_cents("1234,56") is None              # ungrouped thousands
    assert eur_to_cents("") is None
    assert eur_to_cents("abc") is None


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
