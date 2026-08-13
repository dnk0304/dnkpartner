"""Offline tests for the BOE closure-certificate reader.

Fixtures are verbatim text extracted from real certificate PDFs
(https://subastas.boe.es/verCertificadoCierre.php?idSub=...) on 2026-08-13.
"""

import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scraper.scrapers.closure_certificate import parse_closure_event, pdf_to_text  # noqa: E402


REAL_CANCELLED = """CERTIFICACION DE CIERRE DE SUBASTA EN EL PORTAL DE
SUBASTAS ELECTRONICAS
SUBASTA SUB-JA-2018-104799
Cuenta expediente: 0118 0000 05 2752 10
Modalidad de subasta: separada por lotes
Evolucion de la subasta:
Publicacion en BOE: 20/10/2018
Apertura: 23/10/2018 18:00:00  (ISO: 2018-10-23T18:00:00+02:00)
Suspension: 09/11/2018 08:57:05  (ISO: 2018-11-09T08:57:05+01:00) (fecha prevista
de reanudacion 29/11/2018 00:00:00  (ISO: 2018-11-29T00:00:00+01:00))
Cancelacion: 27/11/2018 11:57:59  (ISO: 2018-11-27T11:57:59+01:00)
Resultado de la subasta:
La subasta ha sido cancelada
27 de Noviembre de 2018
"""


def test_cancellation_wins_over_suspension_and_opening():
    ev = parse_closure_event(REAL_CANCELLED)
    assert ev is not None
    assert ev.kind == "CANCELADA"
    # NOT the apertura (23/10) and NOT the suspension (09/11) and NOT the
    # "fecha prevista de reanudacion" (29/11).
    assert ev.ends_at == datetime(2018, 11, 27, 11, 57, 59)
    assert ev.source == "human"


def test_conclusion_label_is_accepted():
    text = "Evolucion de la subasta:\nApertura: 01/03/2021 18:00:00\nConclusion: 21/03/2021 18:00:00  (ISO: 2021-03-21T18:00:00+01:00)\n"
    ev = parse_closure_event(text)
    assert ev.kind == "CONCLUIDA"
    assert ev.ends_at == datetime(2021, 3, 21, 18, 0, 0)


def test_madrid_wall_time_not_utc():
    """endsAt is a naive Madrid wall-time column: the human field is taken
    as-is and the ISO offset must NOT shift it (2026-08-04 resumeAt incident)."""
    text = "Cancelacion: 15/07/2022 14:30:00  (ISO: 2022-07-15T14:30:00+02:00)\n"
    assert parse_closure_event(text).ends_at == datetime(2022, 7, 15, 14, 30, 0)


def test_suspension_alone_is_not_terminal():
    text = ("Evolucion de la subasta:\nApertura: 23/10/2018 18:00:00\n"
            "Suspension: 09/11/2018 08:57:05\n")
    assert parse_closure_event(text) is None


def test_no_certificate_text_is_honest_null():
    assert parse_closure_event("") is None
    assert parse_closure_event("Portal de Subastas del BOE") is None


def test_future_and_pre_portal_dates_rejected():
    assert parse_closure_event("Cancelacion: 01/01/2099 10:00:00") is None
    assert parse_closure_event("Cancelacion: 01/01/1999 10:00:00") is None


def test_impossible_calendar_date_rejected():
    assert parse_closure_event("Cancelacion: 31/02/2020 10:00:00") is None


def test_date_without_time_is_midnight_of_that_day():
    ev = parse_closure_event("Cancelacion: 27/11/2018")
    assert ev.ends_at == datetime(2018, 11, 27, 0, 0, 0)


def test_label_and_date_across_a_line_break():
    ev = parse_closure_event("Cancelacion:\n  27/11/2018 11:57:59")
    assert ev.ends_at == datetime(2018, 11, 27, 11, 57, 59)


def test_pdf_to_text_rejects_non_pdf_bytes():
    assert pdf_to_text(b"<html>not a pdf</html>") == ""
    assert pdf_to_text(b"") == ""


@pytest.mark.parametrize("accented", [
    "Cancelación: 27/11/2018 11:57:59",
    "CANCELACIÓN: 27/11/2018 11:57:59",
])
def test_accents_and_casing(accented):
    assert parse_closure_event(accented).ends_at == datetime(2018, 11, 27, 11, 57, 59)
