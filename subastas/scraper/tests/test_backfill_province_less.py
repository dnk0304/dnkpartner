"""
Unit tests for the province-less backfill derivation logic.

Run with (from subastas/):
    python -m pytest scraper/tests/test_backfill_province_less.py -q

Covers the FILLABLE vs UNKNOWABLE decision the backfill makes for a province-less
row — the guarantee that it fills ONLY when an authoritative signal (bienProvincia
/ postalCode / bienLocalidad) resolves to a REAL Spanish province, and NEVER
guesses otherwise.
"""

from scraper.backfill_province_less import classify_province_less, JUNK_PROVINCE_SQL


# ── FILLABLE: an authoritative signal resolves to a real province ────────────

def test_fillable_via_bien_provincia():
    prov, src = classify_province_less("Barcelona", None, None, "Unknown")
    assert src == "bienProvincia"
    assert prov == "Barcelona"


def test_fillable_via_bien_provincia_accent_case_folded():
    # canonical_province folds accents/case -> the exact provinces.py spelling.
    prov, src = classify_province_less("álava", None, None, "")
    assert src == "bienProvincia"
    assert prov == "Álava"


def test_fillable_via_postal_code_prefix():
    # 28xxx = Madrid (INE province code 28), even with no bienProvincia.
    prov, src = classify_province_less(None, "28013", None, "")
    assert src == "postalCode"
    assert prov == "Madrid"


def test_fillable_via_bien_localidad_town_map():
    prov, src = classify_province_less(None, None, "Madrid", "Unknown")
    assert src == "bienLocalidad"
    assert prov == "Madrid"


def test_priority_bien_provincia_beats_postal():
    # Most-reliable signal wins when several are present.
    prov, src = classify_province_less("Sevilla", "28013", "Madrid", "Unknown")
    assert src == "bienProvincia"
    assert prov == "Sevilla"


# ── UNKNOWABLE: nothing authoritative -> never guess, leave untouched ─────────

def test_unknowable_when_all_signals_absent():
    assert classify_province_less(None, None, None, "Unknown") == (None, None)


def test_unknowable_when_signals_are_junk():
    # A junk bienProvincia, an out-of-range postal, and an unmapped town all fail
    # to resolve to a real province -> unknowable, never fabricated.
    assert classify_province_less("NotAProvince", "99999", "ZZZNOWHERE", "") == (None, None)


def test_unknowable_ignores_empty_string_signals():
    assert classify_province_less("", "", "", "") == (None, None)


def test_never_returns_court_province_even_if_present():
    # A real-looking court province must NOT be used to fill (court-fallback is
    # explicitly excluded — the backfill fills only from PROPERTY signals).
    prov, src = classify_province_less(None, None, None, "Madrid")
    assert (prov, src) == (None, None)


# ── The junk-province predicate matches the app's isValidProvince inverse ─────

def test_junk_predicate_targets_inscope_and_covers_sentinels():
    sql = JUNK_PROVINCE_SQL.lower()
    assert '"inscope" = true' in sql            # only in-scope rows
    assert "province is null" in sql            # empty
    assert "length(trim(province)) <= 1" in sql  # 1-char / whitespace
    for sentinel in ["unknown", "desconocida", "mapa de la zona",
                     "mapa del municipio", "null", "undefined"]:
        assert sentinel in sql, sentinel
