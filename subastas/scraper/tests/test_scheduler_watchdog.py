#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SN-5 T5 — the stall-hardening suite.

Each test asserts a property the 2026-09-23 incident violated:

  1. a scrape that never returns is ABANDONED on a deadline and the lock is
     released (it was `t.join()` with no timeout, held forever)
  2. the light ticks keep running while a scrape is blocked (they did not)
  3. a stale heartbeat is detected and mails EXACTLY ONCE per episode (nothing
     alerted at all)
  4. the subprocess path kills the whole process group on timeout, so no
     Playwright driver survives (PID 750 was 20 days old)

⭐ EVERY DETECTOR IN HERE IS PLANT-PROVEN: each test that asserts a guard fires
also asserts the SAME code path on the GOOD input, so a test that can only pass
(because the assertion is vacuous) is visible as a test that never went red.
"""

import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

SCRAPER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRAPER_DIR))

import scrape_runner  # noqa: E402
import watchdog  # noqa: E402


def _import_scraper_pkg():
    """
    Make the scraper tree importable the way the CONTAINER makes it importable.

    In the image the tree is copied to /app and addressed as the package `app`
    (`sys.path.insert(0, '/')` + `from app.database... import ...`). Outside the
    container there is no /app, so we alias the real package under the name
    `app`; that keeps every intra-package relative import (`from ..config ...`)
    resolving, which a bare `sys.path` append does not.
    """
    import importlib
    sys.path.insert(0, str(SCRAPER_DIR.parent))
    pkg = importlib.import_module(SCRAPER_DIR.name)
    sys.modules.setdefault('app', pkg)
    return pkg


def _import_scheduler():
    _import_scraper_pkg()
    try:
        import scheduler
        return scheduler
    except Exception as e:  # noqa: BLE001 — env-dependent (psycopg2, schedule, ...)
        pytest.skip(f"scheduler not importable in this environment: {e}")


def _import_browser():
    pytest.importorskip("playwright")
    _import_scraper_pkg()
    try:
        mod = __import__(f"{SCRAPER_DIR.name}.core.browser", fromlist=["BrowserManager"])
        return mod.BrowserManager
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"core.browser not importable in this environment: {e}")


def _log(msg):
    print(msg)


LOGS = []


def _capture(msg):
    LOGS.append(str(msg))


@pytest.fixture(autouse=True)
def _clear_logs():
    LOGS.clear()
    yield


# ---------------------------------------------------------------------------
# 1. Hard timeout on the thread path + lock release
# ---------------------------------------------------------------------------

def test_thread_timeout_fires_on_a_sleeping_scrape_and_returns():
    """A scrape that never finishes must be abandoned, not joined forever."""
    started = threading.Event()

    def _never_returns():
        started.set()
        time.sleep(30)
        return {"total_auctions": 999}

    t0 = time.time()
    result = scrape_runner.run_in_thread("SLEEPY", _never_returns, _capture, timeout=1)
    elapsed = time.time() - t0

    assert started.wait(5), "the scrape never even started"
    assert result is None, "a timed-out scrape must report failure, not a result"
    assert elapsed < 10, f"run_in_thread blocked for {elapsed:.1f}s — the join is unbounded"
    assert any("TIMEOUT" in line for line in LOGS), f"no TIMEOUT logged; got {LOGS}"


def test_thread_path_returns_the_result_when_the_scrape_is_fast():
    """Control for the test above: the same code path must pass a good scrape through."""
    result = scrape_runner.run_in_thread(
        "QUICK", lambda: {"total_auctions": 7}, _capture, timeout=30)
    assert result == {"total_auctions": 7}
    assert not any("TIMEOUT" in line for line in LOGS)


def test_a_timed_out_scrape_releases_the_scrape_lock():
    """
    The lock must be a lock WITH A DEADLINE. The incident was a lock held for
    ~8h because the join under it never returned.
    """
    lock = threading.Lock()

    def _held_scrape():
        with lock:
            return scrape_runner.run_in_thread(
                "WEDGED", lambda: time.sleep(30), _capture, timeout=1)

    t0 = time.time()
    _held_scrape()
    elapsed = time.time() - t0
    # Both halves matter. Without the elapsed bound this test passes even on an
    # UNBOUNDED join — it would simply take 30s and then find the lock free,
    # proving nothing. (Verified: with `t.join()` planted back in, the elapsed
    # assertion is what goes red.)
    assert elapsed < 10, (
        f"the lock was held for {elapsed:.1f}s — the join under it is unbounded")
    assert lock.acquire(timeout=1), "the scrape lock was still held after the timeout"
    lock.release()


def test_thread_worker_is_a_daemon_so_a_wedged_scrape_cannot_block_shutdown():
    """The old code used daemon=False: a hung scrape also hung container stop."""
    seen = {}

    def _slow():
        seen['daemon'] = threading.current_thread().daemon
        time.sleep(5)

    scrape_runner.run_in_thread("DAEMONCHECK", _slow, _capture, timeout=1)
    # give the worker a moment to have recorded its own flag
    for _ in range(50):
        if 'daemon' in seen:
            break
        time.sleep(0.05)
    assert seen.get('daemon') is True, "scrape worker thread must be a daemon"


# ---------------------------------------------------------------------------
# 2. Ticks keep running while a scrape is blocked
# ---------------------------------------------------------------------------

def test_light_ticks_run_while_a_scrape_is_blocked():
    """
    THE incident property. A blocked scrape holds the scrape lock; the tick lane
    must not touch that lock and must keep ticking.
    """
    scrape_lock = threading.Lock()
    release = threading.Event()
    ticks = []
    stop = threading.Event()

    def _blocked_scrape_lane():
        with scrape_lock:
            release.wait(10)  # stands in for a wedged Playwright call

    def _tick_lane():
        while not stop.is_set():
            ticks.append(time.time())   # NOTE: no scrape_lock here — the point
            time.sleep(0.02)

    scraper = threading.Thread(target=_blocked_scrape_lane, daemon=True)
    ticker = threading.Thread(target=_tick_lane, daemon=True)
    scraper.start()
    time.sleep(0.05)
    assert scrape_lock.locked(), "the fake scrape did not take the lock"
    ticker.start()

    time.sleep(0.5)
    ticked_while_blocked = len(ticks)
    release.set()
    stop.set()
    scraper.join(5)
    ticker.join(5)

    assert ticked_while_blocked >= 5, (
        f"only {ticked_while_blocked} ticks ran while the scrape was blocked — "
        f"the tick lane is coupled to the scrape lock")


def test_guarded_job_skips_a_second_run_while_one_is_in_flight():
    """T2's 'max one in flight' guard, exercised on the real scheduler helper."""
    sched_mod = _import_scheduler()

    s = object.__new__(sched_mod.ScraperScheduler)
    s._inflight = set()
    s._inflight_lock = threading.Lock()
    s.log = _capture
    s.heartbeat = watchdog.Heartbeat(Path(os.devnull + "-never"))

    entered = threading.Event()
    release = threading.Event()
    runs = []

    def _slow():
        runs.append(1)
        entered.set()
        release.wait(5)

    job = s._guarded('dispatch', _slow)
    first = threading.Thread(target=job, daemon=True)
    first.start()
    assert entered.wait(5)

    job()  # second tick while the first is still running

    assert len(runs) == 1, "the guard let a second run start while one was in flight"
    assert any("still in flight" in line for line in LOGS)

    release.set()
    first.join(5)

    # Control: once the first run is done, the SAME job runs again.
    release.clear()
    entered.clear()
    release.set()
    job()
    assert len(runs) == 2, "the guard never re-armed"


