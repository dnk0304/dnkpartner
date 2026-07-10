"""Tests for hygiene_avda_coords.py — bucket selection, 'Avda' predicate,
coords-clear decisions, and SQL shape. Offline (no DB, no playwright)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hygiene_avda_coords import (  # noqa: E402
    AVDA,
    ACTIVE_STATUSES,
    is_avda_junk,
    is_avda_variant,
    classify_bucket,
    should_clear_coords_on_null,
    bucket_where,
    coords341_where,
    DEFAULT_SINCE,
    DEFAULT_UNTIL,
)


def test_avda_predicate_exact_only():
    assert is_avda_junk("Avda")
    # near-variants and real addresses must NOT match the mutation predicate
    for a in ("Avda.", "Avda ", "avda", "AVDA", "Avda de la Paz 3",
              "Avenida", "", None):
        assert not is_avda_junk(a), a


def test_variant_detector_reports_but_never_the_sentinel_or_real_addresses():
    assert is_avda_variant("Avda.")
    assert is_avda_variant("Avda ")
    assert is_avda_variant("AVDA")
    assert is_avda_variant("avda.")
    # exact sentinel handled by the junk predicate, not the variant report
    assert not is_avda_variant("Avda")
    # plausible real avenue addresses are NOT variants
    assert not is_avda_variant("Avda de la Constitucion 12")
    assert not is_avda_variant("Avda Madrid 4 2B")
    assert not is_avda_variant(None)
    assert not is_avda_variant("Calle Mayor 1")


def test_bucket_classification():
    # BOE active -> refetch; BOE ended -> null-only
    for st in ACTIVE_STATUSES:
        assert classify_bucket("BOE", st, "Avda") == "boe-active-refetch"
    for st in ("CONCLUIDA_PORTAL", "CANCELADA", "FINALIZADA"):
        assert classify_bucket("BOE", st, "Avda") == "boe-ended-null"
    # non-BOE sources are NEVER fetched (2d072bf lesson)
    for src in ("TEJU", "PLABI", "SEGSOCIAL"):
        assert classify_bucket(src, "CELEBRANDOSE", "Avda") == "nonboe-active-null"
        assert classify_bucket(src, "CONCLUIDA_PORTAL", "Avda") == "nonboe-ended-null"
    # non-junk rows are never bucketed
    assert classify_bucket("BOE", "CELEBRANDOSE", "Calle Mayor 1") is None
    assert classify_bucket("BOE", "CELEBRANDOSE", None) is None
    assert classify_bucket("BOE", "CELEBRANDOSE", "Avda.") is None  # variant: report-only


def test_coords_clear_decision():
    # active rows: junk-geocoded coords are untrustworthy -> clear (drain re-pins)
    assert should_clear_coords_on_null("boe-active-refetch")
    assert should_clear_coords_on_null("nonboe-active-null")
    # ended rows: drain is active-only; keep the coarse pin
    assert not should_clear_coords_on_null("boe-ended-null")
    assert not should_clear_coords_on_null("nonboe-ended-null")


def test_bucket_sql_shape():
    w = bucket_where("boe-active-refetch")
    assert "source = 'BOE'" in w and "= ANY" in w and '"AuctionStatus"[]' in w
    w = bucket_where("boe-ended-null")
    assert "source = 'BOE'" in w and "<> ALL" in w
    w = bucket_where("nonboe-active-null")
    assert "source <> 'BOE'" in w and "= ANY" in w
    w = bucket_where("nonboe-ended-null")
    assert "source <> 'BOE'" in w and "<> ALL" in w
    # every bucket keys on the exact sentinel param, never a LIKE
    for b in ("boe-active-refetch", "boe-ended-null",
              "nonboe-active-null", "nonboe-ended-null"):
        assert "address = %(avda)s" in bucket_where(b)
        assert "LIKE" not in bucket_where(b)


def test_coords341_sql_shape():
    w = coords341_where(True, DEFAULT_SINCE, DEFAULT_UNTIL)
    # real-address guard: never touches NULL/empty/'Avda' addresses
    assert "address IS NOT NULL" in w
    assert "address <> %(avda)s" in w
    # window bounds are parameterized
    assert '%(since)s' in w and '%(until)s' in w
    # coords must exist to be cleared
    assert "latitude IS NOT NULL" in w and "longitude IS NOT NULL" in w
    # shared-coords refinement present by default...
    assert "GROUP BY latitude, longitude HAVING COUNT(*) >= 2" in w
    # ...and absent when disabled
    assert "GROUP BY" not in coords341_where(False, DEFAULT_SINCE, DEFAULT_UNTIL)
    # BOE + active only
    assert "source = 'BOE'" in w and "= ANY" in w


def test_default_window_matches_regression_era():
    # 3f2ea9c landed 2026-06-08; wave122 fix deployed 2026-07-08/09.
    assert DEFAULT_SINCE == "2026-06-08"
    assert DEFAULT_UNTIL == "2026-07-09"


def test_null_mode_set_clauses():
    """The NULL legs derive their SET clause from should_clear_coords_on_null;
    replicate the derivation and pin the two shapes."""
    def set_clause(bucket):
        s = "address = NULL"
        if should_clear_coords_on_null(bucket):
            s += ', latitude = NULL, longitude = NULL, "geocodeAttemptedAt" = NULL'
        return s

    assert set_clause("nonboe-active-null") == (
        'address = NULL, latitude = NULL, longitude = NULL, '
        '"geocodeAttemptedAt" = NULL')
    assert set_clause("boe-ended-null") == "address = NULL"
    assert set_clause("nonboe-ended-null") == "address = NULL"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                failed += 1
                print(f"FAIL {name}: {e}")
    sys.exit(1 if failed else 0)
