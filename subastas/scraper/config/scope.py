"""
Scope decision — single source of truth for "should this auction be SHOWN?"
(wave155, 2026-07-28).

Two gates, in order:

  1. CATEGORY scope (Dennis rule): show ONLY property/land + vehicles. Movable
     goods (jewelry/machinery/art/…), rights (credit/shares/…), and genuinely
     UNCLASSIFIED rows are out of scope.

  2. DATA-QUALITY gate (Dennis 2026-07-28, governing principle): even an
     in-scope category must carry REAL information to be shown. An "empty shell"
     — a row we never actually captured real info for (no description, no
     address, no genuine appraisal, no documents; essentially just a price and a
     placeholder title, e.g. the €55 PLABI "ACTIVO FRISU" with a dead source
     link) — is hidden.

     CRITICAL EXCEPTION — a DEAD/broken source link ALONE never hides a row. If
     a row DOES contain real cached data we fetched before and the link LATER
     died, we KEEP it (frozen). That is exactly the suspended Las Palmas case
     (``c7mdnij4a9ihge0842bms8sst``: real data + dead 0x link → KEEP). So this
     module NEVER looks at whether the link is alive — only at whether real data
     was ever captured.

Returns (in_scope: bool, reason: str | None). reason ∈
  {'movable', 'rights', 'unclassified', 'empty-shell'} when hidden, else None.

The mechanism is a REVERSIBLE soft-hide (``Auction.inScope`` / ``scopeReason``),
never a delete.
"""

from .categories import get_scope_bucket, IN_SCOPE_BUCKETS


def _num_positive(v) -> bool:
    """True iff v is a real, strictly-positive number."""
    if v is None:
        return False
    try:
        return float(v) > 0
    except (TypeError, ValueError):
        return False


def _nonempty(v) -> bool:
    """True iff v is a non-blank string (or any non-empty non-numeric value)."""
    if v is None:
        return False
    s = str(v).strip()
    return len(s) > 0


def has_real_data(
    *,
    appraisal_value=None,
    address=None,
    lot_description=None,
    property_description=None,
    has_documents=False,
    **_ignored,
) -> bool:
    """Concrete "did we capture REAL information?" test.

    Real data = ANY of:
      - a descriptive text blob (lotDescription OR propertyDescription), OR
      - an address / location detail, OR
      - a genuine appraisal amount (Tasación / appraisalValue > 0), OR
      - at least one attached document.

    Deliberately NOT counted as real data (Dennis: an empty shell is "just a
    price and a placeholder title"):
      - the bare title,
      - a bare price / valor de subasta / current bid — a lone price figure does
        NOT prove we have real info about the asset (the €55 PLABI shell has a
        price but nothing else). appraisalValue (Tasación) IS counted because it
        is a real valuation, not a live bid; empty shells characteristically
        lack it.
    """
    if _nonempty(lot_description):
        return True
    if _nonempty(property_description):
        return True
    if _nonempty(address):
        return True
    if _num_positive(appraisal_value):
        return True
    if has_documents:
        return True
    return False


def decide_scope(
    *,
    category=None,
    appraisal_value=None,
    address=None,
    lot_description=None,
    property_description=None,
    has_documents=False,
    **_ignored,
):
    """Decide (in_scope, reason) for an auction row.

    Gate 1 (category): movable / rights / unclassified → hidden.
    Gate 2 (data-quality): in-scope category but no real data → 'empty-shell'.

    Extra kwargs (source, boe_id, status, valor_subasta, current_bid, title, …)
    are accepted and ignored so callers can splat a whole row in without
    filtering — and so a bare price/valor never accidentally counts as data.
    """
    bucket = get_scope_bucket(category)
    if bucket not in IN_SCOPE_BUCKETS:
        # 'movable' | 'rights' | 'unclassified'
        return (False, bucket)

    if not has_real_data(
        appraisal_value=appraisal_value,
        address=address,
        lot_description=lot_description,
        property_description=property_description,
        has_documents=has_documents,
    ):
        return (False, 'empty-shell')

    return (True, None)
