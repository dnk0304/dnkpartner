#!/usr/bin/env python3
"""
Tests for the 3f2ea9c sanitizer regression fix (2026-07-08).

Bug: _PAGE_DUMP_TOKENS token 'iniciar sesi' false-positived on the LEGIT
logged-out login footer ("Para consultar la información complementaria debe
Iniciar sesión en el Portal de Subastas.") rendered INSIDE the ver=3
"Datos del bien subastado" block on login-gated rows (esp. AEAT) ->
bienes_info=None -> address/lotDescription/cadastral never written.

Fix under test:
  1. _extract_section_text skips sibling-level `.caja.gris.info` / footer <h5>.
  2. _strip_login_footer removes the footer sentence + bare label line from the
     extracted bien blob BEFORE _sanitize_extracted_text (nested-footer case).
  3. 'iniciar sesi' STAYS in _PAGE_DUMP_TOKENS (genuine page dumps rejected).
  4. auction_data['address'] write is un-gated from the bienes_info gate.

Fixture: live snapshot of SUB-AT-2026-26R3586001010 ver=3 (fetched 2026-07-08),
which carries the footer + Dirección "AV TIRAJANAS DE LAS 199 1 SM 4" +
cadastral 5695301DR5759S0004FU.

Run from subastas/:  python -m pytest scraper/tests/test_sanitizer_footer_fix.py -v
"""

import os
import re
import sys
import pytest

# Import the scraper package with its relative imports intact: add the
# directory ABOVE `scraper/` so `scraper` resolves as a package.
_SCRAPER_PARENT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _SCRAPER_PARENT not in sys.path:
    sys.path.insert(0, _SCRAPER_PARENT)

from scraper.scrapers.boe_scraper import (  # noqa: E402
    BOEScraper,
    extract_address,
    extract_cadastral_refs,
    parse_bien_fields,
)

FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "SUB-AT-2026-26R3586001010_ver3.html"
)

FOOTER_SENTENCE_RE = re.compile(r"para\s+consultar\s+la\s+informaci", re.IGNORECASE)


def _fixture_html():
    with open(FIXTURE, encoding="utf-8") as f:
        return f.read()


def _fixture_html_no_footer():
    """Regression-guard variant: same page with the login footer removed."""
    html = _fixture_html()
    html = re.sub(
        r"<h5>Informaci&#xF3;n complementaria del bien</h5>", "", html
    )
    html = re.sub(
        r'<div class="caja gris info">.*?</div>', "", html, flags=re.DOTALL
    )
    assert "caja gris info" not in html
    return html


# ---------------------------------------------------------------------------
# Pure-Python belt-and-braces layer (no browser needed)
# ---------------------------------------------------------------------------

class TestStripLoginFooter:
    BIEN_WITH_FOOTER = (
        "Bien 1 - Inmueble (Garaje)\n"
        "Descripción\tURBANA. Nº 4. PLAZA DE GARAJE ... REFERENCIA CATASTRAL\n"
        "Referencia catastral\t5695301DR5759S0004FU\n"
        "Dirección\tAV TIRAJANAS DE LAS 199 1 SM 4\n"
        "Código Postal\t35110\n"
        "Localidad\tSANTA LUCIA\n"
        "Provincia\tLas Palmas\n"
        "Información complementaria del bien\n"
        "Para consultar la información complementaria debe Iniciar sesión "
        "en el Portal de Subastas.\n"
    )

    def test_footer_stripped_and_blob_survives_sanitizer(self):
        stripped = BOEScraper._strip_login_footer(self.BIEN_WITH_FOOTER)
        assert stripped is not None
        assert not FOOTER_SENTENCE_RE.search(stripped)
        assert "iniciar sesi" not in stripped.lower()
        assert "Información complementaria del bien" not in stripped
        # The real bien content survives...
        assert "AV TIRAJANAS DE LAS 199 1 SM 4" in stripped
        assert "5695301DR5759S0004FU" in stripped
        # ...and now passes the sanitizer that used to nuke the whole blob.
        out = BOEScraper._sanitize_extracted_text(stripped, enforce_length=False)
        assert out is not None
        assert "AV TIRAJANAS" in out

    def test_without_footer_is_a_noop(self):
        clean = self.BIEN_WITH_FOOTER.split("Información complementaria")[0].strip()
        assert BOEScraper._strip_login_footer(clean) == clean

    def test_none_and_empty(self):
        assert BOEScraper._strip_login_footer(None) is None
        assert BOEScraper._strip_login_footer("") == ""

    def test_genuine_page_dump_still_rejected(self):
        # A real page dump (nav + JS clock + login chrome, but NOT the
        # "Para consultar..." footer sentence) must STILL be rejected:
        # the fix is upstream exclusion, not weakening the sanitizer.
        dump = (
            "Inicio Buscar Ayuda Iniciar sesión\n"
            "var hoy = new Date();\nfunction reloj() { ... }\n"
            "Subastas Portal de Subastas Agencia Estatal BOE\n" * 5
        )
        stripped = BOEScraper._strip_login_footer(dump)
        assert BOEScraper._sanitize_extracted_text(stripped, enforce_length=False) is None
        # And 'iniciar sesi' is still an active token on its own.
        assert (
            BOEScraper._sanitize_extracted_text(
                "chrome Iniciar sesión chrome", enforce_length=False
            )
            is None
        )
        assert "iniciar sesi" in BOEScraper._PAGE_DUMP_TOKENS

    def test_footer_only_blob_becomes_none(self):
        footer_only = (
            "Información complementaria del bien\n"
            "Para consultar la información complementaria debe Iniciar sesión "
            "en el Portal de Subastas."
        )
        assert BOEScraper._strip_login_footer(footer_only) is None


