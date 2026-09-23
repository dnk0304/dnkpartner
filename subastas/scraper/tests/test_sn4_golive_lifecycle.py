"""SN-4 — SEGSOCIAL pre-auctions must be able to go live (Forge, 2026-09-23).

Root cause pinned here (three defects, one starved event):

  B1 ``segsocial_scraper._map_status`` returned ``opensAt == endsAt`` for every
     future-dated TGSS pre-auction. ``promote_pending_auctions`` requires
     ``endsAt IS NULL OR endsAt > now``, so a zero-length window was NEVER
     promotable; ``monitor_status_changes`` then retired it straight to
     CONCLUIDA_PORTAL. Result: zero ``auction.go_live`` rows in 7 days.
  B2 the generic ``adapter._upsert_auction_postgres`` wrote ``status`` onto an
     existing row with no outbox write at all — a scraper-driven
     PROXIMA_APERTURA -> CELEBRANDOSE flip emitted nothing.
  B3 the outbox dedupeKey was lifecycle-blind, so a RE-LISTED auction could
     never emit the same event a second time.

The scheduler's lifecycle SQL is read out of ``scheduler.py`` itself rather than
copied, so a future edit to the shipped query is what these tests run. The two
Postgres-isms are translated for SQLite (``%s`` -> ``?`` and the POSIX
``!~ '^0x'`` legacy exclusion -> a NOT LIKE); nothing else is rewritten.
"""
import importlib.util
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta

import pytest

_HERE = os.path.dirname(__file__)
_SCRAPER_DIR = os.path.abspath(os.path.join(_HERE, ".."))


def _read(*parts):
    with open(os.path.join(_SCRAPER_DIR, *parts), encoding="utf-8") as fh:
        return fh.read()


def _load(name, *parts):
    spec = importlib.util.spec_from_file_location(
        name, os.path.join(_SCRAPER_DIR, *parts))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


outbox = _load("sn4_outbox", "database", "outbox.py")
_SCHEDULER_SRC = _read("scheduler.py")
_ADAPTER_SRC = _read("database", "adapter.py")


# --------------------------------------------------------------------------
# B1 — _map_status
# --------------------------------------------------------------------------

def _map_status(fecha):
    """Run the REAL _map_status body without importing the scraper's heavy deps.

    The source is sliced out of segsocial_scraper.py and exec'd, so the test
    cannot drift from the shipped implementation.
    """
    src = _read("scrapers", "segsocial_scraper.py")
    m = re.search(r"    def _map_status\(fecha_dt.*?\n(?=    # -----)", src, re.S)
    assert m, "could not locate _map_status in segsocial_scraper.py"
    ns = {"datetime": datetime}
    body = "def _map_status(fecha_dt):\n" + "\n".join(
        line[4:] for line in m.group(0).split("\n")[1:])
    exec(body, ns)
    return ns["_map_status"](fecha)


def test_map_status_future_leaves_ends_at_null():
    """The SN-4 fix: a future act date yields a PROMOTABLE window (endsAt NULL)."""
    fecha = datetime.now() + timedelta(days=7)
    status, opens_at, ends_at = _map_status(fecha)
    assert status == "PROXIMA_APERTURA"
    assert opens_at == fecha
    assert ends_at is None, (
        "regression of B1: opensAt == endsAt makes the row unpromotable and it "
        "is swept PROXIMA -> CONCLUIDA without ever going live"
    )


def test_map_status_today_or_past_is_live_with_end():
    fecha = datetime.now() - timedelta(days=1)
    assert _map_status(fecha) == ("CELEBRANDOSE", None, fecha)


def test_map_status_no_date_is_live_and_honest_null():
    assert _map_status(None) == ("CELEBRANDOSE", None, None)


# --------------------------------------------------------------------------
# B1 — the shipped lifecycle SQL, run against SQLite
# --------------------------------------------------------------------------

