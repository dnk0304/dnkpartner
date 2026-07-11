"""
Unit tests for property_attribute_parser — runnable offline, no network / DB.

    python -m pytest subastas/scraper/tests/test_property_attribute_parser.py -q

Covers the 5 canonical SUB-* snippets from GHOST-FINDINGS.md plus negation /
generic-noun / floor-level / honest-NULL edge cases pulled read-only from prod
prose. Honest-NULL is asserted explicitly (None, never 0 / False).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scrapers"))

from property_attribute_parser import (  # noqa: E402
    parse_property_attributes,
    set_property_attribute_fields,
)


# ---- The 5 canonical snippets from GHOST-FINDINGS.md ----------------------

def test_sub_ss_195_three_bedrooms_bath_terrace():
    a = parse_property_attributes(
        "DEPENDENCIAS: VESTIBULO, ESTAR-COMEDOR, TRES DORMITORIOS, "
        "DISTRIBUIDOR, BAÑO, COCINA, TERRAZA PRINCIPAL Y LAVADERO"
    )
    assert a["bedrooms"] == 3
    assert a["bathrooms"] == 1
    assert a["has_terrace"] is True
    assert a["has_garage"] is None
    assert a["has_storage_room"] is None


def test_sub_ja_262543_bedrooms_storage_bath():
    a = parse_property_attributes(
        "distribuida en vestíbulo, comedor, tres dormitorios, trastero, "
        "cocina y cuarto de baño"
    )
    assert a["bedrooms"] == 3
    assert a["bathrooms"] == 1
    assert a["has_storage_room"] is True


def test_sub_ja_264049_bare_singular_dormitorio_enumerated():
    # A single bare "dormitorio" inside a distribución list counts as 1.
    a = parse_property_attributes(
        "porche de entrada, distribuidor, cocina, baño, estar-comedor, "
        "dormitorio y escalera"
    )
    assert a["bedrooms"] == 1
    assert a["bathrooms"] == 1


def test_sub_ja_259850_cuarto_de_bano_and_terrace():
    a = parse_property_attributes(
        "comedor, cocina, terraza-lavadero, un cuarto de baño, tres dormitorios, "
        "distribuidor y terraza"
    )
    assert a["bedrooms"] == 3
    assert a["bathrooms"] == 1
    assert a["has_terrace"] is True


def test_sub_ja_264000_two_bedrooms_bath_terrace():
    a = parse_property_attributes(
        "distribuidos en vestíbulo, estar-comedor, dos dormitorios, cocina, "
        "baño y terraza"
    )
    assert a["bedrooms"] == 2
    assert a["bathrooms"] == 1
    assert a["has_terrace"] is True


# ---- Bathroom summing (baño + aseo) --------------------------------------

def test_bano_plus_aseo_sums():
    a = parse_property_attributes(
        "salon-comedor, cocina, tres dormitorios, baño, aseo y terraza"
    )
    assert a["bedrooms"] == 3
    assert a["bathrooms"] == 2  # 1 baño + 1 aseo
    assert a["has_terrace"] is True


def test_two_bathrooms_and_garage():
    a = parse_property_attributes(
        "tres dormitorios, dos baños, salon comedor, cocina y plaza de garaje"
    )
    assert a["bedrooms"] == 3
    assert a["bathrooms"] == 2
    assert a["has_garage"] is True


def test_aseo_only_bathroom():
    a = parse_property_attributes(
        "recibidor, cocina, dos dormitorios, comedor, cuarto de aseo"
    )
    assert a["bedrooms"] == 2
    assert a["bathrooms"] == 1


def test_number_after_or_before_noun():
    a = parse_property_attributes("aseo y cuatro dormitorios")
    assert a["bedrooms"] == 4
    assert a["bathrooms"] == 1


# ---- Amenities: garden / garage / storage / terrace ----------------------

def test_garden_and_floor_from_262799():
    a = parse_property_attributes(
        "dos dormitorios y un cuarto de baño. mediante vuelo del jardín de la "
        "planta baja"
    )
    assert a["bedrooms"] == 2
    assert a["bathrooms"] == 1
    assert a["has_garden"] is True
    assert a["floor_level"] == "bajo"


def test_garage_and_storage_positive():
    a = parse_property_attributes("vivienda con garaje y trastero")
    assert a["has_garage"] is True
    assert a["has_storage_room"] is True


# ---- Negation -> explicit False ------------------------------------------

def test_sin_garaje_is_false():
    a = parse_property_attributes("vivienda de dos dormitorios sin garaje")
    assert a["has_garage"] is False
    assert a["bedrooms"] == 2


def test_sin_trastero_is_false():
    a = parse_property_attributes("piso con terraza, sin trastero")
    assert a["has_storage_room"] is False
    assert a["has_terrace"] is True


def test_negated_but_also_positive_stays_true():
    # A negated storage plus a separate positive mention -> True (positive wins).
    a = parse_property_attributes("plaza de garaje y trastero; sin garaje adicional")
    assert a["has_garage"] is True  # first mention positive
    assert a["has_storage_room"] is True


# ---- Honest-NULL: no mention -> None (never 0/False) ---------------------

def test_no_mention_all_none():
    a = parse_property_attributes(
        "URBANA. Local comercial en planta calle. Superficie 80 m2."
    )
    assert a["bedrooms"] is None
    assert a["bathrooms"] is None
    assert a["has_terrace"] is None
    assert a["has_garden"] is None
    assert a["has_garage"] is None
    assert a["has_storage_room"] is None


def test_empty_and_none_input():
    for val in (None, "", "   "):
        a = parse_property_attributes(val)
        assert all(v is None for v in a.values())


def test_generic_habitaciones_not_counted():
    # A generic, unnumbered "habitaciones" is NOT a bedroom count.
    a = parse_property_attributes(
        "compuesta de dependencias, habitaciones, servicios, terraza y solarium"
    )
    assert a["bedrooms"] is None
    assert a["has_terrace"] is True


def test_unnumbered_plural_dormitorios_not_guessed():
    a = parse_property_attributes("vivienda con dormitorios y cocina")
    assert a["bedrooms"] is None  # cannot know how many


# ---- floor_level variants -------------------------------------------------

def test_floor_variants():
    assert parse_property_attributes("piso en planta segunda del bloque")["floor_level"] == "2"
    assert parse_property_attributes("vivienda en la planta 7, puerta d")["floor_level"] == "7"
    assert parse_property_attributes("piso tercero, puerta c")["floor_level"] == "3"
    assert parse_property_attributes("direccion cl pio xii, planta 00, puerta g")["floor_level"] == "bajo"
    assert parse_property_attributes("atico con terraza en planta atico")["floor_level"] == "atico"
    assert parse_property_attributes("local sin referencia de planta clara")["floor_level"] is None


# ---- set_property_attribute_fields: fill-only, honest-NULL ---------------

def test_set_fields_fills_only_nulls():
    rec = {
        "lot_description": "tres dormitorios, dos baños y terraza",
        "property_description": None,
        "cadastral_data": None,
        "title": None,
        # pre-existing value must NOT be overwritten
        "bedrooms": 9,
        "bathrooms": None,
        "has_terrace": None,
        "has_garden": None,
        "has_garage": None,
        "has_storage_room": None,
        "floor_level": None,
    }
    set_property_attribute_fields(rec)
    assert rec["bedrooms"] == 9        # existing value preserved (fill-only)
    assert rec["bathrooms"] == 2       # filled
    assert rec["has_terrace"] is True  # filled


def test_set_fields_no_prose_is_noop():
    rec = {"lot_description": None, "property_description": None,
           "cadastral_data": None, "title": None, "bedrooms": None}
    set_property_attribute_fields(rec)
    assert rec["bedrooms"] is None
