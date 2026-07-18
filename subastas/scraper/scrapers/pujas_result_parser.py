"""
Pujas-result parser (ver=5 "Pujas" tab) — RETARGETED 2026-07-17 (Ghost).

Single source of truth for turning the BOE ver=5 "Pujas" page into a normalized
result. Used by THREE consumers so the selectors never drift apart:
  1. Live freeze extractor  (boe_scraper._fetch_pujas_for_page, #16/#17 pass).
  2. Daily post-close re-scrape (scheduler.recheck_sale_results).
  3. One-time historical backfill (backfill_sale_results.py).

Leaf module: depends only on stdlib + BeautifulSoup (already a hard dep). It
imports nothing from the scraper package, so it is unit-testable offline against
saved HTML fixtures (tests/fixtures/pujas/).

==============================================================================
GROUND TRUTH (verified live 2026-07-17 against real ver=5 pages — see fixtures)
==============================================================================
The result ALWAYS lives inside the pujas block  <div id="idBloqueDatos8">.
Everything outside that block is chrome/banners and MUST be ignored.

Two rendering shapes:

A) SINGLE-lote (or per-lote view):
     <div id="idBloqueDatos8">
       <h4>Puja máxima de la subasta</h4>           (live pages: "Puja máxima
                                                     ACTUAL de la subasta")
       <div class="caja invisible"><p>
         <strong class="destaca">6.251,99 €</strong>   -> ADJUDICADA, 625199
       </p></div>
     </div>
   Desierta variant:
       <p class="centrador">La subasta no ha recibido pujas.</p>  -> DESIERTA

B) MULTI-lote (umbrella AND per-lote idLote fetch both render the SAME table):
     <div id="idBloqueDatos8">
       <h4>Pujas máximas</h4>
       <table><thead><tr><th id="lote">Lote</th>
                          <th id="cantidad">Importe de la puja</th></tr></thead>
         <tbody><tr><td headers="lote">1</td>
                    <td headers="cantidad">1.372.637,35 €</td></tr> ...
                <tr><td headers="lote">3</td>
                    <td headers="cantidad">Sin puja</td></tr>   -> that lote DESIERTA
       </tbody></table>
     </div>
   NOTE: passing &idLote=N does NOT collapse to shape A — the portal still
   returns the full table. Per-lote resolution is done HERE by matching the
   "lote" cell, not by the URL.

CRITICAL FALSE-POSITIVE (why we scope to the block):
   Nearly every CONCLUDED page carries a page-wide banner
     <div class="caja gris aviso"> ... LA SUBASTA HA SIDO FINALIZADA POR LA
     AUTORIDAD GESTORA ... </div>
   This banner appears EVEN WHEN the puja amount is fully retained (verified:
   SUB-JC-2026-262395 shows the banner AND "1.205,05 €"). So the banner is NOT
   the spike's "amount-wiped" signal. Treating a page-wide "finalizada por la
   autoridad" match as a wipe would wrongly NULL ~all concluded rows. We ignore
   the banner entirely and read only the block's own content.

WIPED (spike's ~1.6%): the genuine amount-replacement case is when the block
   itself carries neither an amount nor a "no ha recibido pujas"/"Sin puja"
   phrase (the block shows only the finalizada notice, or is empty). That falls
   through to sale_result=None -> caller leaves saleResult NULL and increments
   the attempt counter. No special banner detection needed.

HONESTY: the amount is the highest BID ("puja máxima"), NOT a legally-confirmed
   adjudication. sale_result 'ADJUDICADA' = "had a winning bid", never a
   confirmed sale. Callers/labels must say "puja máxima", never "sale price".
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:  # pragma: no cover - bs4 is a hard dependency
    BeautifulSoup = None  # type: ignore

# Result enum values written to Auction.saleResult (Forge owns the DB enum).
ADJUDICADA = "ADJUDICADA"   # a winning bid existed (highest bid captured)
DESIERTA = "DESIERTA"       # explicitly no bids ("no ha recibido pujas"/"Sin puja")
# None sale_result => undetermined this pass (wiped/empty/parse miss) -> NULL + attempt++.

_PUJAS_BLOCK_ID = "idBloqueDatos8"
# Amount capture: Spanish money, dot thousands + comma-2-decimals. NO `\s` in the
# class — a whitespace-joined run of two amounts must NOT be captured as one token
# (that is what silently produced billion-euro concatenations). eur_to_cents then
# revalidates the grouping, so a malformed capture becomes an honest None, never a
# giant int.
_AMOUNT_RE = re.compile(r"([0-9][0-9.]*,[0-9]{2})")
# Strict Spanish grouping: 1-3 leading digits, then zero-or-more .DDD groups, then
# ,DD. Rejects concatenated/garbled captures instead of stripping dots blindly.
_SPANISH_MONEY_RE = re.compile(r"^\d{1,3}(?:\.\d{3})*,\d{2}$")
_NO_BID_RE = re.compile(r"no\s+ha\s+recibido\s+pujas", re.IGNORECASE)
_SIN_PUJA_RE = re.compile(r"\bsin\s+puja\b", re.IGNORECASE)


@dataclass
class PujasResult:
    """Normalized outcome of one ver=5 parse.

    sale_result:       ADJUDICADA | DESIERTA | None (undetermined this pass)
    sold_price_cents:  int cents when ADJUDICADA with a scrapeable amount, else None
                       (ADJUDICADA + None cents = "con puja, amount hidden" — rare
                        for concluded anonymous fetches, kept honest).
    per_lote:          {lote_number(int): (sale_result, cents|None)} for multi-lote
                       tables; empty for single-lote pages.
    """
    sale_result: Optional[str] = None
    sold_price_cents: Optional[int] = None
    per_lote: Dict[int, "PujasResult"] = None  # type: ignore

    def __post_init__(self):
        if self.per_lote is None:
            self.per_lote = {}


def eur_to_cents(eur_str: str) -> Optional[int]:
    """Spanish-formatted EUR ("92.234,16" / "1.358.200,00") -> int cents.

    Grouping-VALIDATED: the string must be well-formed Spanish money (strict
    1-3 / .DDD groups / ,DD). A malformed or concatenated capture (e.g. two
    amounts run together, which breaks 3-digit grouping or carries two commas)
    returns None — an honest miss — instead of silently stripping every dot and
    yielding an absurd giant int. This is the source-level guard against the
    thousands-separator / concatenation misparse class.
    """
    if not eur_str:
        return None
    s = eur_str.strip().replace(" ", "")
    if not _SPANISH_MONEY_RE.match(s):
        return None
    try:
        return int(round(float(s.replace(".", "").replace(",", ".")) * 100))
    except (ValueError, TypeError):
        return None


def _block_soup(html: str):
    """Return a BeautifulSoup rooted at the pujas block, or None if absent."""
    if not html or BeautifulSoup is None:
        return None
    soup = BeautifulSoup(html, "lxml")
    block = soup.find(id=_PUJAS_BLOCK_ID)
    return block


def _parse_single_block(block) -> PujasResult:
    """Shape A: single amount in <strong class="destaca"> or a 'no ha recibido pujas'."""
    text = block.get_text(" ", strip=True)
    # Desierta wins first (an amount regex could otherwise match stray digits).
    if _NO_BID_RE.search(text):
        return PujasResult(sale_result=DESIERTA)
    strong = block.find("strong", class_="destaca")
    if strong:
        m = _AMOUNT_RE.search(strong.get_text(" ", strip=True))
        if m:
            cents = eur_to_cents(m.group(1))
            if cents is not None:
                return PujasResult(sale_result=ADJUDICADA, sold_price_cents=cents)
    # Fallthrough: block present but no amount and no explicit no-bid -> undetermined
    # (this is the genuine authority-wipe / amount-replaced case).
    return PujasResult(sale_result=None)


def _parse_table_block(block) -> PujasResult:
    """Shape B: <h4>Pujas máximas</h4> table, one row per lote."""
    per_lote: Dict[int, PujasResult] = {}
    table = block.find("table")
    if table is None:
        return PujasResult(sale_result=None)
    for tr in table.find_all("tr"):
        lote_cell = tr.find("td", attrs={"headers": "lote"})
        amt_cell = tr.find("td", attrs={"headers": "cantidad"})
        if lote_cell is None or amt_cell is None:
            continue
        try:
            lote_no = int(re.sub(r"\D", "", lote_cell.get_text(strip=True)))
        except (ValueError, TypeError):
            continue
        cell_txt = amt_cell.get_text(" ", strip=True)
        if _SIN_PUJA_RE.search(cell_txt) or _NO_BID_RE.search(cell_txt):
            per_lote[lote_no] = PujasResult(sale_result=DESIERTA)
            continue
        m = _AMOUNT_RE.search(cell_txt)
        if m:
            cents = eur_to_cents(m.group(1))
            if cents is not None:
                per_lote[lote_no] = PujasResult(sale_result=ADJUDICADA, sold_price_cents=cents)
                continue
        per_lote[lote_no] = PujasResult(sale_result=None)
    return PujasResult(sale_result=None, per_lote=per_lote)


def parse_pujas_html(html: str, id_lote: Optional[int] = None) -> PujasResult:
    """
    Parse a ver=5 "Pujas" page. Returns a PujasResult.

    - Single-lote page  -> top-level sale_result/sold_price_cents set.
    - Multi-lote table   -> per_lote populated. If `id_lote` is given, the matching
      lote's result is ALSO lifted to the top level (sale_result/sold_price_cents)
      so single-lote callers get a flat answer. If `id_lote` is None on a table,
      only per_lote is populated (caller decides how to aggregate).
    - Block absent / undetermined -> sale_result=None (caller: NULL + attempt++).
    """
    block = _block_soup(html)
    if block is None:
        return PujasResult(sale_result=None)

    # Distinguish shapes by the block's own heading / table presence.
    heading = block.find(["h4", "h3"])
    heading_txt = heading.get_text(" ", strip=True).lower() if heading else ""
    is_table = ("pujas máximas" in heading_txt or "pujas maximas" in heading_txt
                or block.find("table") is not None)

    if is_table:
        res = _parse_table_block(block)
        if id_lote is not None and id_lote in res.per_lote:
            lote_res = res.per_lote[id_lote]
            res.sale_result = lote_res.sale_result
            res.sold_price_cents = lote_res.sold_price_cents
        return res

    return _parse_single_block(block)