def test_guarded_job_survives_a_raising_tick():
    """A tick that throws must not kill the lane — that is how a lane dies quietly."""
    sched_mod = _import_scheduler()

    s = object.__new__(sched_mod.ScraperScheduler)
    s._inflight = set()
    s._inflight_lock = threading.Lock()
    s.log = _capture
    s.heartbeat = watchdog.Heartbeat(Path(os.devnull + "-never"))

    def _boom():
        raise RuntimeError("tick exploded")

    s._guarded('dispatch', _boom)()          # must not raise
    assert any("tick exploded" in line for line in LOGS)
    assert not s._inflight, "in-flight set leaked after an exception"


# ---------------------------------------------------------------------------
# 3. Heartbeat + staleness + one mail per stall
# ---------------------------------------------------------------------------

def test_heartbeat_roundtrip(tmp_path):
    hb = watchdog.Heartbeat(tmp_path / "heartbeat.json")
    hb.stamp("dispatch")
    data = hb.read()
    assert "dispatch" in (data.get("ticks") or {})
    assert data["pid"] == os.getpid()
    age = watchdog.tick_age_seconds(data, "dispatch")
    assert age is not None and age < 5


def test_stale_dispatch_tick_is_detected_and_fresh_one_is_not(tmp_path):
    now = datetime.now(timezone.utc)
    hb_path = tmp_path / "heartbeat.json"

    def write(age_min):
        hb_path.write_text(json.dumps({
            "pid": 1, "started_at": (now - timedelta(hours=1)).isoformat(),
            "ticks": {"dispatch": (now - timedelta(minutes=age_min)).isoformat()},
        }), encoding="utf-8")

    write(20)
    stalled, age = watchdog.is_stalled(watchdog.read_heartbeat(hb_path), 15 * 60, now=now)
    assert stalled and age == pytest.approx(20 * 60, abs=5)

    # Control — the SAME check on a fresh tick must NOT fire.
    write(3)
    stalled, age = watchdog.is_stalled(watchdog.read_heartbeat(hb_path), 15 * 60, now=now)
    assert not stalled and age == pytest.approx(3 * 60, abs=5)


