"""
Unit tests for the province-less backfill + ingestion derivation logic.

Run with (from subastas/):
    python -m pytest scraper/tests/test_backfill_province_less.py -q

Covers the shared resolve_province_less() decision (used by BOTH the backfill and
the ingestion guard): fill ONLY when address / municipality / bien* resolve to a
REAL Spanish province, and NEVER guess otherwise. Ken's prod dry-run proved the
recoverable signal lives in `address` (93% populated) and `municipality`, not the
bien*/postal columns, so the address parser is the primary path under test.
"""

from scraper.backfill_province_less import classify_province_less, JUNK_PROVINCE_SQL, SOURCE_KEYS
from scraper.config.municipality_province import (
    derive_province_from_address, resolve_province_less, municipality_to_province,
    court_province_hint, _INE_UNAMBIGUOUS, _AMBIGUOUS_TOWNS, _AMBIGUOUS_CANDIDATES,
)


# ── COURT / SOURCE tiebreaker for ambiguous towns (deep pass) ─────────────────

def test_court_hint_parses_province_from_juzgado():
    assert court_province_hint("Juzgado de Primera Instancia N.º 2 de Cáceres") == "Cáceres"
    assert court_province_hint("Juzgado de lo Mercantil N.º 1 de Alicante") == "Alicante"
    # court city that is a small town resolves to its province
    assert court_province_hint("Juzgado de 1ª Instancia e Instrucción N.º 1 de Nules") == "Castellón"
    # multi-"de" city name
    assert court_province_hint("Juzgado de lo Mercantil N.º 1 de Jerez de la Frontera") == "Cádiz"
    assert court_province_hint("") is None
    assert court_province_hint(None) is None


def test_ambiguous_resolves_with_matching_court_province():
    # Arroyomolinos = {Madrid, Cáceres}; the court province picks the right one.
    assert _AMBIGUOUS_CANDIDATES["arroyomolinos"] == frozenset({"Madrid", "Cáceres"})
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos",
        court_name="Juzgado de 1ª Instancia N.º 2 de Cáceres",
    ) == ("Cáceres", "court-disambig")
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos",
        court_name="Juzgado N.º 5 de Madrid",
    ) == ("Madrid", "court-disambig")
    # ambiguous MUNICIPALITY field + court also resolves
    assert resolve_province_less(
        municipality="Cieza", court_name="Juzgado N.º 1 de Murcia",
    ) == ("Murcia", "court-disambig")


def test_court_not_among_candidates_never_overrides():
    # Court points to Sevilla, which is NOT a candidate of Arroyomolinos
    # (Madrid/Cáceres) -> flagged as a conflict, row left UNKNOWABLE (no wrong fill).
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos",
        court_name="Juzgado N.º 1 de Sevilla",
    ) == (None, "court-conflict")


def test_ambiguous_without_court_signal_stays_unknowable():
    assert resolve_province_less(address="Calle Real 1, Arroyomolinos") == (None, None)
    assert resolve_province_less(address="Calle Real 1, Arroyomolinos", court_name="") == (None, None)
    # a court whose city/province cannot be parsed gives no hint -> unknowable
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos", court_name="Notaría número 3",
    ) == (None, None)


def test_court_never_overrides_a_confident_address():
    # An unambiguous address must NOT be second-guessed by a court in another province.
    assert resolve_province_less(
        address="C/ X, Torrevieja", court_name="Juzgado N.º 1 de Madrid",
    ) == ("Alicante", "address-town")


# ── FULL INE register loaded (2026-07-28) ────────────────────────────────────

def test_full_ine_register_loaded():
    # The complete register must be present (thousands of towns), not a partial list.
    assert len(_INE_UNAMBIGUOUS) > 7500
    assert len(_AMBIGUOUS_TOWNS) >= 1


def test_newly_covered_small_towns():
    # Small towns the old partial map missed now resolve (unambiguous single-province).
    assert municipality_to_province("Nules") == "Castellón"
    assert municipality_to_province("Olivenza") == "Badajoz"
    assert derive_province_from_address("Calle Mayor 2, 12520 Nules")[0] == "Castellón"
    assert derive_province_from_address("Plaza de España, Olivenza")[0] == "Badajoz"


# ── DUPLICATE / AMBIGUOUS town names — correctness > coverage ─────────────────

def test_ambiguous_town_unknowable_without_disambiguator():
    # Arroyomolinos exists in Madrid AND Cáceres; Cieza in Murcia AND Cantabria.
    # From the town name alone we must NOT guess.
    assert municipality_to_province("Arroyomolinos") is None
    assert municipality_to_province("Cieza") is None
    assert derive_province_from_address("Calle Real 1, Arroyomolinos") == (None, None)
    assert resolve_province_less(address="Av X, Cieza") == (None, None)


