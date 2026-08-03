"""
Proof for the two scraper geo bugs (Ghost, 2026-08-03), per Ken's dispatch
DISPATCH-BRIEF-GHOST-PILOT-scraper-fixes-and-2k-refetch.md and RULING §1.

BUG 1 — batch/court province stamped onto every row of a scrape batch
        (boe_scraper.py `self.province` -> `province`).
BUG 2 — municipality resolved by substring-scanning the WHOLE page against a
        hardcoded 18-big-city list, which returned the COURT's city.

Each test states the OLD (broken) behaviour it would have exhibited.
Run (from subastas/): python -m pytest scraper/tests/test_geo_authority_fix.py -q
"""
import re
import pytest

from scraper.scrapers.boe_scraper import derive_property_province, apply_property_geo
from scraper.config.municipality_province import (
    derive_municipality_from_address, geo_cross_check,
)


# The literal old implementation, kept here so the tests prove a real DELTA
# rather than merely asserting the new behaviour.
_OLD_18 = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga',
           'Murcia', 'Palma', 'Las Palmas de Gran Canaria', 'Bilbao',
           'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Gijón', 'Granada',
           'Tenerife', 'Gran Canaria']


def _old_extract_municipality(text):
    for m in _OLD_18:
        if m.lower() in text.lower():
            return m
    return None


# A real-shaped BOE detail blob: an El Ejido (Almería) property whose auction is
# managed by a Sevilla court. This is the exact corpus failure mode.
PAGE_TEXT = (
    "Portal de Subastas - Agencia Estatal Boletín Oficial del Estado\n"
    "Autoridad gestora: Juzgado de Primera Instancia N.º 3 de Sevilla\n"
    "Datos del bien subastado\n"
    "Dirección: CL MAYOR 3, 04710, El Ejido, Almería\n"
)


# --------------------------------------------------------------------------
# BUG 2 — municipality
# --------------------------------------------------------------------------

def test_bug2_old_code_returned_the_courts_city():
    """Baseline: the old 18-city scan reads 'Sevilla' off the COURT name."""
    assert _old_extract_municipality(PAGE_TEXT) == 'Sevilla'


def test_bug2_fixed_resolver_returns_the_property_town():
    town, prov, method = derive_municipality_from_address(PAGE_TEXT)
    assert town == 'El Ejido'
    assert prov == 'Almería'
    assert method == 'address-town'


def test_bug2_town_outside_the_18_is_now_reachable():
    """The old list structurally guaranteed sin-municipio for any other town."""
    town, _p, _m = derive_municipality_from_address('Avda del Mar 5, Níjar')
    assert town == 'Níjar'
    assert _old_extract_municipality('Avda del Mar 5, Níjar') is None


def test_bug2_street_named_after_a_city_is_not_a_town():
    """'CL Sevilla 4, 04001' is a STREET in Almería, not the town Sevilla."""
    assert _old_extract_municipality('CL Sevilla 4, 04001') == 'Sevilla'
    assert derive_municipality_from_address('CL Sevilla 4, 04001')[0] is None


def test_bug2_unknown_stays_none_never_a_big_city():
    assert derive_municipality_from_address('sin datos')[0] is None


# --------------------------------------------------------------------------
# BUG 1 — province authority order (Ken RULING §1)
# --------------------------------------------------------------------------

def test_bug1_postcode_outranks_everything():
    """RULING §1.1: postalCode is deterministic and beats bienProvincia."""
    prov, src = derive_property_province(
        bien_provincia='Sevilla',      # contradicted by the postcode
        postal_code='04710',           # 04 = Almería
        bien_localidad=None,
        court_province='Sevilla',
    )
    assert (prov, src) == ('Almería', 'postalCode')


def test_bug1_bienprovincia_is_second():
    prov, src = derive_property_province('Almería', None, None, 'Sevilla')
    assert (prov, src) == ('Almería', 'bienProvincia')


def test_bug1_address_is_used_before_the_court():
    prov, src = derive_property_province(
        None, None, None, 'Sevilla',
        address='CL MAYOR 3, 04710, El Ejido, Almería')
    assert (prov, src) == ('Almería', 'address')


def test_bug1_court_province_is_never_an_authority_and_is_flagged():
    """The court value may be carried (NOT NULL) but must be flagged, not trusted."""
    prov, src = derive_property_province(None, None, None, 'Sevilla')
    assert src == 'court-fallback'
    rec = {'boe_id': 'X', 'province': 'Sevilla'}
    prov_info = apply_property_geo(rec)
    assert prov_info['geo_flag'] is True
    assert prov_info['province_source'] == 'court-fallback'


# --------------------------------------------------------------------------
# End-to-end on the failing row shape
# --------------------------------------------------------------------------

def test_endtoend_batch_stamped_row_is_corrected():
    """
    The corpus failure: batch province 'Sevilla' stamped on an Almería property.
    Old code kept Sevilla/Sevilla. New code must yield Almería/El Ejido, unflagged.
    """
    rec = {
        'boe_id': 'SUB-AT-2026-25R4186001887',
        'province': 'Sevilla',          # <- the batch stamp (Bug 1)
        'municipality': 'Sevilla',      # <- the 18-city scan (Bug 2)
        'address': 'CL MAYOR 3, 04710, El Ejido, Almería',
        'postal_code': '04710',
        'bien_localidad': 'El Ejido',
        'bien_provincia': 'Almería',
    }
    info = apply_property_geo(rec)
    assert rec['province'] == 'Almería'
    assert rec['municipality'] == 'El Ejido'
    assert info['province_source'] == 'postalCode'
    assert info['municipality_source'] == 'bienLocalidad'
    assert info['geo_flag'] is False


def test_endtoend_control_a_correct_row_is_not_corrupted():
    """A fix that damages already-good rows is worse than the bug."""
    rec = {
        'boe_id': 'CTRL-1',
        'province': 'Madrid',
        'municipality': 'Getafe',
        'address': 'Calle Ciempozuelos 12, 28905, Getafe, Madrid',
        'postal_code': '28905',
        'bien_localidad': 'Getafe',
        'bien_provincia': 'Madrid',
    }
    info = apply_property_geo(rec)
    assert (rec['province'], rec['municipality']) == ('Madrid', 'Getafe')
    assert info['geo_flag'] is False


def test_endtoend_dead_page_leaves_geo_untouched():
    """
    A stub/dead BOE page yields no bien fields. The row must keep its existing
    province/municipality — never be blanked (SAFETY §2).
    """
    rec = {'boe_id': 'STUB-1', 'province': 'Madrid', 'municipality': 'Getafe'}
    info = apply_property_geo(rec)
    assert rec['province'] == 'Madrid'
    assert rec['municipality'] == 'Getafe'   # not nulled
    assert info['geo_flag'] is True          # but honestly flagged as unproven


def test_crosscheck_flags_disagreement_instead_of_picking():
    """RULING §1: disagreement flags the row; it does not silently choose."""
    agrees, detail = geo_cross_check(
        'Sevilla', 'Sevilla', 'CL MAYOR 3, 04710, El Ejido, Almería')
    assert agrees is False and 'Almer' in detail
    assert geo_cross_check('Almería', 'El Ejido',
                           'CL MAYOR 3, 04710, El Ejido, Almería')[0] is True
    # Silence is not disagreement.
    assert geo_cross_check('Sevilla', 'Sevilla', None)[0] is True