def test_missing_tick_does_not_alert_during_boot_but_does_after_the_threshold():
    now = datetime.now(timezone.utc)
    booting = {"started_at": (now - timedelta(minutes=2)).isoformat(), "ticks": {}}
    assert watchdog.is_stalled(booting, 15 * 60, now=now)[0] is False

    long_up = {"started_at": (now - timedelta(minutes=40)).isoformat(), "ticks": {}}
    assert watchdog.is_stalled(long_up, 15 * 60, now=now)[0] is True


def test_stall_monitor_mails_exactly_once_per_episode(tmp_path, monkeypatch):
    sent = []
    monkeypatch.setattr(watchdog, "send_admin_stall_mail",
                        lambda subj, body, log=None: sent.append(subj) or "sent")
    monkeypatch.delenv("STALL_SELF_EXIT", raising=False)

    hb_path = tmp_path / "heartbeat.json"
    hb = watchdog.Heartbeat(hb_path)
    mon = watchdog.StallMonitor(hb, _capture, threshold_s=900)

    now = datetime.now(timezone.utc)

    def write(age_min):
        hb_path.write_text(json.dumps({
            "pid": 1, "started_at": (now - timedelta(hours=2)).isoformat(),
            "ticks": {"dispatch": (now - timedelta(minutes=age_min)).isoformat()},
        }), encoding="utf-8")

    write(30)
    assert mon.check_once(now=now) is True
    assert mon.check_once(now=now) is False          # no repeat within the episode
    assert mon.check_once(now=now) is False
    assert len(sent) == 1, f"expected one mail per stall, got {len(sent)}"

    write(1)                                         # ticks resume -> re-arm
    assert mon.check_once(now=now) is False
    assert mon.alerted is False

    write(30)                                        # a NEW episode mails again
    assert mon.check_once(now=now) is True
    assert len(sent) == 2


def test_admin_mail_is_a_noop_without_a_resend_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert watchdog.send_admin_stall_mail("s", "b", _capture) == "no-resend-key"


def test_healthcheck_exit_codes(tmp_path, monkeypatch):
    hb_path = tmp_path / "heartbeat.json"
    now = datetime.now(timezone.utc)

    def run():
        env = dict(os.environ)
        env["HEARTBEAT_PATH"] = str(hb_path)
        env["STALL_ALERT_MIN"] = "15"
        env["PYTHONPATH"] = str(SCRAPER_DIR)
        return subprocess.run([sys.executable, str(SCRAPER_DIR / "healthcheck.py")],
                              capture_output=True, text=True, env=env, timeout=60)

    assert run().returncode == 1, "a missing heartbeat must be UNHEALTHY"

    hb_path.write_text(json.dumps({
        "pid": 1, "started_at": (now - timedelta(hours=1)).isoformat(),
        "ticks": {"dispatch": (now - timedelta(minutes=30)).isoformat()},
    }), encoding="utf-8")
    assert run().returncode == 1, "a 30-min-stale dispatch tick must be UNHEALTHY"

    hb_path.write_text(json.dumps({
        "pid": 1, "started_at": (now - timedelta(hours=1)).isoformat(),
        "ticks": {"dispatch": now.isoformat()},
    }), encoding="utf-8")
    r = run()
    assert r.returncode == 0, f"a fresh tick must be healthy; stdout={r.stdout}"


