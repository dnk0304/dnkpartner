#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shared BOE detail-page decision gates (CP2/CP3/CP4 single source of truth).

These are the SAFE gates that authorize a status write from a re-scraped BOE
detail page. They were first written inline in
``scheduler.reconcile_boe_status`` (CP3) and in ``cleanup_withdrawn_preauctions``
(CP2). CP4's one-time re-sweep of the ~453 wrongly-cancelled backlog
(``scripts/resweep_false_cancels.py``) MUST make the EXACT same live/cancel
decision — so the two predicates live here, imported by every consumer, and can
never drift into a second, softer definition that mass-reopens genuinely
cancelled rows.

`info` is the dict returned by ``BOEScraper._fetch_detail_info(boe_id)``.

boe_cancel_confirmed(info):
    True only when the STRICT, anchored cancelada/anulada banner fired
    (``info['auction_cancelled']`` — produced by
    ``BOEScraper._auction_cancel_confirmed`` on the auction's own banner, NOT a
    whole-body 'cancelada' substring). Authorizes keeping / setting CANCELADA.

boe_confirmed_live(info):
    True only when BOE actually served a real auction detail (an
    ``identificador`` KEY is present AND at least one real auction field is
    populated). The "Identificador incorrecto" error page and the
    empty-on-exception fallback both return False, so a network/parse failure is
    never mistaken for a live auction and can never authorize a re-open.
"""

from typing import Any, Dict


def boe_cancel_confirmed(info: Dict[str, Any]) -> bool:
    """STRICT BOE cancel banner (see module docstring)."""
    return info.get('auction_cancelled') is True


def boe_confirmed_live(info: Dict[str, Any]) -> bool:
    """BOE served a real, parseable live auction detail (see module docstring).

    Byte-identical to the predicate used inline in
    ``scheduler.reconcile_boe_status`` (CP3) before it was extracted here."""
    return (
        'identificador' in info
        and bool(
            info.get('identificador')
            or info.get('start_at') is not None
            or info.get('ends_at') is not None
            or info.get('appraisal_value')
        )
    )
