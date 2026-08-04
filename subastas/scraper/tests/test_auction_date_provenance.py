"""
DATEFALLBACK — an auction date may only come from a LABELLED auction-date field.

Every string below is pinned to real corpus data: the four rows repaired on
2026-08-04 (snapshot `ghost_zombie_endsat_snapshot_20260804`) plus the BOE
conclusion-date rendering verified live on 2026-06-02.

The defect these lock down: `_extract_end_date` carried a bare, unlabelled
`(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})` fallback that harvested the first
date-shaped string in the search-result card. `endsAt` drives the expiry sweep
and is copied into `soldDate` by the freeze, so a harvested notary/vehicle date
can conclude — and publish a sale date for — an auction that never ran.
"""
import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scraper.scrapers.boe_scraper import BOEScraper  # noqa: E402


@pytest.fixture(scope="module")
def extract():
    return BOEScraper.__dict__["_extract_end_date"].__get__(
        BOEScraper.__new__(BOEScraper), BOEScraper
    )


# --- the four repaired rows: prose dates that MUST NOT become auction dates ---

FABRICATION_CORPUS = [
    # SUB-JV-2026-264770 -> was endsAt 2011-07-07
    ("SUB-JV-2026-264770",
     "TURISMO marca SEAT, modelo IBIZA. Fecha de matriculacion: 07-07-2011. "
     "Bastidor VSSZZZ6KZ1R000000."),
    # SUB-JV-2026-264487 -> was endsAt 2014-02-03
    ("SUB-JV-2026-264487",
     "VEHICULO turismo. Fecha de matriculacion: 03-02-2014"),
    # SUB-JV-2026-264727 -> was endsAt 2018-04-24
    ("SUB-JV-2026-264727",
     "Fecha de matriculacion: 24-04-2018"),
    # SUB-JA-2026-265122 -> was endsAt 2004-09-29
    ("SUB-JA-2026-265122",
     "Escritura publica otorgada con fecha 29/09/2004 ante el notario de "
     "Valencia."),
]


@pytest.mark.parametrize("boe_id,prose", FABRICATION_CORPUS)
def test_prose_dates_never_become_auction_dates(extract, boe_id, prose):
    assert extract(prose) is None, boe_id


# --- other unlabelled / wrongly-labelled dates in the wild ---

@pytest.mark.parametrize("prose", [
    "Inscrita en el Registro de la Propiedad, tomo 1856, con fecha 12/03/1998",
    "Decreto de adjudicacion de 05-11-2021",
    "Finca adquirida por compraventa el 14/07/2009",
    # "Fin"/"Hasta"/"Finaliza" are ordinary Spanish words, not BOE labels.
    "la calle finaliza 03/04/2020 en el lindero norte",
    "Hasta 25-01-2026 el inmueble permanecio arrendado",
    "Fin: 25/01/2026",
])
def test_unlabelled_and_nonauction_labels_yield_none(extract, prose):
    assert extract(prose) is None


# --- the real label still works, and keeps its time component ---

def test_conclusion_label_with_time():
    s = BOEScraper.__dict__["_extract_end_date"].__get__(
        BOEScraper.__new__(BOEScraper), BOEScraper
    )
    # BOE card rendering, verified live 2026-06-02.
    assert s("Fecha de conclusion 01-06-2026 20:18:03 CET") == \
        datetime(2026, 6, 1, 20, 18, 3)
    assert s("Fecha de conclusión: 15/06/2026") == datetime(2026, 6, 15)
    assert s("Fecha de finalización 03-02-2026 12:00:00") == \
        datetime(2026, 2, 3, 12, 0, 0)
    assert s("Fecha de fin 03-02-2026") == datetime(2026, 2, 3)


def test_a_real_label_is_not_shadowed_by_an_earlier_prose_date(extract):
    """The old bare fallback matched the FIRST date in the card; the label must
    win regardless of position."""
    text = (
        "Fecha de matriculacion: 07-07-2011 - TURISMO SEAT IBIZA. "
        "Fecha de conclusion 01-06-2026 20:18:03 CET"
    )
    assert extract(text) == datetime(2026, 6, 1, 20, 18, 3)


def test_impossible_calendar_date_is_none(extract):
    assert extract("Fecha de conclusion 31-02-2026") is None


def test_empty_and_dateless(extract):
    assert extract("") is None
    assert extract(None) is None
    assert extract("Finca urbana sin fechas de ningun tipo") is None


# --- the +7d placeholder is gone: no invented endsAt in the listing record ---

def test_listing_record_has_no_invented_ends_at():
    import inspect
    from scraper.scrapers import boe_scraper

    src = inspect.getsource(boe_scraper.BOEScraper.parse_listing)
    # Strip comments — the removal is documented in prose right where it
    # happened, and that prose necessarily names the value it removed.
    code = "\n".join(
        ln for ln in src.splitlines() if not ln.lstrip().startswith("#")
    )
    assert "timedelta(days=7)" not in code, (
        "parse_listing must not fabricate an endsAt; honest-NULL only"
    )
    assert "'ends_at': ends_at," in code