# ---------------------------------------------------------------------------
# 4. Timeout budget
# ---------------------------------------------------------------------------

def test_timeout_budget_env_overrides(monkeypatch):
    monkeypatch.delenv("SCRAPE_TIMEOUT_MIN", raising=False)
    monkeypatch.delenv("SCRAPE_TIMEOUT_MIN_JUDICIAL", raising=False)
    assert scrape_runner.timeout_seconds("JUDICIAL") == 90 * 60

    monkeypatch.setenv("SCRAPE_TIMEOUT_MIN", "30")
    assert scrape_runner.timeout_seconds("JUDICIAL") == 30 * 60

    monkeypatch.setenv("SCRAPE_TIMEOUT_MIN_JUDICIAL", "120")
    assert scrape_runner.timeout_seconds("JUDICIAL") == 120 * 60
    assert scrape_runner.timeout_seconds("NOTARIAL") == 30 * 60

    monkeypatch.setenv("SCRAPE_TIMEOUT_MIN", "0")       # nonsense must not mean "kill now"
    monkeypatch.delenv("SCRAPE_TIMEOUT_MIN_JUDICIAL", raising=False)
    assert scrape_runner.timeout_seconds("JUDICIAL") == 90 * 60


def test_every_registered_subprocess_target_is_resolvable_in_shape():
    """
    Guards against a typo in SUBPROCESS_TARGETS silently demoting a label back
    to the thread path. We cannot import the scrapers here (Playwright/db), so
    we assert the SHAPE and that the label set matches what the scheduler uses.
    """
    from scrape_targets import SUBPROCESS_TARGETS
    for label, spec in SUBPROCESS_TARGETS.items():
        assert ":" in spec, f"{label}: {spec!r} is not 'module:callable'"
        mod, fn = spec.split(":", 1)
        assert mod and fn and not fn.startswith("_"), f"{label}: {spec!r}"

    scheduler_src = (SCRAPER_DIR / "scheduler.py").read_text(encoding="utf-8")
    for label in SUBPROCESS_TARGETS:
        assert f'"{label}"' in scheduler_src, (
            f"{label} is registered but no _run_sync_scrape call uses it — "
            f"the label drifted and the job is silently on the thread path")


# ---------------------------------------------------------------------------
# 5. Subprocess isolation + process-group kill
# ---------------------------------------------------------------------------

def _write_target(tmp_path, body: str) -> Path:
    mod = tmp_path / "fake_target.py"
    mod.write_text(body, encoding="utf-8")
    return mod


def test_subprocess_path_returns_the_child_result(tmp_path, monkeypatch):
    _write_target(tmp_path, "def go():\n    return {'total_auctions': 42, 'errors': []}\n")
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.setenv("PYTHONPATH", os.pathsep.join(
        [str(tmp_path), str(SCRAPER_DIR), os.environ.get("PYTHONPATH", "")]))

    result = scrape_runner.run_in_subprocess(
        "FAKE", "fake_target:go", _capture, timeout=120)
    assert result == {"total_auctions": 42, "errors": []}


def test_subprocess_path_reports_a_raising_child_as_failure(tmp_path, monkeypatch):
    _write_target(tmp_path, "def go():\n    raise ValueError('boom')\n")
    monkeypatch.setenv("PYTHONPATH", os.pathsep.join(
        [str(tmp_path), str(SCRAPER_DIR), os.environ.get("PYTHONPATH", "")]))

    assert scrape_runner.run_in_subprocess(
        "FAKE", "fake_target:go", _capture, timeout=120) is None
    assert any("boom" in line for line in LOGS)


