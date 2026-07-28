"""
Scope decision — single source of truth for "should this auction be SHOWN?"
(wave155, 2026-07-28).

Two gates, in order:

  1. CATEGORY scope (Dennis rule): show ONLY property/land + vehicles. Movable
     goods (jewelry/machinery/art/...), rights (credit/shares/...), and
     genuinely UNCLASSIFIED rows are out of scope.

  2. DATA-QUALITY gate — measures EXTRACTED CONTENT SUBSTANCE (Dennis
     clarification 2026-07-28). Even an in-scope category must carry REAL
     auction information to be shown. "Real information" means there is actual
     information about the auction in the record — beyond the bare skeleton of
     (nominal price + generic category + city). An "empty shell" (e.g. the €55
     PLABI c310b288: only "55€" + "otros inmuebles" + "las palmas", nothing
     extracted) is hidden.

     SNAPSHOTS / DOCUMENTS ARE NOT A SIGNAL. Every auction is sourced by taking
     a snapshot and extracting from it — so EVERY auction has a snapshot
     document. Document presence proves NOTHING about content quality: it must
     NOT count as junk AND must NOT count as "real data". This gate reads ONLY
     the extracted CONTENT fields, never document rows. (Ken's earlier
     "ignore snapshot docs -> hide ~13.7k" framing was WRONG — it would have
     hidden ~10.7k legit auctions. Abandoned.)

     A DEAD/broken source link ALONE never hides a row. A row with real
     extracted content whose link LATER died is KEPT (frozen) — exactly the
     suspended Las Palmas case (c7mdnij4a9ihge0842bms8sst). This module never
     inspects whether the link is alive.

Returns (in_scope: bool, reason: str | None). reason in
  {'movable', 'rights', 'unclassified', 'empty-shell'} when hidden, else None.

The mechanism is a REVERSIBLE soft-hide (Auction.inScope / scopeReason), never a
delete.
"""

from .categories import get_scope_bucket, IN_SCOPE_BUCKETS

# -- Content-substance thresholds (Dennis-clarified 2026-07-28) ---------------
# A real auction record carries at least one SUBSTANTIVE extracted field beyond
# the bare price+category+city skeleton. Thresholds chosen to cleanly separate
# the €55 PLABI shell from genuine property/vehicle records:
#
#   MIN_DESCRIPTION_LEN — a real description is prose, not a one-word category
#       echo. 40 chars ~ "Vivienda de 90 m2 en calle ..." and filters generic
#       stubs like "otros inmuebles".
#   MIN_ADDRESS_LEN     — a street-level address (e.g. "Calle Leon y Castillo
#       373"), NOT the city. The generic city ("las palmas") lives in the
#       province/municipality columns, which this gate deliberately never reads.
#   MEANINGFUL_VALUATION_FLOOR — a real appraisal / valor de subasta. A €1,000
#       floor rejects the nominal €55 while keeping real property/vehicles
#       (real "otros inmuebles" valuations run €250k-1.25M). A bare price BELOW
#       the floor never counts as real info.
MIN_DESCRIPTION_LEN = 40
MEANINGFUL_VALUATION_FLOOR = 1000.0

# A STREET-LEVEL location vs a bare city. Empirically (2026-05-29 snapshot),
# real rows carry a street NUMBER or a thoroughfare word ("calle magallanes 5",
# "avinguda de alicante 20") while shells carry only a city echo ("sarria",
# "las palmas") or a placeholder ("ACTIVO FRISU"). Signal = a digit (street
# number / specific numeric detail) OR a thoroughfare token. A bare comma is
# NOT used — a shell title "Subasta de Otros inmuebles, Sarria" has a comma
# (category, city). Applied to BOTH the address AND the title (the title is the
# primary content carrier on older rows whose structured columns predate the
# content-extraction backfills). The thoroughfare list is an allowlist — a real
# street named with an off-list word AND no number AND no valuation would be
# missed; reversible + rare.
import re as _re
_HAS_DIGIT = _re.compile(r'[0-9]')
_THOROUGHFARE = _re.compile(
    r'\b(calle|c/|avda|avenida|av\.|avinguda|carrer|carretera|ctra|camino|'
    r'cami|plaza|pza|placa|paseo|passeig|paraje|partida|urbanizacion|'
    r'urbanizacio|poligono|poligon|travesia|ronda|rambla|glorieta|barrio)\b',
    _re.IGNORECASE,
)