def test_ambiguous_town_resolves_with_postal():
    # A postal-code prefix disambiguates (higher-priority signal).
    assert derive_province_from_address("Calle Real 1, 28939 Arroyomolinos") == ("Madrid", "address-postal")
    assert derive_province_from_address("Av X, 30530 Cieza") == ("Murcia", "address-postal")


def test_ambiguous_town_resolves_with_explicit_province():
    # An explicit province name in the address disambiguates.
    assert derive_province_from_address("Calle Real 1, Arroyomolinos, Cáceres") == ("Cáceres", "address-province")
    assert derive_province_from_address("Calle Real 1, Arroyomolinos (Madrid)") == ("Madrid", "address-province")


# ── address -> province extraction (the primary path) ────────────────────────

def test_address_trailing_town():
    # Coordinator's exact example — trailing town wins over the street.
    assert derive_province_from_address("avinguda de alicante, 20, Torrevieja") == ("Alicante", "address-town")


def test_address_postal_code_anywhere():
    assert derive_province_from_address("Calle Sevilla 3, 28013 Madrid") == ("Madrid", "address-postal")


def test_address_explicit_province_name():
    assert derive_province_from_address("Av. de Andalucía, Sevilla") == ("Sevilla", "address-province")


def test_address_province_in_parentheses():
    assert derive_province_from_address("C/ Mayor 5, Torrevieja (Alicante)") == ("Alicante", "address-province")


def test_address_ambiguous_street_name_does_not_win():
    # "Sevilla" is a STREET here; the trailing town "Madrid" must win (right-to-
    # left scan) — the derivation must not be fooled by a province word in a street.
    prov, _ = derive_province_from_address("Calle Sevilla 3, Madrid")
    assert prov == "Madrid"


# ── island provinces (Las Palmas / Santa Cruz de Tenerife) ───────────────────

def test_island_las_palmas_by_town():
    prov, _ = derive_province_from_address("35100 Maspalomas, Las Palmas de Gran Canaria")
    assert prov == "Las Palmas"


def test_island_tenerife_by_postal():
    prov, _ = derive_province_from_address("Calle del Sol, 38400 Puerto de la Cruz")
    assert prov == "Santa Cruz de Tenerife"


def test_multiword_province_a_coruna():
    prov, _ = derive_province_from_address("Rúa do Vilar, Santiago de Compostela, A Coruña")
    assert prov == "A Coruña"


# ── UNKNOWABLE — never guess ─────────────────────────────────────────────────

def test_address_unresolvable_is_unknowable():
    assert derive_province_from_address("Calle Falsa 123") == (None, None)


def test_empty_address_is_unknowable():
    assert derive_province_from_address("") == (None, None)
    assert derive_province_from_address(None) == (None, None)


# ── resolve_province_less source priority (address -> municipality -> bien*) ──

def test_resolve_prefers_address_over_municipality():
    prov, src = resolve_province_less(address="C/ X, 41013 Sevilla", municipality="Madrid")
    assert (prov, src) == ("Sevilla", "address-postal")


def test_resolve_falls_back_to_municipality():
    prov, src = resolve_province_less(address="Calle Falsa 1", municipality="Avilés")
    assert (prov, src) == ("Asturias", "municipality")


def test_resolve_falls_back_to_bien_provincia():
    prov, src = resolve_province_less(address=None, municipality=None, bien_provincia="Barcelona")
    assert (prov, src) == ("Barcelona", "bienProvincia")


def test_resolve_all_absent_is_unknowable():
    assert resolve_province_less() == (None, None)


def test_court_province_is_never_used_to_fill():
    # A real-looking court province must NOT fill — it's the junk we're replacing.
    assert resolve_province_less(address=None, court_province="Madrid") == (None, None)


# ── classify_province_less wraps resolve_province_less ────────────────────────

def test_classify_matches_resolve():
    assert classify_province_less(address="avinguda de alicante, 20, Torrevieja") == ("Alicante", "address-town")


def test_source_keys_cover_all_reported_sources():
    assert set(SOURCE_KEYS) == {
        "address-postal", "address-province", "address-town",
        "municipality", "court-disambig",
        "bienProvincia", "postalCode", "bienLocalidad",
    }


# ── junk-province predicate ──────────────────────────────────────────────────

def test_junk_predicate_targets_inscope_and_covers_sentinels():
    sql = JUNK_PROVINCE_SQL.lower()
    assert '"inscope" = true' in sql
    assert "province is null" in sql
    assert "length(trim(province)) <= 1" in sql
    for sentinel in ["unknown", "desconocida", "mapa de la zona",
                     "mapa del municipio", "null", "undefined"]:
        assert sentinel in sql, sentinel
