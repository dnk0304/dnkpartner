"""
Lightweight requests-only ver=5 "Pujas" fetcher (Ghost, 2026-07-17).

Shared by BOTH the daily post-close re-scrape (scheduler.recheck_sale_results,
Mechanism 2) and the one-time historical backfill (backfill_sale_results.py,
Mechanism 3), so the fetch + selectors never drift between them.

Why requests, not Playwright: the ver=5 page is anonymous, server-rendered
static HTML with NO captcha / login / JS gate (verified live). A ~200k backfill
through the full browser `_navigate_and_extract` (which also downloads docs and
renders snapshot PDFs) would be catastrophically slow and hammer BOE. A plain
GET + BeautifulSoup parse is ~1 req/s-friendly and unattended-resumable.

Fetch key (brief-locked): the base portal id is split_part(boeId,'-L',1);
`sourceIdSub` is null/unreliable on ~191k legacy rows, so we NEVER drive off it.
The '-L<n>' suffix (if any) is the lote number, passed to the parser to lift the
correct row out of the multi-lote "Pujas máximas" table.
"""
from __future__ import annotations

import random
import re
import time
from typing import Optional, Tuple

import requests

try:  # leaf import — works as package module and as top-level in-container
    from .pujas_result_parser import parse_pujas_html, PujasResult
except ImportError:  # pragma: no cover
    from pujas_result_parser import parse_pujas_html, PujasResult  # type: ignore

DETAIL_URL = "https://subastas.boe.es/detalleSubasta.php"
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")
_LOTE_RE = re.compile(r"-L(\d+)$")


def split_boe_id(boe_id: str) -> Tuple[str, Optional[int]]:
    """boeId -> (base idSub, lote_number|None). 'SUB-JA-2026-259908-L2' ->
    ('SUB-JA-2026-259908', 2). Mirrors split_part(boeId,'-L',1)."""
    m = _LOTE_RE.search(boe_id or "")
    if m:
        return boe_id[: m.start()], int(m.group(1))
    return boe_id, None


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": _UA, "Accept-Language": "es-ES,es;q=0.9"})
    return s


def fetch_pujas_result(session: requests.Session, boe_id: str,
                       *, timeout: float = 30.0,
                       jitter: Tuple[float, float] = (0.8, 1.6)) -> Optional[PujasResult]:
    """
    GET the ver=5 page for `boe_id` and parse it. Returns a PujasResult, or None
    on a network/HTTP failure (caller treats None as an undetermined pass ->
    attempt++ via update_sale_result). Politeness sleep AFTER the request.

    The returned PujasResult has sale_result/sold_price_cents set for both
    single-lote pages and (via id_lote lift) '-L<n>' lote rows.
    """
    idsub, lote = split_boe_id(boe_id)
    url = f"{DETAIL_URL}?idSub={idsub}&ver=5"
    if lote is not None:
        url = f"{DETAIL_URL}?idSub={idsub}&idLote={lote}&ver=5"
    try:
        resp = session.get(url, timeout=timeout)
        if resp.status_code != 200 or not resp.text:
            return None
        return parse_pujas_html(resp.text, id_lote=lote)
    except requests.RequestException:
        return None
    finally:
        time.sleep(random.uniform(*jitter))
