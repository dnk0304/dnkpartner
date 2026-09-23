"""SN-6 — the scheduler's auction clock is Europe/Madrid wall time (Forge, 2026-09-23).

``Auction.opensAt`` / ``Auction.endsAt`` are ``timestamp without time zone``
holding the literal wall time printed by the source portal: BOE's
``_extract_detail_date`` captures only ``YYYY-MM-DDTHH:MM:SS`` and throws the
``+02:00`` away, SEGSOCIAL's ``_parse_fecha`` builds a naive datetime from the
printed digits, and the adapter passes both straight through to psycopg. The
invariant is pinned for the whole row by ``test_resume_at_timezone.py``.

``promote_pending_auctions`` / ``monitor_status_changes`` / the freeze reconcile
compared those columns against ``datetime.utcnow()``, which runs the scheduler
one hour late in CET and TWO hours late in CEST. Concretely: the Las Palmas TGSS
batch opening Thu 25 Sep 2026 at 10:00 Madrid would not have promoted (and would
not have mailed) until 10:00Z = 12:00 Madrid.

The fix is one helper, ``ScraperScheduler._now_local()``. These tests exec the
REAL helper source and run the REAL shipped SQL (sliced out of scheduler.py, the
same technique test_sn4_golive_lifecycle.py uses) so they cannot drift from what
ships. Write stamps -- transitionedAt / updatedAt / resultCheckedAt / outbox --
must stay UTC, and that is asserted too: a fix that dragged them local would
corrupt every timestamp the web app renders.
"""
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

_HERE = os.path.dirname(__file__)
_SCRAPER_DIR = os.path.abspath(os.path.join(_HERE, ".."))

with open(os.path.join(_SCRAPER_DIR, "scheduler.py"), encoding="utf-8") as fh:
    _SRC = fh.read()

MADRID = ZoneInfo("Europe/Madrid")


# --------------------------------------------------------------------------
# The helper itself — exec'd from the shipped source, with a frozen instant
# --------------------------------------------------------------------------

def _now_local_src():
    """Slice the real `_now_local` staticmethod body out of scheduler.py."""
    m = re.search(
        r"    @staticmethod\n    def _now_local\(\):\n(.*?)\n\n    def __init__",
        _SRC, re.S)
    assert m, "could not locate _now_local in scheduler.py"
    body = "\n".join(line[4:] for line in m.group(1).split("\n"))
    return "def _now_local():\n" + body


def test_extraction_is_not_vacuous():
    """Guard the slice: a degenerate extraction would make every test below
    pass against nothing at all."""
    src = _now_local_src()
    assert "SCHEDULER_TZ" in src
    assert "replace(tzinfo=None)" in src
    assert 'SCHEDULER_TZ = ZoneInfo(os.getenv("SCHEDULER_TZ", "Europe/Madrid"))' in _SRC


class _FrozenClock:
    """Stands in for the `datetime` module inside `_now_local`. Only `.now(tz)`
    is used by the helper; it returns the frozen UTC instant converted by the
    REAL ZoneInfo, so DST handling is genuinely exercised."""

    def __init__(self, utc_naive):
        self.instant = utc_naive.replace(tzinfo=timezone.utc)

    def now(self, tz=None):
        return self.instant.astimezone(tz)


def now_local_at(utc_naive):
    """What the shipped `_now_local()` returns at a given UTC instant."""
    ns = {"datetime": _FrozenClock(utc_naive), "SCHEDULER_TZ": MADRID}
    exec(_now_local_src(), ns)
    return ns["_now_local"]()


def test_now_local_is_naive():
    got = now_local_at(datetime(2026, 9, 25, 8, 0, 0))
    assert got.tzinfo is None, (
        "an aware value is silently UTC-normalised on write to a "
        "`timestamp without time zone` column — reintroducing the skew"
    )


def test_now_local_summer_is_utc_plus_two():
    assert now_local_at(datetime(2026, 9, 25, 8, 0, 0)) == datetime(2026, 9, 25, 10, 0, 0)