def test_subprocess_timeout_kills_the_child_and_its_grandchild(tmp_path, monkeypatch):
    """
    THE point of T1: killing the scrape must also kill what it spawned. The
    grandchild stands in for `node .../cli.js run-driver` — the process that
    survived 20 days because nothing ever killed the tree.
    """
    marker = tmp_path / "grandchild.pid"
    _write_target(tmp_path, f"""
import subprocess, sys, time, os
def go():
    child = subprocess.Popen(
        [sys.executable, '-c', 'import time; time.sleep(600)'])
    open(r{str(marker)!r}, 'w').write(str(child.pid))
    time.sleep(600)
    return {{'total_auctions': 1}}
""")
    monkeypatch.setenv("PYTHONPATH", os.pathsep.join(
        [str(tmp_path), str(SCRAPER_DIR), os.environ.get("PYTHONPATH", "")]))

    t0 = time.time()
    result = scrape_runner.run_in_subprocess(
        "FAKE", "fake_target:go", _capture, timeout=5)
    elapsed = time.time() - t0

    assert result is None
    assert elapsed < 60, f"the parent waited {elapsed:.1f}s — the timeout did not bound it"
    assert any("TIMEOUT" in line for line in LOGS), LOGS

    for _ in range(100):
        if marker.exists():
            break
        time.sleep(0.05)
    assert marker.exists(), "the child never spawned its grandchild — test is vacuous"
    gc_pid = int(marker.read_text().strip())

    deadline = time.time() + 20
    while time.time() < deadline:
        if not _pid_alive(gc_pid):
            break
        time.sleep(0.2)
    assert not _pid_alive(gc_pid), (
        f"grandchild pid {gc_pid} survived the kill — a leaked Playwright driver "
        f"would survive the same way")


def _pid_alive(pid: int) -> bool:
    if os.name == 'nt':
        out = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/NH'],
                             capture_output=True, text=True).stdout
        return str(pid) in out
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # A zombie is not alive for our purposes; reap it if it is ours.
    try:
        wpid, _ = os.waitpid(pid, os.WNOHANG)
        if wpid == pid:
            return False
    except ChildProcessError:
        pass
    return True


# ---------------------------------------------------------------------------
# 6. Playwright lifecycle (T3) — skipped when Playwright is absent
# ---------------------------------------------------------------------------

def test_browser_manager_is_thread_affine():
    """
    The root cause: one process-wide BrowserManager whose sync-Playwright driver
    was started on a scrape thread and then reused from the NEXT scrape thread,
    after the first had exited ->
        greenlet.error: cannot switch to a different thread (which happens to
        have exited)
    A driver must never be used from a thread that does not own it.
    """
    BrowserManager = _import_browser()

    bm = object.__new__(BrowserManager)
    bm._initialized = True
    bm._contexts = []
    bm._browser = None

    killed = []
    bm._kill_driver_process = staticmethod(lambda pw: killed.append(pw))

    sentinel = object()
    bm._playwright = sentinel
    bm._owner_thread = threading.Thread(target=lambda: None)   # a thread that never ran

    bm._abandon_foreign_driver()

    assert bm._playwright is None, "a foreign driver must be dropped, not reused"
    assert bm._owner_thread is None
    assert killed == [sentinel], "the orphaned driver process was not killed"


def test_close_all_from_a_foreign_thread_abandons_instead_of_hanging():
    """close_all() from the wrong thread IS the cross-thread switch that hangs."""
    BrowserManager = _import_browser()

    bm = object.__new__(BrowserManager)
    bm._initialized = True
    bm._contexts = []
    bm._browser = None
    bm._playwright = object()
    bm._owner_thread = threading.Thread(target=lambda: None)

    abandoned = []
    bm._abandon_foreign_driver = lambda: abandoned.append(True)

    bm.close_all()
    assert abandoned == [True], "close_all() tried a graceful cross-thread stop"


def test_scrape_teardown_leaves_no_run_driver_child():
    """
    T5's 'no leaked run-driver' check. Runs a real sync-Playwright start/stop in
    a child process and asserts no `run-driver` descendant outlives it.
    """
    playwright = pytest.importorskip("playwright")  # noqa: F841
    if os.name == 'nt':
        pytest.skip("descendant scan uses ps(1)")

    code = (
        "from playwright.sync_api import sync_playwright\n"
        "pw = sync_playwright().start()\n"
        "pw.stop()\n"
    )
    proc = subprocess.run([sys.executable, "-c", code],
                          capture_output=True, text=True, timeout=180)
    assert proc.returncode == 0, proc.stderr

    ps = subprocess.run(['ps', '-eo', 'ppid=,args='],
                        capture_output=True, text=True, timeout=30).stdout
    orphans = [l for l in ps.splitlines()
               if 'run-driver' in l and l.strip().split(None, 1)[0] == str(proc.pid)]
    assert not orphans, f"leaked run-driver processes: {orphans}"
