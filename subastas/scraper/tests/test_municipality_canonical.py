"""Tests for the ingest-side municipality canonicaliser (MUNI-B task 4).

Every REJECT case below is a real, measured error from the 2026-08-13 corpus pass,
not a hypothetical.
"""
import pytest

from scraper.config.municipality_canonical import (
    municipality_key,
    resolve_municipality,
    canonical_municipality_for_province,
    uninvert,
)


# --------------------------------------------------------------------------- #
# keys
# --------------------------------------------------------------------------- #
def test_key_uninverts_ine_trailing_article():
    assert municipality_key("Ejido, El") == municipality_key("El Ejido")
    assert municipality_key("Coruña, A") == municipality_key("A Coruña")


def test_key_folds_punctuation_and_accents():
    assert municipality_key("Vitoria-Gasteiz") == municipality_key("Vitoria Gasteiz")
    assert municipality_key("L'Alcúdia") == municipality_key("l Alcudia")


def test_uninvert_handles_cooofficial_segments():
    assert uninvert("Ejido, El") == "El Ejido"
    assert uninvert("Vila Joiosa, la/Villajoyosa") == "la Vila Joiosa/Villajoyosa"


# --------------------------------------------------------------------------- #
# resolution tiers
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("name,province,expected_tier", [
    ("Madrid", "Madrid", "T1_EXACT"),
    ("San Sebastian", "Gipuzkoa", "T1_EXACT"),          # co-official alias
    ("Ejido (el)", "Almería", "T2_PAREN_ARTICLE"),      # parenthesised article
    ("Alcala Henares", "Madrid", "T3_PARTICLES"),       # dropped particle
    ("Arganda", "Madrid", "T4_TRUNCATION"),             # truncation
    ("Santa Coloma de Gramanet", "Barcelona", "T5_FUZZY"),
])
def test_resolves_with_expected_tier(name, province, expected_tier):
    display, ine, tier = resolve_municipality(name, province)
    assert tier == expected_tier
    assert display and ine


@pytest.mark.parametrize("name,province,expected", [
    ("Madrid", "Madrid", "Madrid"),
    ("Ejido (el)", "Almería", "El Ejido"),
    ("Alcala Henares", "Madrid", "Alcalá de Henares"),
    ("Arganda", "Madrid", "Arganda del Rey"),
    ("Santa Coloma de Gramanet", "Barcelona", "Santa Coloma de Gramenet"),
    ("Rozas de Madrid (las)", "Madrid", "Las Rozas de Madrid"),
])
def test_canonical_display_names(name, province, expected):
    assert canonical_municipality_for_province(name, province) == expected


def test_long_typos_resolve_to_the_real_town():
    """Long enough that a 1-edit neighbour cannot be a different real town."""
    for typo in ("Fuenalbrada", "Fuenlbrada", "Mostoleds"):
        display, _ine, _tier = resolve_municipality(typo, "Madrid")
        assert display in ("Fuenlabrada", "Móstoles"), f"{typo} -> {display}"


def test_short_typos_are_refused_even_when_obvious_to_a_human():
    """'Madrd'/'Madrdi' are obviously Madrid to a reader, but at 5-6 characters a
    1-edit neighbour is as likely to be a different real municipality, so the name
    tier must refuse. These are recovered only when a postcode independently
    agrees (the two-source rung), never by edit distance alone."""
    for typo in ("Madrd", "Madrdi", "Madri"):
        display, _ine, tier = resolve_municipality(typo, "Madrid")
        assert display is None, f"{typo} -> {display}"
        assert tier == "FUZZY_BELOW_BAR"


# --------------------------------------------------------------------------- #
# guards -- each of these was a real, high-volume wrong answer
# --------------------------------------------------------------------------- #
def test_province_name_is_not_its_capital():
    """'Castellon' in Castellón is the province, not Castelló de la Plana (703 rows)."""
    display, _ine, tier = resolve_municipality("Castellon", "Castellón")
    assert display is None
    assert tier == "REJECT_PROVINCE_NAME"


def test_island_name_is_not_its_capital():
    """An island is a region, not a truncation of the island capital.

    'Tenerife' (242 rows) is caught by the province-name guard first, since the
    province is literally 'Santa Cruz de Tenerife'; 'Mallorca'/'Ibiza' exercise the
    island guard proper. Either refusal is correct -- what matters is that no
    island name mints a municipality.
    """
    display, _ine, tier = resolve_municipality("Tenerife", "Santa Cruz de Tenerife")
    assert display is None
    assert tier in ("REJECT_ISLAND_NAME", "REJECT_PROVINCE_NAME")

    for island in ("Mallorca", "Ibiza", "Menorca"):
        display, _ine, tier = resolve_municipality(island, "Illes Balears")
        assert display is None, f"{island} -> {display}"
        assert tier == "REJECT_ISLAND_NAME"


def test_truncation_must_keep_the_head_token():
    """'La Cañada' must not become 'Zapardiel de la Cañada'."""
    display, _ine, tier = resolve_municipality("La Cañada", "Ávila")
    assert display is None
    assert tier == "REJECT_NO_HEAD_TOKEN"


def test_districts_are_never_invented_as_municipalities():
    """Madrid districts are not municipalities and must not fuzzy-match a real town.

    Unguarded these landed on Carabaña / Valdilecha / Ajalvir -- all wrong.
    """
    for district in ("Carabanchel Alto", "Puente de Vallecas", "Vallecas",
                     "Villaverde", "Aravaca", "Vicalvaro", "Las Matas"):
        display, _ine, _tier = resolve_municipality(district, "Madrid")
        assert display is None, f"{district} was invented as {display}"


def test_short_names_below_the_fuzzy_bar_are_refused():
    """Real municipalities sit 1 edit apart (Ibi/Tibi, Monda/Ronda), so a short
    string must never be 'corrected'."""
    for short in ("Ara", "Vil", "Rux"):
        display, _ine, tier = resolve_municipality(short, "Madrid")
        assert display is None, f"{short} -> {display}"


def test_unknown_province_is_honest_none():
    assert canonical_municipality_for_province("Madrid", "Atlantis") is None
    assert canonical_municipality_for_province("", "Madrid") is None
    assert canonical_municipality_for_province(None, "Madrid") is None


def test_never_returns_a_name_outside_the_register():
    """The whole point: output is always an INE name or None."""
    for junk in ("Msdrid", "XYZQW", "1234", "Poligono Industrial Norte"):
        display, ine, _tier = resolve_municipality(junk, "Madrid")
        assert (display is None) == (ine is None)


def test_cross_province_name_does_not_leak():
    """'Sestao' (Bizkaia) under Madrid must not resolve to the Bizkaia town."""
    display, _ine, _tier = resolve_municipality("Sestao", "Madrid")
    assert display != "Sestao"