def test_now_local_winter_is_utc_plus_one():
    assert now_local_at(datetime(2026, 1, 15, 9, 0, 0)) == datetime(2026, 1, 15, 10, 0, 0)


def test_now_local_is_not_a_fixed_offset():
    """A hardcoded +2h "fix" would be wrong for half the year. The same UTC
    time-of-day must map to DIFFERENT wall times in January and July."""
    summer_utc = datetime(2026, 7, 15, 9, 0, 0)
    winter_utc = datetime(2026, 1, 15, 9, 0, 0)
    summer_offset = now_local_at(summer_utc) - summer_utc
    winter_offset = now_local_at(winter_utc) - winter_utc
    assert summer_offset == timedelta(hours=2)
    assert winter_offset == timedelta(hours=1)


# --------------------------------------------------------------------------
# DST boundaries
# --------------------------------------------------------------------------

def test_dst_spring_gap_2026_03_29_no_local_time_is_skipped_backwards():
    """02:00->03:00 Madrid. Local wall time must stay strictly monotonic across
    the gap: it jumps forward an hour, it never goes backwards or stalls."""
    before = now_local_at(datetime(2026, 3, 29, 0, 59, 0))   # 01:59 CET
    after = now_local_at(datetime(2026, 3, 29, 1, 1, 0))     # 03:01 CEST
    assert before == datetime(2026, 3, 29, 1, 59, 0)
    assert after == datetime(2026, 3, 29, 3, 1, 0)
    assert after > before


def test_dst_spring_gap_an_opens_at_inside_the_gap_still_promotes():
    """No wall time between 02:00 and 03:00 exists on 2026-03-29, but a row could
    carry one (a source typo, or a date rolled forward by hand). It must not be
    stranded: the first tick after the gap is already past it."""
    opens = datetime(2026, 3, 29, 2, 30, 0)
    first_tick_after = now_local_at(datetime(2026, 3, 29, 1, 1, 0))
    assert first_tick_after > opens


def test_dst_autumn_fold_2026_10_25_local_clock_repeats_0230():
    """02:00 CEST -> 03:00... i.e. 02:30 happens twice. Both readings are the
    same wall time; the promotion job must therefore not rely on the clock being
    monotonic to avoid a double-promote (see the next test)."""
    first = now_local_at(datetime(2026, 10, 25, 0, 30, 0))   # 02:30 CEST
    second = now_local_at(datetime(2026, 10, 25, 1, 30, 0))  # 02:30 CET
    assert first == second == datetime(2026, 10, 25, 2, 30, 0)


# --------------------------------------------------------------------------
# The shipped SQL, run against SQLite (same rig as SN-4)
# --------------------------------------------------------------------------

def _extract_where(func_name, anchor):
    start = _SRC.index("def " + func_name + "(")
    idx = _SRC.index(anchor, start)
    end = _SRC.index('"""', idx)
    return _SRC[idx:end]


def _to_sqlite(where):
    return where.replace("%s", "?").replace(
        "{LEGACY_EXCLUSION_SQL}", "\"boeId\" NOT LIKE '0x%'")


PROMOTE_WHERE = _to_sqlite(
    _extract_where("promote_pending_auctions", "WHERE status = 'PROXIMA_APERTURA'"))
SWEEP_LIVE_WHERE = _to_sqlite(
    _extract_where("monitor_status_changes", "WHERE status IN ('ACTIVE'"))


def test_extracted_sql_is_the_real_thing():
    assert '"opensAt" <= ?' in PROMOTE_WHERE and "{" not in PROMOTE_WHERE
    assert '"endsAt" < ?' in SWEEP_LIVE_WHERE and "{" not in SWEEP_LIVE_WHERE


@pytest.fixture
def db():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        'CREATE TABLE "Auction" (id TEXT, "boeId" TEXT, status TEXT, '
        '"opensAt" TIMESTAMP, "endsAt" TIMESTAMP, title TEXT, "boeLink" TEXT, '
        'province TEXT, municipality TEXT, "appraisalValue" REAL, '
        '"currentBid" REAL, address TEXT, "currentBidAmount" INTEGER, '
        '"pujaStatus" TEXT, "suspensionReason" TEXT, "resumeAt" TIMESTAMP)'
    )
    return conn


