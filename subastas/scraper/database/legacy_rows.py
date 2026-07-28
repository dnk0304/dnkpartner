"""
Dead-link first-gen row predicate — scraper-side single source of truth.

CORRECTED 2026-07-28 (wave155). Background (2026-06-02 root cause): a January
first-gen import produced junk rows whose stored BOE link is built from an
internal ``0x``-hex code, not a real ``SUB-`` id — so the link is DEAD and the
row can never be re-scraped. These rows kept being re-flipped to CELEBRANDOSE
every scrape cycle because candidate queries picked them up and
``upsert_auction`` re-wrote status.

WHY THE cuid-SHAPE BRANCH WAS DROPPED
-------------------------------------
The original predicate also matched ``id ~ '^c[a-z0-9]{24}$'`` (cuid shape) and
claimed "0x-hex ⊆ cuid". That was BACKWARDS: ``Auction.id`` is
``@default(cuid())``, so EVERY newer legitimate scraped row has a cuid id.
Matching on cuid shape therefore froze the status of — and excluded from
scraping — thousands of legit auctions. The ONLY reliable junk signal is the
dead link (``boeId ~ '^0x'``). The cuid branch is removed.

RELATION TO THE APP-SIDE RETIRE (410) PREDICATE
-----------------------------------------------
The app-side SEO retire predicate (``src/lib/seo/legacy-rows.ts``) requires
dead-link **AND terminal status** — because a suspended dead-link row (e.g.
Dennis's ``c7mdnij4a9ihge0842bms8sst``, SUSPENDIDA + 0x) must still RENDER as a
frozen card and must NOT be de-indexed. This scraper predicate deliberately
does NOT gate on terminal status: a dead link cannot be re-scraped in ANY
status, so a 0x row is candidate-excluded / status-frozen regardless of status.
That correctly leaves the suspended 0x row frozen (never re-scraped, never
flipped) while the app still shows it. Same dead-link signal, different gate,
for two different purposes.

Two layers, sharing this module's definitions:

Layer 1 — Candidate-query exclusion (primary):
    Use ``LEGACY_EXCLUSION_SQL`` as an AND-clause inside every candidate /
    active-selection query so a dead-link row is never picked up to be scraped
    or re-written.

Layer 2 — Defensive guard in the write path (belt & braces):
    Use ``is_legacy_row(boe_id, row_id)`` inside ``adapter.upsert_auction`` to
    DROP ``status`` from the UPDATE set when the matched row is a dead-link row.
    Non-status enrichment writes (occupancy/puja/endsAt etc.) are still allowed
    — never ``status``.

Do NOT touch ``monitor_status_changes`` conclusion predicate.
"""

import re

# Postgres POSIX-regex predicate used inside WHERE clauses. CONSTANT fragment
# embedded into SQL — takes no params (regex literal only).
#
#   "boeId" !~ '^0x'   — exclude the dead 0x-hex internal-code links.
#
# (The former ``id !~ '^c[a-z0-9]{24}$'`` clause was REMOVED — cuid is the id of
# every legit newer row, so it must never be excluded.)
LEGACY_EXCLUSION_SQL = "\"boeId\" !~ '^0x'"

# Python-side mirror for the defensive write-path guard.
_BOE_LEGACY_RE = re.compile(r'^0x')


def is_legacy_row(boe_id, row_id=None) -> bool:
    """Return True iff (boe_id) identifies a dead-link first-gen row.

    The junk signal is the dead ``0x`` internal-code BOE link ONLY. ``row_id``
    is accepted for call-site compatibility but is NO LONGER used to decide
    legacy-ness (cuid ids are legitimate). A dead-link row is candidate-excluded
    and status-frozen regardless of its status.
    """
    if boe_id and _BOE_LEGACY_RE.match(str(boe_id)):
        return True
    return False
