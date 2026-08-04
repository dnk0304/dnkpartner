"""
ADDRFIELD (2026-08-04) — non-address content must not reach `Auction.address`.

Fixtures are VERBATIM strings from the rows the URL-v3 descriptor guard caught at
mint time, plus the corpus rows the guard never looked at. Each test names the
defect class it pins:

  D1  label-in-prose      — "…en la siguiente dirección: https://…" (P1 unanchored)
  D2  street-token-in-prose — `CR` matching a licence plate / car model (P3)
  D3  bare street type    — "Avda" harvested from the BOE site footer (P3)
  D4  BOE source defect   — e-justice CSV stamp bled into the Dirección cell
  D5  BOE source defect   — a taxi licence / vehicle record IN the address cell

Both directions are asserted: known-bad in -> clean out, and known-good in ->
byte-identical out.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scraper.scrapers.boe_scraper import extract_address  # noqa: E402


# --------------------------------------------------------------------------
# D1 — the word "dirección" in prose means "web address"
# --------------------------------------------------------------------------

def test_d1_web_address_boilerplate_is_not_an_address():
    """SUB-RC-2022-1400100122038 minted the Hacienda-local URL as its address."""
    text = (
        "Bien 1 - Inmueble (Finca rustica)\n"
        "Descripcion\nfinca registral 13999 del termino de Montilla\n"
        "    Se puede consultar la WEB del Organismo en la siguiente "
        "direccion: https://www.haciendalocal.es/anunciossobreenajenaciondetalle\n"
    )
    out = extract_address(text)
    assert out is not None
    assert "http" not in out
    assert "haciendalocal" not in out


def test_d1_cell_label_still_wins():
    """The same word AT THE START OF A CELL is still the canonical address."""
    text = "Direccion\tCALLE ALTO TEJEDORES N9\nLocalidad\tPeralta\n"
    assert extract_address(text) == "CALLE ALTO TEJEDORES N9, Peralta"


# --------------------------------------------------------------------------
# D2 — `CR` in prose is a plate / a car model, not "carretera"
# --------------------------------------------------------------------------

@pytest.mark.parametrize("blob", [
    "Matricula: CR-8348-X Marca: Citroen. Modelo: Berlingo",   # SUB-JA-2024-227468
    "CR-2171-Z",                                              # SUB-JA-2023-222245
    "CR-3870-Y",                                              # SUB-JA-2016-15190
])
def test_d2_plate_prose_yields_no_address(blob):
    assert extract_address(blob) is None


def test_d2_structured_carretera_cell_is_untouched():
    """`CR ADANERO 30` arrives via the Direccion CELL and must survive."""
    assert extract_address("Direccion\tCR ADANERO 30\n") == "CR ADANERO 30"


# --------------------------------------------------------------------------
# D3 — a bare street type is not an address
# --------------------------------------------------------------------------

@pytest.mark.parametrize("blob", ["Avda", "Ctra", "LG", "C.P", "finca", "Pza"])
def test_d3_bare_street_type_yields_none(blob):
    assert extract_address(blob) is None


def test_d3_boe_site_footer_never_becomes_an_address():
    """The BOE page footer carries 'Avda. de Manoteras, 54'.

    On WHOLE-PAGE input the prose fallback is disabled, so the footer can never
    be mined for a street.
    """
    page = (
        "Portal de Subastas\nSubasta SUB-JA-2020-145159\n"
        "Descripcion\nLICENCIA DE AUTOTAXI N 12.767\n"
        "Agencia Estatal Boletin Oficial del Estado\n"
        "Avda. de Manoteras, 54 - 28050 Madrid\n"
    )
    assert extract_address(page, prose_fallback=False) is None


def test_d3_real_street_with_short_words_survives():
    """The min-length rule must not eat 'PASEO DE LAS DELICIAS'."""
    out = extract_address("PASEO DE LAS DELICIAS N 101-103 -3C EXTERIOR DE MADRID")
    assert out is not None and out.startswith("PASEO DE LAS DELICIAS")


# --------------------------------------------------------------------------
# D4 — e-justice document stamp bled into BOE's own Direccion cell
# --------------------------------------------------------------------------

def test_d4_csv_stamp_is_excised_and_the_street_survives():
    """SUB-JA-2025-242513 — the stamp is spliced INTO the street."""
    text = (
        "Direccion\nForma parte del edificio en las calles Antonio Castillo, "
        "Doctor Creus, Aurelio Serrano y Enrique Codigo Seguro de Verificacion "
        "E04799402-MI:uWgK-k7aw-KBzD-EVVR-D Puede verificar este documento en "
        "https://www.administraciondejusticia.gob.es Fernande\n"
    )
    out = extract_address(text)
    assert out is not None
    assert "E04799402" not in out
    assert "administraciondejusticia" not in out
    assert "Codigo Seguro" not in out
    assert out.startswith("Forma parte del edificio en las calles Antonio Castillo")
    assert out.endswith("Fernande")


def test_d4_gva_csv_stamp_excised_without_eating_the_street_name():
    """SUB-JA-2025-247149 — the street name follows the stamp; keep it."""
    text = (
        "Direccion\nPL O-1 FILIPINAS 5D ES:2 PL: 00, PT:12 RES "
        "CSV:M95DJ4BD:GP1C91I7:PVEQ2VNP URL de validacion:"
        "https://www.tramita.gva.es/csv-front/index.faces?cadena=M95DJ4BD "
        "MONTEGOLF VII\n"
    )
    out = extract_address(text)
    assert "CSV" not in out and "http" not in out
    assert "MONTEGOLF VII" in out


# --------------------------------------------------------------------------
# D5 — movable-goods identity written into the address cell
# --------------------------------------------------------------------------

@pytest.mark.parametrize("cell", [
    "LICENCIA DE AUTOTAXI N 12.767 INSCRIPCION: BIEN N 20150040488, MATRICULA 5751GTS",
    "BIEN N 20150017885, LICENCIA DE TAXI N 6558 DEL AYUNTAMIENTO DE MADRID, MATRICULA E6037HTP",
    "C.ABIERTA, matricula 7200CRD, bastidor WDB67603415599761",
])
def test_d5_vehicle_identity_cell_yields_honest_null(cell):
    assert extract_address("Direccion\t%s\n" % cell) is None


def test_d5_housing_registry_code_is_not_a_plate():
    """`matricula SE-62` is a social-housing group code, NOT a licence plate.

    The mint-time slug guard could not tell them apart and over-stripped it; at
    extraction time we still have the digits, and SE-62 has no 4-digit group.
    """
    cell = (
        "Numero 15, vivienda cuarto B de la casa numero 9, bloque 91 del Grupo "
        "de Viviendas denominado General Merry matricula SE-62, Poligono Sur"
    )
    out = extract_address("Direccion\t%s\n" % cell)
    assert out == cell


# --------------------------------------------------------------------------
# Bien-type heading is a property type, not a street
# --------------------------------------------------------------------------

def test_bien_type_heading_is_not_mined_for_a_street():
    text = "Bien 1 - Inmueble (Finca rustica)\nDescripcion\nsin mas datos\n"
    out = extract_address(text)
    assert out is None or "Finca rustica)" not in out