_COLS = ("id", "boeId", "status", "opensAt", "endsAt", "title", "boeLink",
         "province", "municipality", "appraisalValue", "currentBid", "address",
         "currentBidAmount", "pujaStatus", "suspensionReason", "resumeAt")


def _insert(conn, **kw):
    row = dict.fromkeys(_COLS)
    row.update(id="a1", boeId="SUB-SS-625", status="PROXIMA_APERTURA",
               title="Las Palmas TGSS", boeLink="l", province="Las Palmas",
               municipality="m", appraisalValue=0.0)
    row.update(kw)
    cols = ",".join('"%s"' % c for c in _COLS)
    conn.execute(
        'INSERT INTO "Auction" (%s) VALUES (%s)' % (cols, ",".join("?" * len(_COLS))),
        tuple(row[c] for c in _COLS))


def _ids(conn, where, params):
    return [r[0] for r in conn.execute('SELECT id FROM "Auction" ' + where, params)]


def _promote_ids_at(conn, utc_instant):
    """Exactly what the shipped job binds: `now_local` on both placeholders."""
    n = now_local_at(utc_instant)
    return _ids(conn, PROMOTE_WHERE, (n, n))


# ---- the Thursday case ----------------------------------------------------

THURSDAY_OPEN = datetime(2026, 9, 25, 10, 0, 0)  # 10:00 Madrid wall time


def test_thursday_10_00_madrid_promotes_at_08_00z(db):
    """SUB-SS-625..631, Las Palmas. Dennis expects coverage AT 10:00 Madrid."""
    _insert(db, opensAt=THURSDAY_OPEN, endsAt=None)
    assert _promote_ids_at(db, datetime(2026, 9, 25, 8, 0, 0)) == ["a1"]


def test_thursday_batch_does_not_promote_at_07_59z(db):
    """09:59 Madrid — one minute early is still early."""
    _insert(db, opensAt=THURSDAY_OPEN, endsAt=None)
    assert _promote_ids_at(db, datetime(2026, 9, 25, 7, 59, 0)) == []


def test_the_old_utc_clock_would_have_been_two_hours_late(db):
    """The regression this dispatch closes, stated as a test: binding
    `utcnow()` leaves the 10:00 Madrid batch unpromoted at 10:00 Madrid."""
    _insert(db, opensAt=THURSDAY_OPEN, endsAt=None)
    utcnow_at_1000_madrid = datetime(2026, 9, 25, 8, 0, 0)  # what utcnow() returns
    assert _ids(db, PROMOTE_WHERE,
                (utcnow_at_1000_madrid, utcnow_at_1000_madrid)) == []


# ---- sweep uses the same clock -------------------------------------------

def test_sweep_expires_on_the_local_clock(db):
    """A live row whose endsAt wall time has passed is retired on the local
    clock, not two hours later."""
    _insert(db, status="CELEBRANDOSE", opensAt=THURSDAY_OPEN,
            endsAt=datetime(2026, 9, 25, 12, 0, 0))
    at_1159 = now_local_at(datetime(2026, 9, 25, 9, 59, 0))
    at_1201 = now_local_at(datetime(2026, 9, 25, 10, 1, 0))
    assert _ids(db, SWEEP_LIVE_WHERE, (at_1159,)) == []
    assert _ids(db, SWEEP_LIVE_WHERE, (at_1201,)) == ["a1"]


# ---- DST behaviour of the job, not just the clock ------------------------

def test_no_double_promote_across_the_autumn_fold(db):
    """02:30 Madrid occurs twice on 2026-10-25. The row must promote on the
    first pass and be invisible on the second — the status flip, not clock
    monotonicity, is what makes this safe."""
    _insert(db, opensAt=datetime(2026, 10, 25, 2, 0, 0), endsAt=None)

    first = _promote_ids_at(db, datetime(2026, 10, 25, 0, 30, 0))   # 02:30 CEST
    assert first == ["a1"]
    db.execute("UPDATE \"Auction\" SET status='CELEBRANDOSE' WHERE id=?", ("a1",))

    second = _promote_ids_at(db, datetime(2026, 10, 25, 1, 30, 0))  # 02:30 CET
    assert second == [], "promoted twice across the DST fold"


