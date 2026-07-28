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


# ── Data-quality gate (content-based, Dennis-clarified 2026-07-28) ───────────

def test_empty_shell_is_excluded_content_based():
    # €55 PLABI "ACTIVO FRISU": in-scope-ish category BUT only price + generic
    # category + city — no extracted content. EXCLUDED as 'empty-shell'.
    in_scope, reason = decide_scope(
        category='Otros inmuebles',
        source='PLABI',
        boe_id='0xFRISU',           # dead link — NOT what excludes it
        appraisal_value=None,
        valor_subasta=55,           # nominal price, below the €1,000 floor
        current_bid=55,
        address='las palmas',       # bare city echo — not street-level
        lot_description=None,
        property_description=None,
        cadastral_ref=None,
        title='ACTIVO FRISU',       # placeholder — no thoroughfare, no digit
    )
    assert in_scope is False
    assert reason == 'empty-shell'


def test_city_echo_shell_is_excluded():
    # The real junk shape seen in the data: "Subasta de Otros inmuebles, Sarria"
    # + address "sarria" — a bare city echo, no street, no valuation. HIDDEN.
    in_scope, reason = decide_scope(
        category='Otros inmuebles',
        title='Subasta de Otros inmuebles, Sarria',
        address='sarria',
        appraisal_value=0,
    )
    assert in_scope is False
    assert reason == 'empty-shell'


def test_street_in_title_keeps_row():
    # Older rows carry the street in the TITLE (structured cols were backfilled
    # later). A thoroughfare token in the title = real content → KEEP.
    in_scope, reason = decide_scope(
        category='Otros inmuebles',
        title='Subasta de Inmueble en calle magallanes, 5, Arganda del Rey',
        address=None,
        appraisal_value=0,
    )
    assert in_scope is True
    assert reason is None


def test_street_in_address_keeps_row():
    in_scope, reason = decide_scope(
        category='Viviendas',
        title='Unknown',                       # placeholder title
        address='calle de doña maría de garay, 6',  # real street
        appraisal_value=0,
    )
    assert in_scope is True
    assert reason is None


def test_snapshot_document_does_not_rescue_a_shell():
    # CRITICAL (Dennis): every auction has a snapshot document. Document presence
    # must NOT count as real data — a bare shell that happens to have a snapshot
    # is still an empty-shell. (has_documents is accepted but ignored.)
    in_scope, reason = decide_scope(
        category='Otros inmuebles',
        valor_subasta=55,
        has_documents=True,         # snapshot exists — irrelevant
    )
    assert in_scope is False
    assert reason == 'empty-shell'


def test_real_content_dead_link_is_kept():
    # Suspended Las Palmas case: real extracted content + dead 0x link → KEEP.
    in_scope, reason = decide_scope(
        category='Viviendas',
        source='BOE',
        boe_id='0xBC7D9A14',        # dead link — irrelevant
        appraisal_value=185000,     # meaningful valuation (>= €1,000)
        address='Calle León y Castillo 373, Vega de San Mateo',
        status='SUSPENDIDA',
    )
    assert in_scope is True
    assert reason is None


def test_meaningful_valuation_alone_keeps_a_row():
    # A real high valuation is substantive content even with a short description.
    in_scope, reason = decide_scope(
        category='Otros inmuebles',
        appraisal_value=250000,
        lot_description='Inmueble',   # short — but valuation carries it
    )
    assert in_scope is True
    assert reason is None


def test_movable_excluded_regardless_of_rich_content():
    # A jewel lot with a full description is still out of scope (category first).
    in_scope, reason = decide_scope(
        category='Joyas',
        appraisal_value=9000,
        lot_description='Lote de anillos de oro 18k con certificado de tasación oficial',
    )
    assert in_scope is False
    assert reason == 'movable'


# ── has_real_data granularity (content-substance thresholds) ─────────────────

def test_has_real_data_content_signals():
    # Substantive fields → real.
    assert has_real_data(lot_description='x' * 40) is True
    assert has_real_data(property_description='x' * 40) is True
    assert has_real_data(address='Calle X 1') is True
    assert has_real_data(cadastral_ref='1234567AB1234C0001XY') is True
    assert has_real_data(appraisal_value=1000) is True
    assert has_real_data(valor_subasta=250000) is True


def test_has_real_data_rejects_bare_skeleton():
    # Below-floor price / short description / blank fields / snapshot → NOT real.
    assert has_real_data(valor_subasta=55) is False
    assert has_real_data(appraisal_value=999.99) is False
    assert has_real_data(lot_description='Otros inmuebles') is False   # 15 chars < 40
    assert has_real_data(address='CP') is False                        # 2 chars < 5
    # A bare city echo (as address OR as the tail of a generic title) is NOT
    # street-level → not real content.
    assert has_real_data(address='sarria') is False
    assert has_real_data(title='Subasta de Otros inmuebles, Sarria') is False
    assert has_real_data(appraisal_value=0, address='   ', lot_description='') is False
    assert has_real_data(has_documents=True) is False                  # snapshot ignored
    assert has_real_data() is False
