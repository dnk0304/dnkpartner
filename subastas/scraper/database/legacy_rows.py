"""
Legacy first-gen row predicate — single source of truth.

Background (2026-06-02, Ken's live root-cause):
There are ~12,347 legacy first-gen junk rows in `Auction` identified by EITHER:
  - boeId matching ``^0x`` (Jan 2026 first-gen 0x-hex boeId import), AND/OR
  - id matching ``^c[a-z0-9]{24}$`` (cuid-format primary key — pre-UUID era).

The two sets overlap fully (0x-hex ⊆ cuid). These rows have NULL endsAt and are
NOT real listable auctions. They keep being re-flipped to CELEBRANDOSE every
scrape cycle because candidate queries (e.g. backfill_pujas_occupancy
candidate_rows) pick them up and upsert_auction re-writes status.

The fix is two layers, sharing this module's definitions:

Layer 1 — Candidate-query exclusion (primary):
    Use ``LEGACY_EXCLUSION_SQL`` as an AND-clause inside every candidate /
    active-selection query so a legacy row is never picked up to be scraped or
    re-written.

Layer 2 — Defensive guard in the write path (belt & braces):
    Use ``is_legacy_row(boe_id, row_id)`` inside ``adapter.upsert_auction`` to
    DROP ``status`` from the UPDATE set when the matched row is legacy. So even
    if some future query forgets the exclusion, no legacy row flips back to
    active. Allowed writes for legacy rows: non-status enrichment fields
    (occupancy/puja/endsAt etc.) — never ``status``.

Do NOT touch ``monitor_status_changes`` conclusion predicate. It is correct and
its endsAt-IS-NOT-NULL guard already ignores legacy rows (their endsAt is NULL).
"""

import re

# Postgres POSIX-regex predicates used inside WHERE clauses. These are CONSTANT
# fragments embedded into SQL — they take no params (regex literals only).
#
#   "boeId" !~ '^0x'             — exclude 0x-hex legacy boeId
#   id      !~ '^c[a-z0-9]{24}$'  — exclude cuid-format legacy primary key
#
# Both predicates are needed (defence in depth): the 0x-hex set is a subset of
# the cuid set, but a future legacy import could populate one without the other.
LEGACY_EXCLUSION_SQL = (
    "\"boeId\" !~ '^0x' "
    "AND id !~ '^c[a-z0-9]{24}$'"
)

# Python-side mirrors for the defensive write-path guard. Kept here so the
# definition lives in exactly one place.
_BOE_LEGACY_RE = re.compile(r'^0x')
_ID_LEGACY_RE = re.compile(r'^c[a-z0-9]{24}$')


def is_legacy_row(boe_id, row_id=None) -> bool:
    """Return True iff (boe_id, row_id) identifies a legacy first-gen row.

    Either condition is sufficient — they overlap in practice but defence in
    depth is intentional. ``row_id`` is optional (callers in the write path may
    only know the boeId before the SELECT) — in that case the cuid check is
    skipped. The adapter passes BOTH after its existence-check SELECT.
    """
    if boe_id and _BOE_LEGACY_RE.match(str(boe_id)):
        return True
    if row_id and _ID_LEGACY_RE.match(str(row_id)):
        return True
    return False