def test_no_skip_across_the_spring_gap(db):
    """A pre-auction opening at 02:30 on 2026-03-29 (a wall time that does not
    exist) must still be picked up on the first tick after the gap, not
    stranded PROXIMA_APERTURA forever."""
    _insert(db, opensAt=datetime(2026, 3, 29, 2, 30, 0), endsAt=None)
    assert _promote_ids_at(db, datetime(2026, 3, 29, 0, 59, 0)) == []  # 01:59 CET
    assert _promote_ids_at(db, datetime(2026, 3, 29, 1, 1, 0)) == ["a1"]  # 03:01 CEST


# --------------------------------------------------------------------------
# Binding audit — the right clock reaches the right placeholder
# --------------------------------------------------------------------------

def _func_src(name):
    start = _SRC.index("    def " + name + "(")
    nxt = _SRC.index("\n    def ", start + 10)
    return _SRC[start:nxt]


@pytest.mark.parametrize("func", [
    "promote_pending_auctions",
    "monitor_status_changes",
    "freeze_reconcile",
])
def test_local_clock_is_assigned_in_every_comparing_job(func):
    if func not in _SRC:
        pytest.skip(func + " not present")
    src = _func_src(func)
    assert "self._now_local()" in src, (
        func + " compares opensAt/endsAt but never reads the local clock"
    )


def test_promote_binds_the_local_clock_to_the_opens_at_predicate():
    src = _func_src("promote_pending_auctions")
    m = re.search(r'AND "opensAt" <= %s.*?"""\s*,\s*\(([^)]*)\)', src, re.S)
    assert m, "promotion query shape changed"
    assert m.group(1).replace(" ", "") == "now_local,now_local", m.group(1)


def test_write_stamps_stay_utc():
    """transitionedAt / updatedAt are UTC columns rendered by the web app. A
    local value here would shift every displayed timestamp by 1-2h."""
    for func, frag in (
        ("monitor_status_changes", '"transitionedAt" = %s'),
        ("promote_pending_auctions", '"transitionedAt" = %s'),
    ):
        src = _func_src(func)
        m = re.search(re.escape(frag) + r'.*?"""\s*,\s*\(([^)]*)\)', src, re.S)
        assert m, func + ": status UPDATE shape changed"
        params = m.group(1)
        assert "now_local" not in params, (
            func + " writes a local wall time into a UTC stamp column: " + params
        )
        assert params.strip().startswith("now,"), params


def test_no_utcnow_is_bound_to_an_opens_or_ends_predicate():
    """Anti-regression sweep: every `%s` that sits on an opensAt/endsAt
    comparison in a job that owns one must be fed `now_local`, never `now`."""
    for func in ("promote_pending_auctions", "monitor_status_changes"):
        src = _func_src(func)
        blocks = re.findall(
            r'cursor\.execute\(\s*f?"""(.*?)"""\s*,\s*\(([^)]*)\)', src, re.S)
        assert blocks, func + ": found no parameterised query to audit"
        audited = 0
        for sql, params in blocks:
            if '"endsAt" <' not in sql and '"opensAt" <=' not in sql:
                continue
            audited += 1
            assert "now_local" in params and not re.search(r"\bnow\b", params), (
                func, sql[:80], params)
        assert audited, func + ": no opensAt/endsAt predicate audited"


def test_freeze_reconcile_splits_the_two_clocks():
    """FREEZE_RECONCILE_SQL takes resultCheckedAt (UTC stamp) and an endsAt
    comparison (local) in ONE statement — they must not both be `now`."""
    assert "cursor.execute(self.FREEZE_RECONCILE_SQL, (now, now_local))" in _SRC, (
        "the freeze reconcile binds one clock to both a write stamp and an "
        "endsAt comparison"
    )