# ---------------------------------------------------------------------------
# Real-DOM extraction on the live-page fixture (playwright)
# ---------------------------------------------------------------------------

playwright = pytest.importorskip("playwright.sync_api")


@pytest.fixture(scope="module")
def page():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        pg = browser.new_page()
        yield pg
        browser.close()


def _extract_bienes(page, html):
    page.set_content(html)
    bienes = BOEScraper._extract_section_text(None, page, "Datos del bien subastado")
    bienes = BOEScraper._strip_login_footer(bienes)
    return BOEScraper._sanitize_extracted_text(bienes, enforce_length=False)


class TestFixtureExtraction:
    def test_footer_page_yields_full_bienes_info(self, page):
        bienes = _extract_bienes(page, _fixture_html())
        # The old code returned None here (whole blob token-rejected).
        assert bienes is not None
        assert not FOOTER_SENTENCE_RE.search(bienes)
        assert "iniciar sesi" not in bienes.lower()
        # Dirección survives (innerText collapses space runs).
        fields = parse_bien_fields(bienes)
        assert fields.get("postal_code") == "35110"
        addr = extract_address(bienes)
        assert addr and "AV TIRAJANAS DE LAS" in addr and "199" in addr
        # Cadastral ref survives.
        ref, _data = extract_cadastral_refs(bienes)
        assert ref == "5695301DR5759S0004FU"

    def test_no_footer_page_unchanged(self, page):
        """Regression guard: pages WITHOUT the footer behave exactly as before."""
        bienes = _extract_bienes(page, _fixture_html_no_footer())
        assert bienes is not None
        addr = extract_address(bienes)
        assert addr and "AV TIRAJANAS DE LAS" in addr
        ref, _data = extract_cadastral_refs(bienes)
        assert ref == "5695301DR5759S0004FU"

    def test_footer_and_no_footer_agree(self, page):
        a = _extract_bienes(page, _fixture_html())
        b = _extract_bienes(page, _fixture_html_no_footer())
        assert a == b


# ---------------------------------------------------------------------------
# Address un-gate: bienes_info=None but detail address present -> written
# ---------------------------------------------------------------------------

class _FakeLocator:
    def __init__(self, text="", href=None, n=1):
        self._text, self._href, self._n = text, href, n

    def count(self):
        return self._n

    def inner_text(self):
        return self._text

    def get_attribute(self, name):
        return self._href

    @property
    def first(self):
        return self


class _FakeElement:
    """Minimal stand-in for the Playwright listing-card locator."""

    def locator(self, selector):
        if "titulo" in selector:
            return _FakeLocator("SUBASTA DE PRUEBA", n=1)
        if selector == "a":
            return _FakeLocator(
                href="detalleSubasta.php?idSub=SUB-AT-2026-26R3586001010", n=1
            )
        return _FakeLocator(n=0)

    def inner_text(self):
        return (
            "SUBASTA DE PRUEBA\nValor: 10.000,00 €\n"
            "Fecha de conclusión: 01-08-2026 18:00:00"
        )


class TestAddressUngate:
    def test_address_written_when_bienes_info_none(self, monkeypatch):
        scraper = BOEScraper.__new__(BOEScraper)  # skip browser/db init
        scraper.province = "Las Palmas"
        detail = scraper._empty_detail_info("SUB-AT-2026-26R3586001010")
        assert detail["bienes_info"] is None
        detail["address"] = "AV TIRAJANAS DE LAS 199 1 SM 4"
        monkeypatch.setenv("BOE_FETCH_DETAIL", "1")
        monkeypatch.setattr(scraper, "_fetch_detail_info", lambda boe_id: detail)

        data = scraper.parse_listing(_FakeElement())
        assert data is not None
        # THE fix: address lands even though bienes_info is None...
        assert data["address"] == "AV TIRAJANAS DE LAS 199 1 SM 4"
        # ...while lot_description honestly stays absent.
        assert not data.get("lot_description")

    def test_no_address_no_write(self, monkeypatch):
        scraper = BOEScraper.__new__(BOEScraper)
        scraper.province = "Las Palmas"
        detail = scraper._empty_detail_info("SUB-AT-2026-26R3586001010")
        monkeypatch.setattr(scraper, "_fetch_detail_info", lambda boe_id: detail)
        data = scraper.parse_listing(_FakeElement())
        assert data is not None
        assert "address" not in data
