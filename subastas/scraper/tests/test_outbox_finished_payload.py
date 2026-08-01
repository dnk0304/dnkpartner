"""
Payload-shape tests for database/outbox.emit_status_change (Forge, 2026-08-01).

MANDATE (Dennis, DISPATCH-BRIEF-FORGE finished-alert address + real Puja final):
the FINISHED alert email must render (1) the property street ADDRESS (fallback to
town/province) and (2) the REAL captured last bid. Both are packed into the
outbox payload at write time — the email template is pure/DB-free. These tests
pin that emit_status_change now packs `address`, `finalBidCents` (cents) and
`pujaStatus` into the event_outbox payload, without regressing the existing keys.

outbox.py is loaded directly by file path (importlib) so we don't trigger
database/__init__.py -> adapter.py relative imports, which need the full package
shim only the scheduler sets up.
"""
import importlib.util
import json
import os

import pytest

_OUTBOX_PATH = os.path.join(
    os.path.dirname(__file__), "..", "database", "outbox.py"
)
_spec = importlib.util.spec_from_file_location("outbox_under_test", _OUTBOX_PATH)
outbox = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(outbox)


class FakeCursor:
    """Records every execute(sql, params); rowcount=1 so write_event reports inserted."""

    def __init__(self):
        self.calls = []
        self.rowcount = 1

    def execute(self, sql, params=None):
        self.calls.append((sql, params))

    def event_outbox_payload(self):
        """Return the parsed JSON payload from the event_outbox INSERT."""
        for sql, params in self.calls:
            if "event_outbox" in sql:
                # write_event params: (auction_id, event_type, payload_json, dedupe_key, ts)
                return json.loads(params[2])
        raise AssertionError("no event_outbox INSERT was issued")

    def event_type(self):
        for sql, params in self.calls:
            if "event_outbox" in sql:
                return params[1]
        raise AssertionError("no event_outbox INSERT was issued")


def _emit(**overrides):
    cur = FakeCursor()
    kwargs = dict(
        auction_id="auc-1",
        boe_id="SUB-JA-2026-264917",
        boe_link="https://subastas.boe.es/x",
        title="SUB-JA-2026-264917 - Lote 1",
        from_status="CELEBRANDOSE",
        to_status="CONCLUIDA_PORTAL",
        province="Las Palmas",
        municipality="Arrecife",
    )
    kwargs.update(overrides)
    outbox.emit_status_change(cur, **kwargs)
    return cur


def test_finished_payload_carries_address_bid_and_puja_status():
    cur = _emit(
        address="Calle X 12",
        current_bid_amount=12840000,  # cents
        puja_status="CON_PUJA",
    )
    assert cur.event_type() == "auction.finished"
    p = cur.event_outbox_payload()
    assert p["address"] == "Calle X 12"
    assert p["finalBidCents"] == 12840000
    assert p["pujaStatus"] == "CON_PUJA"
    # existing keys unchanged
    assert p["municipality"] == "Arrecife"
    assert p["province"] == "Las Palmas"
    assert "currentBid" in p


def test_finished_payload_desierta_no_bid():
    cur = _emit(puja_status="SIN_PUJA")
    p = cur.event_outbox_payload()
    assert p["finalBidCents"] is None
    assert p["pujaStatus"] == "SIN_PUJA"
    assert p["address"] is None  # empty string -> None (renderer falls back to loc)


def test_legacy_call_without_new_kwargs_is_backward_compatible():
    # Old callers that don't pass the new kwargs must still produce a valid
    # payload with the new keys present-but-null (template falls back to "—"/loc).
    cur = _emit()
    p = cur.event_outbox_payload()
    assert p["address"] is None
    assert p["finalBidCents"] is None
    assert p["pujaStatus"] is None
