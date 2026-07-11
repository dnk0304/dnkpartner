"""
Unit tests for catastro_client — offline, mocked responses (no network).

    python -m pytest subastas/scraper/tests/test_catastro_client.py -q

Covers: checksum validation (real valid + real defect refs), and DNPRC response
handling for OK / cod 4 (malformed) / cod 5 (no existe) / timeout.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scrapers"))

from catastro_client import (  # noqa: E402
    consulta_dnprc,
    control_letters,
    is_valid_cadastral_ref,
    parse_dnprc_response,
)

# Real refs from the active pool (crefs.txt) that PASS the checksum + the API.
VALID_REFS = [
    "4601910YL1440B0001JP",
    "1278614CF4517G0001GZ",
    "4430616TP8242N0011ZD",
    "3866901WF3736N0004AR",
]

# The 7 stored refs that FAIL the checksum — VERIFIED live to all return cod 4
# (corrupt at the BOE source, faithfully extracted; not a parser bug).
DEFECT_REFS = [
    "1585712EG0215N0024AX",
    "5704702CF2450D0006SA",
    "8843802UF8684S0020GM",
    "5297606VK4579G0008WO",
    "5033340VJ6053S0001RZ",
    "2722842CF8622S0023RF",
    "1722842CF8622S0005SX",
]


# ---- checksum -------------------------------------------------------------

def test_valid_refs_pass_checksum():
    for r in VALID_REFS:
        assert is_valid_cadastral_ref(r), r


def test_defect_refs_fail_checksum():
    for r in DEFECT_REFS:
        assert not is_valid_cadastral_ref(r), r


def test_control_letters_match_stored():
    # The control letters recomputed from a valid ref's first 18 chars equal its
    # last 2 chars.
    for r in VALID_REFS:
        assert control_letters(r[:18]) == r[18:]


def test_bad_length_and_empty_rejected():
    assert not is_valid_cadastral_ref(None)
    assert not is_valid_cadastral_ref("")
    assert not is_valid_cadastral_ref("1234")            # too short
    assert not is_valid_cadastral_ref("1585712EG0215N0024AX0")  # 21 chars


def test_whitespace_and_case_tolerated():
    r = VALID_REFS[0]
    assert is_valid_cadastral_ref(" " + r.lower() + " ")


# ---- parse_dnprc_response (pure) ------------------------------------------

OK_BODY = ('{"consulta_dnprcResult":{"bico":{"bi":{"debi":'
           '{"sfc":"140","ant":"2011","luso":"Residencial"}}}}}')
COD4_BODY = ('{"consulta_dnprcResult":{"lerr":[{"cod":"4",'
             '"des":"LA REFERENCIA CATASTRAL NO ESTA CORRECTAMENTE FORMADA"}]}}')
COD5_BODY = ('{"consulta_dnprcResult":{"lerr":[{"cod":"5",'
             '"des":"NO EXISTE EL INMUEBLE"}]}}')


def test_parse_ok():
    r = parse_dnprc_response(OK_BODY)
    assert r.status == "ok"
    assert r.surface_m2 == 140.0
    assert r.year_built == 2011
    assert r.use == "Residencial"


def test_parse_cod4_malformed():
    r = parse_dnprc_response(COD4_BODY)
    assert r.status == "malformed"
    assert r.cod == 4
    assert r.surface_m2 is None and r.year_built is None and r.use is None


def test_parse_cod5_not_found():
    r = parse_dnprc_response(COD5_BODY)
    assert r.status == "not_found"
    assert r.cod == 5


def test_parse_invalid_json_is_error():
    r = parse_dnprc_response("<html>gateway timeout</html>")
    assert r.status == "error"


def test_parse_missing_debi_is_ok_no_data():
    # A 14-char parcel or empty payload -> ok but no usable data (not an error).
    r = parse_dnprc_response('{"consulta_dnprcResult":{"bico":{"bi":{}}}}')
    assert r.status == "ok"
    assert r.surface_m2 is None and r.year_built is None


def test_parse_comma_decimal_surface():
    r = parse_dnprc_response(
        '{"consulta_dnprcResult":{"bico":{"bi":{"debi":{"sfc":"52,50"}}}}}'
    )
    assert r.surface_m2 == 52.5


# ---- consulta_dnprc with injected fetch -----------------------------------

def test_consulta_ok_with_mock_fetch():
    calls = []

    def fake_fetch(url, timeout):
        calls.append(url)
        return OK_BODY

    r = consulta_dnprc(VALID_REFS[0], fetch=fake_fetch)
    assert r.status == "ok" and r.year_built == 2011
    assert VALID_REFS[0] in calls[0]


def test_consulta_cod5_with_mock_fetch():
    r = consulta_dnprc(VALID_REFS[0], fetch=lambda u, t: COD5_BODY)
    assert r.status == "not_found"


def test_consulta_bad_checksum_short_circuits_no_fetch():
    called = {"n": 0}

    def fake_fetch(url, timeout):
        called["n"] += 1
        return OK_BODY

    r = consulta_dnprc(DEFECT_REFS[0], fetch=fake_fetch)
    assert r.status == "checksum"
    assert called["n"] == 0  # no HTTP request spent on a bad-checksum ref


def test_consulta_timeout_retries_once_then_error():
    called = {"n": 0}

    def timeout_fetch(url, timeout):
        called["n"] += 1
        raise TimeoutError("timed out")

    r = consulta_dnprc(VALID_REFS[0], fetch=timeout_fetch)
    assert r.status == "error"
    assert called["n"] == 2  # initial try + one retry