def _text_len(v) -> int:
    """Trimmed character length of a value (0 for None)."""
    if v is None:
        return 0
    return len(str(v).strip())


def _num_at_least(v, floor) -> bool:
    """True iff v is a number >= floor."""
    if v is None:
        return False
    try:
        return float(v) >= floor
    except (TypeError, ValueError):
        return False


def _is_street_level(v) -> bool:
    """True iff the text looks like a street-level location (has a street
    number / specific digit or a thoroughfare token) rather than a bare city
    echo or placeholder."""
    if v is None:
        return False
    s = str(v).strip()
    if len(s) < 5:
        return False
    return bool(_HAS_DIGIT.search(s) or _THOROUGHFARE.search(s))


def has_real_data(
    *,
    appraisal_value=None,
    valor_subasta=None,
    address=None,
    lot_description=None,
    property_description=None,
    cadastral_ref=None,
    title=None,
    **_ignored,
) -> bool:
    """Content-substance test: does the record carry REAL auction information?

    True iff ANY substantive extracted field is present:
      - a real DESCRIPTION (lotDescription OR propertyDescription) >=
        MIN_DESCRIPTION_LEN chars, OR
      - a STREET-LEVEL address or title (has a street number/comma or a
        thoroughfare token — NOT a bare city echo), OR
      - a CADASTRAL reference (any non-blank value), OR
      - a MEANINGFUL valuation (appraisalValue OR valorSubasta >=
        MEANINGFUL_VALUATION_FLOOR).

    Deliberately NOT counted (each is the bare skeleton, or the universal
    sourcing method, not real content):
      - a bare price / current bid, or a below-floor nominal price/valor,
      - province / municipality / a bare city name (in the address OR the title,
        e.g. "Subasta de Otros inmuebles, Sarria"),
      - the presence of a snapshot/document (EVERY auction has one).
    """
    if _text_len(lot_description) >= MIN_DESCRIPTION_LEN:
        return True
    if _text_len(property_description) >= MIN_DESCRIPTION_LEN:
        return True
    if _is_street_level(address):
        return True
    if _is_street_level(title):
        return True
    if _text_len(cadastral_ref) > 0:
        return True
    if _num_at_least(appraisal_value, MEANINGFUL_VALUATION_FLOOR):
        return True
    if _num_at_least(valor_subasta, MEANINGFUL_VALUATION_FLOOR):
        return True
    return False


def decide_scope(
    *,
    category=None,
    appraisal_value=None,
    valor_subasta=None,
    address=None,
    lot_description=None,
    property_description=None,
    cadastral_ref=None,
    title=None,
    **_ignored,
):
    """Decide (in_scope, reason) for an auction row.

    Gate 1 (category): movable / rights / unclassified -> hidden.
    Gate 2 (data-quality): in-scope category but no substantive extracted
    content -> 'empty-shell'.

    Extra kwargs (source, boe_id, status, current_bid, has_documents, title, ...)
    are accepted and ignored so callers can splat a whole row in — and so a bare
    price, a city, or a snapshot document never accidentally count as content.
    """
    bucket = get_scope_bucket(category)
    if bucket not in IN_SCOPE_BUCKETS:
        # 'movable' | 'rights' | 'unclassified'
        return (False, bucket)

    if not has_real_data(
        appraisal_value=appraisal_value,
        valor_subasta=valor_subasta,
        address=address,
        lot_description=lot_description,
        property_description=property_description,
        cadastral_ref=cadastral_ref,
        title=title,
    ):
        return (False, 'empty-shell')

    return (True, None)