def _extract_where(func_name, anchor):
    start = _SCHEDULER_SRC.index("def " + func_name + "(")
    idx = _SCHEDULER_SRC.index(anchor, start)
    end = _SCHEDULER_SRC.index('"""', idx)
    return _SCHEDULER_SRC[idx:end]


def _to_sqlite(where):
    where = where.replace("%s", "?")
    return where.replace("{LEGACY_EXCLUSION_SQL}", "\"boeId\" NOT LIKE '0x%'")


PROMOTE_WHERE = _to_sqlite(
    _extract_where("promote_pending_auctions", "WHERE status = 'PROXIMA_APERTURA'"))
SWEEP_PROXIMA_WHERE = _to_sqlite(
    _extract_where("monitor_status_changes", "WHERE status = 'PROXIMA_APERTURA'"))


def test_extracted_sql_is_the_real_thing():
    """Guard the extraction itself: an empty/degenerate WHERE would make every
    query test below vacuously green."""
    for w in (PROMOTE_WHERE, SWEEP_PROXIMA_WHERE):
        assert '"opensAt"' in w and "?" in w and "{" not in w, w
    assert 'IS NULL OR "endsAt" > ?' in PROMOTE_WHERE
    assert '"endsAt" IS NOT NULL' in SWEEP_PROXIMA_WHERE


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
    row.update(id="a1", boeId="SUB-SS-533", status="PROXIMA_APERTURA",
               title="t", boeLink="l", province="Las Palmas", municipality="m",
               appraisalValue=0.0)
    row.update(kw)
    cols = ",".join('"%s"' % c for c in _COLS)
    conn.execute(
        'INSERT INTO "Auction" (%s) VALUES (%s)' % (cols, ",".join("?" * len(_COLS))),
        tuple(row[c] for c in _COLS))


def _ids(conn, where, params):
    return [r[0] for r in conn.execute('SELECT id FROM "Auction" ' + where, params)]


def test_promote_picks_a_segsocial_proxima_row_once_opens_at_arrives(db):
    now = datetime(2026, 9, 23, 10, 0, 0)
    _insert(db, opensAt=now - timedelta(minutes=1), endsAt=None)
    assert _ids(db, PROMOTE_WHERE, (now, now)) == ["a1"]


def test_promote_skips_a_zero_length_window(db):
    """Proves B1 was the blocker: with the OLD endsAt == opensAt shape the very
    same row is invisible to the promotion job."""
    now = datetime(2026, 9, 23, 10, 0, 0)
    opens = now - timedelta(minutes=1)
    _insert(db, opensAt=opens, endsAt=opens)
    assert _ids(db, PROMOTE_WHERE, (now, now)) == []


def test_promote_skips_a_pre_auction_that_has_not_opened(db):
    now = datetime(2026, 9, 23, 10, 0, 0)
    _insert(db, opensAt=now + timedelta(days=2), endsAt=None)
    assert _ids(db, PROMOTE_WHERE, (now, now)) == []


def test_promote_excludes_dead_link_legacy_rows(db):
    now = datetime(2026, 9, 23, 10, 0, 0)
    _insert(db, boeId="0xdeadbeef", opensAt=now - timedelta(minutes=1), endsAt=None)
    assert _ids(db, PROMOTE_WHERE, (now, now)) == []


def test_sweep_does_not_retire_an_unopened_pre_auction(db):
    now = datetime(2026, 9, 23, 10, 0, 0)
    _insert(db, opensAt=now - timedelta(minutes=1), endsAt=None)
    assert _ids(db, SWEEP_PROXIMA_WHERE, (now, now)) == [], (
        "an endsAt-NULL pre-auction must be left for promote_pending_auctions"
    )


