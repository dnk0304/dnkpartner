"""
Unit tests for the wave155 scope decision (category buckets + data-quality gate).

Run with:
    python -m pytest subastas/scraper/tests/test_scope.py -q
"""

from scraper.config.categories import (
    get_category_type,
    get_scope_bucket,
    is_in_scope_category,
    UNCLASSIFIED_CATEGORY,
)
from scraper.config.scope import decide_scope, has_real_data


# ── Category → bucket mapping ────────────────────────────────────────────────

def test_property_and_vehicle_are_in_scope():
    for c in ['Viviendas', 'Garajes', 'Terrenos', 'Fincas rústicas',
              'Naves industriales', 'Oficinas', 'Trasteros', 'Locales',
              'Otros inmuebles']:
        assert get_scope_bucket(c) == 'property', c
        assert is_in_scope_category(c), c
    for c in ['Turismos', 'Motocicletas', 'Camiones', 'Barcos', 'Aeronaves',
              'Otros vehículos', 'Vehículos Industriales']:
        assert get_scope_bucket(c) == 'vehicle', c
        assert is_in_scope_category(c), c


def test_movable_and_rights_are_out_of_scope():
    for c in ['Joyas', 'Maquinaria', 'Mobiliario', 'Arte y antigüedades',
              'Electrónica', 'Otros bienes muebles']:
        assert get_scope_bucket(c) == 'movable', c
        assert not is_in_scope_category(c), c
    for c in ['Derechos de crédito', 'Derechos reales',
              'Participaciones sociales', 'Otros derechos']:
        assert get_scope_bucket(c) == 'rights', c
        assert not is_in_scope_category(c), c


def test_unclassified_sentinel_and_unknown_labels():
    assert get_scope_bucket(UNCLASSIFIED_CATEGORY) == 'unclassified'
    assert get_scope_bucket(None) == 'unclassified'
    assert get_scope_bucket('Totally Unknown Label') == 'unclassified'
    assert not is_in_scope_category(UNCLASSIFIED_CATEGORY)


def test_classifier_default_is_unclassified_not_otros_inmuebles():
    # The catch-all no longer dumps unmatched rows into a REAL property bucket.
    assert get_category_type('zzz nothing matches here', '') == UNCLASSIFIED_CATEGORY
    # A real vivienda still classifies correctly.
    assert get_category_type('Vivienda unifamiliar en Madrid') == 'Viviendas'


# ── Data-quality gate (empty-shell) — Dennis's three cases ───────────────────

def test_empty_shell_dead_link_is_excluded():
    # €55 PLABI "ACTIVO FRISU": property-ish category, dead 0x link, but no real
    # data — just a price + placeholder title. EXCLUDED on data-quality grounds.
    in_scope, reason = decide_scope(
        category='Otros inmuebles',
        source='PLABI',
        boe_id='0xFRISU',           # dead link — but link is NOT what excludes it
        appraisal_value=None,
        valor_subasta=55,           # a bare price does NOT count as real data
        current_bid=55,
        address=None,
        lot_description=None,
        property_description=None,
        title='ACTIVO FRISU',
    )
    assert in_scope is False
    assert reason == 'empty-shell'


def test_real_data_dead_link_is_kept():
    # Suspended Las Palmas case: real cached data + dead 0x link → KEEP (frozen).
    in_scope, reason = decide_scope(
        category='Viviendas',
        source='BOE',
        boe_id='0xBC7D9A14',        # dead link — irrelevant to the decision
        appraisal_value=185000,
        address='Calle León y Castillo 373, Vega de San Mateo',
        lot_description='Vivienda de 90 m2 ...',
        status='SUSPENDIDA',
    )
    assert in_scope is True
    assert reason is None


def test_real_data_working_link_is_kept():
    in_scope, reason = decide_scope(
        category='Turismos',
        source='BOE',
        boe_id='SUB-JA-2025-1',     # live link
        appraisal_value=12000,
        address=None,
        lot_description='BMW 320d, año 2018',
    )
    assert in_scope is True
    assert reason is None


def test_movable_excluded_regardless_of_rich_data():
    # A jewel lot with a full description is still out of scope (category rule
    # runs before the data-quality gate).
    in_scope, reason = decide_scope(
        category='Joyas',
        appraisal_value=9000,
        lot_description='Lote de anillos de oro 18k',
    )
    assert in_scope is False
    assert reason == 'movable'


# ── has_real_data granularity ────────────────────────────────────────────────

def test_has_real_data_signals():
    assert has_real_data(lot_description='algo') is True
    assert has_real_data(property_description='algo') is True
    assert has_real_data(address='Calle X 1') is True
    assert has_real_data(appraisal_value=1) is True
    assert has_real_data(has_documents=True) is True
    # A bare price / valor is NOT counted, and neither is an empty/blank blob.
    assert has_real_data(appraisal_value=0) is False
    assert has_real_data(appraisal_value=None, address='   ', lot_description='') is False
    assert has_real_data() is False
