"""
Unit tests for the DETERMINISTIC court-town -> province fill.

Run with (from subastas/):
    python -m pytest scraper/tests/test_backfill_court_province.py -q

Covers the structured, jurisdictional fill (not free-text address parsing):
  - court-suffix extraction from "JUZGADO … - <TOWN>",
  - court-town -> province via the gazetteer (incl. co-official + province names),
  - AEAT / tax bodies -> NULL,
  - ambiguous / unmappable court-towns -> NULL (flagged, never guessed).
"""

from scraper.config.municipality_province import (
    court_town_from_name, court_province_from_name,
)


# ── suffix extraction ────────────────────────────────────────────────────────

def test_extract_town_from_dash_suffix():
    assert court_town_from_name("JUZGADO DE PRIMERA INSTANCIA E INSTRUCCION N. 3 - TORREVIEJA") == "TORREVIEJA"
    assert court_town_from_name("JUZGADO DE LO MERCANTIL Nº 1 - BARCELONA") == "BARCELONA"


def test_extract_multiword_town():
    assert court_town_from_name("JUZGADO DE LO MERCANTIL - JEREZ DE LA FRONTERA") == "JEREZ DE LA FRONTERA"
    assert court_town_from_name("JUZGADO DE PRIMERA INSTANCIA - VILANOVA I LA GELTRU") == "VILANOVA I LA GELTRU"


def test_no_suffix_returns_none():
    assert court_town_from_name("JUZGADO DE PRIMERA INSTANCIA Nº 4") is None
    assert court_town_from_name("") is None
    assert court_town_from_name(None) is None


def test_aeat_tax_body_has_no_town():
    assert court_town_from_name(
        "AGENCIA ESTATAL DE ADMINISTRACION TRIBUTARIA - DELEGACION DE MADRID") is None


# ── town -> province (province-level fill) ───────────────────────────────────

def test_resolve_common_court_towns():
    assert court_province_from_name("JUZGADO N. 3 - TORREVIEJA") == ("Alicante", "TORREVIEJA", "ok")
    assert court_province_from_name("JUZGADO Nº 5 - MADRID") == ("Madrid", "MADRID", "ok")
    assert court_province_from_name("JUZGADO N.1 - NULES") == ("Castellón", "NULES", "ok")


def test_resolve_co_official_court_town():
    prov, town, flag = court_province_from_name("JUZGADO - VILANOVA I LA GELTRU")
    assert (prov, flag) == ("Barcelona", "ok")


def test_resolve_bare_province_name_suffix():
    # "… - CASTELLON" / "… - GIRONA" — the suffix is itself a province name.
    assert court_province_from_name("JUZGADO N.1 - CASTELLON")[0] == "Castellón"
    assert court_province_from_name("JUZGADO N.2 - GIRONA")[0] == "Girona"


# ── NULL paths — never guess ─────────────────────────────────────────────────

def test_aeat_resolves_to_null_no_town():
    assert court_province_from_name(
        "AGENCIA ESTATAL DE ADMINISTRACION TRIBUTARIA - DELEGACION DE SEVILLA") == (None, None, "no-town")


def test_ambiguous_court_town_is_null_and_flagged():
    # Cieza exists in Murcia AND Cantabria; from the town alone we must NOT guess.
    prov, town, flag = court_province_from_name("JUZGADO DE PRIMERA INSTANCIA N.1 - CIEZA")
    assert prov is None and flag == "ambiguous" and town == "CIEZA"


def test_unmappable_court_town_is_null_and_flagged():
    prov, town, flag = court_province_from_name("JUZGADO N.1 - ZZZNOWHERE")
    assert prov is None and flag == "unmappable"


def test_no_suffix_court_is_null():
    assert court_province_from_name("JUZGADO DE PRIMERA INSTANCIA Nº 4") == (None, None, "no-town")


# ── widen (wave166): short/regional/co-official court-town spellings resolve ──
# The wave165 prod map left 3,140 rows unmappable on 134 distinct court-towns whose
# suffix uses an article/connector-stripped or co-official/abbreviated spelling.
# Resolution now routes through the co-official INE index (article-inversion +
# connector-stripped) and a curated, human-verified partido-override map. Each of
# these MUST resolve to the correct province (never wrong, never ambiguous-away).

def _court_prov(town):
    return court_province_from_name(f"JUZGADO DE PRIMERA INSTANCIA N.1 - {town}")[0]


def test_widened_index_recovered_spellings():
    # Recovered via the gazetteer's article-inversion / connector-stripping.
    assert _court_prov("EJIDO") == "Almería"              # El Ejido
    assert _court_prov("JEREZ FRONTERA") == "Cádiz"        # Jerez de la Frontera
    assert _court_prov("ARENYS MAR") == "Barcelona"        # Arenys de Mar
    assert _court_prov("SANLUCAR BARRAMEDA") == "Cádiz"     # Sanlúcar de Barrameda
    assert _court_prov("ALCALA HENARES") == "Madrid"        # Alcalá de Henares


def test_widened_curated_override_spellings():
    # Co-official / partido abbreviations resolved via the verified override map.
    assert _court_prov("ELX") == "Alicante"
    assert _court_prov("VILAFRANCA PENEDES") == "Barcelona"
    assert _court_prov("BISBAL") == "Girona"
    assert _court_prov("VIELHA") == "Lleida"
    assert _court_prov("LOS CRISTIANOS") == "Santa Cruz de Tenerife"
    assert _court_prov("PLAYA LOS CRISTIANOS") == "Santa Cruz de Tenerife"


def test_widening_does_not_break_ambiguous_or_aeat():
    # Genuinely ambiguous court-town still NULL + flagged (never guessed).
    assert court_province_from_name("JUZGADO N.1 - CIEZA")[2] == "ambiguous"
    # AEAT still has no town suffix.
    assert court_province_from_name(
        "AGENCIA ESTATAL DE ADMINISTRACION TRIBUTARIA - DELEGACION DE MADRID")[2] == "no-town"
    # A truly unknown court-town is still unmappable, not a wrong guess.
    assert court_province_from_name("JUZGADO N.1 - ZZZNOWHERE")[2] == "unmappable"