def test_sweep_still_retires_a_genuinely_finished_pre_auction(db):
    """The sweep must not be neutered by the fix — a PROXIMA row that really did
    run its full window is still retired."""
    now = datetime(2026, 9, 23, 10, 0, 0)
    _insert(db, opensAt=now - timedelta(days=3), endsAt=now - timedelta(days=2))
    assert _ids(db, SWEEP_PROXIMA_WHERE, (now, now)) == ["a1"]


def test_promotion_stamps_the_act_window():
    assert re.search(
        r'SEGSOCIAL_ACT_WINDOW_HOURS = int\(os\.getenv\(\s*"SEGSOCIAL_ACT_WINDOW_HOURS",\s*"24"\)\)',
        _SCHEDULER_SRC)
    assert 'COALESCE("endsAt", "opensAt" + %s)' in _SCHEDULER_SRC, (
        "promotion must stamp the act window on an endsAt-NULL row, or it stays "
        "CELEBRANDOSE forever (every sweep rule needs endsAt IS NOT NULL)"
    )


# --------------------------------------------------------------------------
# B3 — lifecycle-aware dedupeKey
# --------------------------------------------------------------------------

class FakeCursor:
    def __init__(self):
        self.calls = []
        self.rowcount = 1

    def execute(self, sql, params=None):
        self.calls.append((sql, params))

    def _outbox_params(self):
        for sql, params in self.calls:
            if "event_outbox" in sql:
                return params
        raise AssertionError("no event_outbox insert recorded")

    def dedupe_key(self):
        return self._outbox_params()[3]

    def payload(self):
        return json.loads(self._outbox_params()[2])


def _emit(opens_at, to_status="CONCLUIDA_PORTAL", from_status="CELEBRANDOSE"):
    c = FakeCursor()
    outbox.emit_status_change(
        c, auction_id="a1", boe_id="SUB-SS-483", boe_link="l", title="t",
        from_status=from_status, to_status=to_status, opens_at=opens_at,
    )
    return c


def test_dedupe_key_differs_across_lifecycles():
    june = _emit(datetime(2026, 6, 1, 10, 0)).dedupe_key()
    september = _emit(datetime(2026, 9, 23, 10, 0)).dedupe_key()
    assert june != september, (
        "B3: SUB-SS-483 was re-listed and its September finish was swallowed by "
        "the June dedupeKey"
    )
    assert june.endswith("@202606011000")
    assert september.endswith("@202609231000")


def test_dedupe_key_is_stable_for_the_same_lifecycle():
    opens = datetime(2026, 9, 23, 10, 0)
    assert _emit(opens).dedupe_key() == _emit(opens).dedupe_key(), (
        "one mail per user per auction per lifecycle"
    )


def test_go_live_key_is_lifecycle_bound():
    key = _emit(datetime(2026, 9, 23, 10, 0),
                to_status="CELEBRANDOSE", from_status="PROXIMA_APERTURA").dedupe_key()
    assert key == "a1:auction.go_live:live@202609231000"


def test_missing_opens_at_keeps_the_legacy_key():
    """Callers that cannot supply opensAt must be byte-identical to pre-SN-4."""
    assert _emit(None).dedupe_key() == "a1:auction.finished:CONCLUIDA_PORTAL"


def test_payload_carries_opens_at():
    c = _emit(datetime(2026, 9, 23, 10, 0),
              to_status="CELEBRANDOSE", from_status="PROXIMA_APERTURA")
    assert c.payload()["opensAt"] == "2026-09-23T10:00:00"


def test_scheduler_passes_opens_at_on_both_lifecycle_emitters():
    for fn in ("promote_pending_auctions", "monitor_status_changes"):
        start = _SCHEDULER_SRC.index("def " + fn + "(")
        end = _SCHEDULER_SRC.index("\n    def ", start + 10)
        assert "opens_at=opens_at," in _SCHEDULER_SRC[start:end], fn
    assert '"resumeAt", "opensAt"' in _SCHEDULER_SRC, (
        "the sweep must SELECT opensAt or its lifecycle key is always legacy"
    )


