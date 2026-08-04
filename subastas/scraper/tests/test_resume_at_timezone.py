"""
RESUMEAT-TZ — `resumeAt` must carry Madrid WALL TIME, not a UTC-normalised value.

`Auction.resumeAt` is `timestamp without time zone`, and every other date on the
row stores Madrid wall time (`_extract_detail_date` discards the ISO offset in
both of its branches). The ISO branch of `_extract_suspension_info` returned a
tz-AWARE datetime, which a naive column normalises to UTC on write — BOE's
"12:00:00 CET" landed as 10:00:00, two hours early, on 160 of 164 stored rows.

Fixtures are verbatim BOE suspension blocks fetched live on 2026-08-04 from the
five rows in ghost_invented_solddate_incident_20260804.
"""
import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scraper.scrapers.boe_scraper import BOEScraper  # noqa: E402


@pytest.fixture(scope="module")
def extract():
    return BOEScraper.__dict__["_extract_suspension_info"].__get__(
        BOEScraper.__new__(BOEScraper), BOEScraper
    )


# Verbatim live BOE blocks -> the wall time BOE printed.
LIVE_CORPUS = [
    ("SUB-JA-2026-260022",
     "La subasta se encuentra temporalmente suspendida .\n"
     "Fecha de reanudación prevista: 22-09-2026 12:00:00 CET "
     "(ISO: 2026-09-22T12:00:00+02:00)",
     datetime(2026, 9, 22, 12, 0, 0), None),
    ("SUB-RC-2026-28010001S2512",
     "La subasta se encuentra temporalmente suspendida .\n"
     "Fecha de reanudación prevista: 06-10-2026 12:00:00 CET "
     "(ISO: 2026-10-06T12:00:00+02:00)",
     datetime(2026, 10, 6, 12, 0, 0), None),
    # WINTER date -> +01:00 offset. The old bug shifted this by 1h, not 2h,
    # so a single-offset "fix" would have been wrong for half the year.
    ("SUB-RC-2026-3800100126004",
     "La subasta se encuentra temporalmente suspendida "
     "(FASE PRECONCURSAL DEL SUJETO PASIVO) .\n"
     "Fecha de reanudación prevista: 06-03-2027 12:00:00 CET "
     "(ISO: 2027-03-06T12:00:00+01:00)",
     datetime(2027, 3, 6, 12, 0, 0), "FASE PRECONCURSAL DEL SUJETO PASIVO"),
    ("SUB-JA-2025-252987",
     "La subasta se encuentra temporalmente suspendida "
     "(Decreto 25.3.26, suspensión por justicia gratuita y fiot 11.6.26) .\n"
     "Fecha de reanudación prevista: 14-09-2026 12:00:00 CET "
     "(ISO: 2026-09-14T12:00:00+02:00)",
     datetime(2026, 9, 14, 12, 0, 0),
     "Decreto 25.3.26, suspensión por justicia gratuita y fiot 11.6.26"),
]


@pytest.mark.parametrize("boe_id,block,expected_dt,expected_motive", LIVE_CORPUS)
def test_resume_at_is_madrid_wall_time(extract, boe_id, block, expected_dt, expected_motive):
    resume_at, motive = extract(block)
    assert resume_at == expected_dt, boe_id
    assert motive == expected_motive, boe_id


@pytest.mark.parametrize("boe_id,block,expected_dt,_m", LIVE_CORPUS)
def test_resume_at_is_naive(extract, boe_id, block, expected_dt, _m):
    """An aware value written to a `timestamp without time zone` column is
    silently normalised to UTC. The extractor must never hand one over."""
    resume_at, _ = extract(block)
    assert resume_at is not None, boe_id
    assert resume_at.tzinfo is None, f"{boe_id}: aware datetime would shift on write"


def test_iso_and_ddmm_branches_agree(extract):
    """The two branches of this function must not disagree by the UTC offset —
    that divergence WAS the bug."""
    iso_form = ("Fecha de reanudación prevista: 22-09-2026 12:00:00 CET "
                "(ISO: 2026-09-22T12:00:00+02:00)")
    ddmm_only = "Fecha de reanudación prevista: 22-09-2026 12:00:00 CET"
    assert extract(iso_form)[0] == extract(ddmm_only)[0] == datetime(2026, 9, 22, 12, 0, 0)


def test_honest_null(extract):
    assert extract("") == (None, None)
    assert extract("La subasta se encuentra temporalmente suspendida .")[0] is None
    # bare suspension, no parenthetical -> motive honest-NULL
    assert extract("La subasta se encuentra temporalmente suspendida .")[1] is None