# --------------------------------------------------------------------------
# B2 — the upsert path must emit
# --------------------------------------------------------------------------

def test_adapter_routes_upsert_status_flips_through_the_outbox():
    # BOTH the definition AND the call site inside the UPDATE branch — asserting
    # only the name is satisfied by a dead method nobody calls.
    assert "def _emit_upsert_status_change(" in _ADAPTER_SRC
    assert "self._emit_upsert_status_change(" in _ADAPTER_SRC
    update_branch = _ADAPTER_SRC[
        _ADAPTER_SRC.index('UPDATE "Auction" SET {", ".join(update_fields)}'):
    ][:2000]
    assert "self._emit_upsert_status_change(" in update_branch, (
        "the emission must sit in the same branch as the UPDATE it describes"
    )
    assert "from .outbox import emit_status_change" in _ADAPTER_SRC
    # the flip is detected by comparing against the PRE-update status
    assert "prev_status = existing[1] if existing else None" in _ADAPTER_SRC
    assert "data['status'] != prev_status" in _ADAPTER_SRC
    # confined so a failed emission cannot abort the ingest transaction
    assert "SAVEPOINT sn4_outbox" in _ADAPTER_SRC
    assert "ROLLBACK TO SAVEPOINT sn4_outbox" in _ADAPTER_SRC
    # kill switch for Ken
    assert 'os.getenv("UPSERT_STATUS_EVENTS", "on")' in _ADAPTER_SRC
    # legacy dead-link rows stay status-frozen and silent
    assert "if not legacy_locked and prev_status" in _ADAPTER_SRC


# --------------------------------------------------------------------------
# Backfill script — predicate + safety rail, driven through a SQLite shim
# --------------------------------------------------------------------------

_BACKFILL = _load("sn4_backfill", "backfill_sn4_preauction_window.py")


class _SqliteShim:
    """Just enough psycopg2 surface to run the backfill's real SQL on SQLite.

    Translates the two Postgres-isms the script uses: ``%s`` placeholders and
    ``id = ANY(%s)``. Everything else — including the WHERE clauses under test —
    is executed verbatim, so a malformed predicate fails here.
    """

    def __init__(self, conn):
        self._conn = conn
        self._cur = conn.cursor()
        self.committed = False
        self.rolled_back = False

    def cursor(self):
        return self

    @property
    def rowcount(self):
        return self._cur.rowcount

    def execute(self, sql, params=()):
        params = list(params)
        if "ANY(%s)" in sql:
            ids = params.pop()
            sql = sql.replace("= ANY(%s)", "IN (%s)" % ",".join("?" * len(ids)))
            params.extend(ids)
        self._cur.execute(sql.replace("%s", "?"), params)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def commit(self):
        self.committed = True
        self._conn.commit()

    def rollback(self):
        self.rolled_back = True
        self._conn.rollback()

    def close(self):
        pass


@pytest.fixture
def backfill_db(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.execute(
        'CREATE TABLE "Auction" (id TEXT, "boeId" TEXT, source TEXT, status TEXT, '
        '"opensAt" TIMESTAMP, "endsAt" TIMESTAMP, "updatedAt" TIMESTAMP)'
    )
    shim = _SqliteShim(conn)
    monkeypatch.setenv("DATABASE_URL", "postgresql://shim")
    monkeypatch.setattr(_BACKFILL.psycopg2, "connect", lambda _url: shim)
    return conn, shim


def _bf_insert(conn, rid, status, opens_at, ends_at, source="SEGSOCIAL"):
    conn.execute(
        'INSERT INTO "Auction" (id,"boeId",source,status,"opensAt","endsAt","updatedAt") '
        "VALUES (?,?,?,?,?,?,NULL)", (rid, "SUB-SS-" + rid, source, status, opens_at, ends_at))
    # Commit the fixture data so the script's own rollback (dry run) cannot
    # discard it — otherwise the dry-run assertion would pass vacuously.
    conn.commit()


def _ends_at(conn, rid):
    return conn.execute('SELECT "endsAt" FROM "Auction" WHERE id = ?', (rid,)).fetchone()[0]


def _run(argv):
    import sys as _sys
    old = _sys.argv
    _sys.argv = ["backfill"] + argv
    try:
        return _BACKFILL.main()
    finally:
        _sys.argv = old


def test_backfill_repairs_future_broken_rows_only(backfill_db):
    conn, shim = backfill_db
    future = datetime.utcnow() + timedelta(days=5)
    past = datetime.utcnow() - timedelta(days=5)
    _bf_insert(conn, "future_broken", "PROXIMA_APERTURA", future, future)
    _bf_insert(conn, "past_broken", "PROXIMA_APERTURA", past, past)
    _bf_insert(conn, "healthy", "PROXIMA_APERTURA", future, future + timedelta(hours=24))
    _bf_insert(conn, "retired", "CONCLUIDA_PORTAL", past, past)

    assert _run(["--apply"]) == 0
    assert shim.committed
    assert _ends_at(conn, "future_broken") is None, "the repair target"
    assert _ends_at(conn, "past_broken") == str(past), (
        "safety rail: an already-opened row must not be revived without --grace-hours"
    )
    assert _ends_at(conn, "healthy") == str(future + timedelta(hours=24))
    assert _ends_at(conn, "retired") == str(past), "CONCLUIDA rows are never touched"


def test_backfill_never_touches_a_retired_row(backfill_db):
    """Pins the STATUS filter on its own.

    In the test above the CONCLUIDA row is also excluded by the future-only date
    rail, so widening the status filter there would still pass. Here the retired
    row carries a FUTURE opensAt, so only ``status = 'PROXIMA_APERTURA'`` can
    keep it out. Reviving a retired auction would emit a go_live for something
    the portal has already closed.
    """
    conn, _ = backfill_db
    future = datetime.utcnow() + timedelta(days=5)
    _bf_insert(conn, "retired_future", "CONCLUIDA_PORTAL", future, future)
    _bf_insert(conn, "proxima_future", "PROXIMA_APERTURA", future, future)
    assert _run(["--apply"]) == 0
    assert _ends_at(conn, "retired_future") == str(future)
    assert _ends_at(conn, "proxima_future") is None


def test_backfill_dry_run_writes_nothing(backfill_db):
    conn, shim = backfill_db
    future = datetime.utcnow() + timedelta(days=5)
    _bf_insert(conn, "future_broken", "PROXIMA_APERTURA", future, future)
    assert _run([]) == 0
    assert shim.rolled_back and not shim.committed
    assert _ends_at(conn, "future_broken") == str(future)


def test_backfill_grace_hours_recovers_a_recently_opened_row(backfill_db):
    conn, _ = backfill_db
    recent = datetime.utcnow() - timedelta(hours=3)
    _bf_insert(conn, "recent", "PROXIMA_APERTURA", recent, recent)
    assert _run(["--apply", "--grace-hours", "12"]) == 0
    assert _ends_at(conn, "recent") is None


def test_backfill_is_source_scoped_by_default(backfill_db):
    conn, _ = backfill_db
    future = datetime.utcnow() + timedelta(days=5)
    _bf_insert(conn, "boe", "PROXIMA_APERTURA", future, future, source="BOE")
    assert _run(["--apply"]) == 0
    assert _ends_at(conn, "boe") == str(future)
    assert _run(["--apply", "--all-sources"]) == 0
    assert _ends_at(conn, "boe") is None


def test_backfill_is_idempotent(backfill_db):
    conn, _ = backfill_db
    future = datetime.utcnow() + timedelta(days=5)
    _bf_insert(conn, "r", "PROXIMA_APERTURA", future, future)
    _run(["--apply"])
    _run(["--apply"])
    assert _ends_at(conn, "r") is None
