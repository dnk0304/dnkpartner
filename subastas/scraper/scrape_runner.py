#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_runner — SN-5: a HARD per-scrape timeout for the scheduler.

THE BUG THIS EXISTS FOR (box, 2026-09-19 .. 2026-09-23)
-------------------------------------------------------
`scheduler._run_sync_scrape` started a worker thread and called `t.join()` with
NO timeout. A BOE_OTRAS_TRIBUTARIAS pass wedged inside sync-Playwright
(618 `greenlet.error: cannot switch to a different thread (which happens to
have exited)`), the join never returned, and the ONE scheduler loop thread
stopped forever: no dispatch tick (last 05:03Z), no promote (04:55Z), no mint
(06:15Z) until the container was restarted at 12:48:40Z. A single leaked
Playwright driver (`node .../cli.js run-driver`, PID 750, 20 days old — the age
of the container) outlived every scrape.

TWO FIXES, IN PREFERENCE ORDER
------------------------------
1. SUBPROCESS (default, `SCRAPE_ISOLATION=subprocess`). Each registered scrape
   runs as a child process in its OWN process group. `subprocess.run(timeout=)`
   bounds it, and on expiry we kill the WHOLE GROUP — which reaps the leaked
   `run-driver` and any `chrome-headless-shell` for free, because they are the
   child's children. Crucially it also makes the greenlet class of bug
   *unreachable*: no interpreter state, no event loop and no Playwright driver
   survives from one scrape to the next, because the interpreter itself does
   not. A wedged scrape can no longer wedge the scheduler at all — the parent is
   only ever blocked in `waitpid` with a deadline.

2. THREAD + HARD JOIN (`SCRAPE_ISOLATION=thread`, and the automatic fallback for
   the three closure-based labels that cannot be handed to a child). `join(t)`,
   then best-effort kill of stray `run-driver` / `chrome-headless-shell`
   children, then RELEASE THE LOCK and return None. The stuck thread is marked
   daemon so it can never block interpreter shutdown. This is strictly weaker:
   the wedged thread keeps its memory and its poisoned loop, so it is the
   fallback, not the default.

TIMEOUT BUDGET
--------------
`SCRAPE_TIMEOUT_MIN` (default 90), overridable per label with
`SCRAPE_TIMEOUT_MIN_<LABEL>` e.g. `SCRAPE_TIMEOUT_MIN_JUDICIAL=120`.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

SCRIPT_DIR = Path(__file__).resolve().parent

DEFAULT_TIMEOUT_MIN = 90
#: Names of processes a wedged Playwright scrape is known to strand.
LEAKED_PROC_NEEDLES = ("run-driver", "chrome-headless-shell", "headless_shell")


def timeout_seconds(label: str) -> int:
    """Per-label timeout in seconds. `SCRAPE_TIMEOUT_MIN_<LABEL>` wins."""
    per_label = os.getenv(f"SCRAPE_TIMEOUT_MIN_{label.upper()}")
    base = os.getenv("SCRAPE_TIMEOUT_MIN", str(DEFAULT_TIMEOUT_MIN))
    raw = per_label or base
    try:
        minutes = float(raw)
    except (TypeError, ValueError):
        minutes = DEFAULT_TIMEOUT_MIN
    # A non-positive budget would mean "kill instantly"; treat it as the default
    # rather than silently disabling every scrape.
    if minutes <= 0:
        minutes = DEFAULT_TIMEOUT_MIN
    return int(minutes * 60)


def isolation_mode() -> str:
    mode = (os.getenv("SCRAPE_ISOLATION", "subprocess") or "").strip().lower()
    return mode if mode in ("subprocess", "thread") else "subprocess"


# ---------------------------------------------------------------------------
# Killing things
# ---------------------------------------------------------------------------

def _kill_process_group(proc: subprocess.Popen) -> None:
    """
    Kill the child AND everything it spawned.

    POSIX: the child was started with `start_new_session=True`, so it is a
    process-group leader and `killpg` reaches the Playwright driver and every
    chrome it launched. Windows: `taskkill /T /F` walks the tree.
    """
    if proc.poll() is not None:
        return
    try:
        if os.name == 'nt':
            subprocess.run(
                ['taskkill', '/PID', str(proc.pid), '/T', '/F'],
                capture_output=True, timeout=30,
            )
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        # Last resort — at least kill the direct child.
        try:
            proc.kill()
        except Exception:
            pass
    try:
        proc.wait(timeout=30)
    except Exception:
        pass


def kill_leaked_playwright_children(log: Callable[[str], None]) -> int:
    """
    Kill stray Playwright driver / headless-chrome processes that are CHILDREN
    OF THIS PROCESS. Used by the thread fallback, where nothing else will.

    Deliberately scoped to our own descendants: a name-wide sweep on a shared
    box is how you kill someone else's live run.
    """
    killed = 0
    if os.name == 'nt':
        return killed
    me = os.getpid()
    try:
        children = subprocess.run(
            ['ps', '-eo', 'pid=,ppid=,args='],
            capture_output=True, text=True, timeout=30,
        ).stdout.splitlines()
    except Exception as e:
        log(f"    [reap] could not list processes: {e}")
        return killed

    # Build pid -> (ppid, args) and walk down from our own pid so we only ever
    # touch our descendants.
    table: Dict[int, tuple] = {}
    for line in children:
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        try:
            table[int(parts[0])] = (int(parts[1]), parts[2])
        except ValueError:
            continue

    descendants = set()
    changed = True
    while changed:
        changed = False
        for pid, (ppid, _args) in table.items():
            if pid not in descendants and (ppid == me or ppid in descendants):
                descendants.add(pid)
                changed = True

    for pid in descendants:
        args = table[pid][1]
        if any(needle in args for needle in LEAKED_PROC_NEEDLES):
            try:
                os.kill(pid, signal.SIGKILL)
                killed += 1
                log(f"    [reap] killed leaked pid={pid} ({args[:80]})")
            except Exception:
                pass
    return killed


# ---------------------------------------------------------------------------
# Subprocess path
# ---------------------------------------------------------------------------

def run_in_subprocess(
    label: str,
    target: str,
    log: Callable[[str], None],
    timeout: Optional[int] = None,
    python_bin: Optional[str] = None,
    child_script: Optional[str] = None,
) -> Optional[Any]:
    """
    Run one scrape target as an isolated child process with a hard timeout.

    Returns the target's result dict, or None if it timed out / failed.
    NEVER raises, NEVER blocks past `timeout` (+ a bounded kill wait).
    """
    timeout = timeout if timeout is not None else timeout_seconds(label)
    python_bin = python_bin or sys.executable or os.getenv("PYTHON_BIN", "python3")
    child_script = child_script or str(SCRIPT_DIR / 'scrape_child.py')

    fd, result_path = tempfile.mkstemp(prefix=f'scrape-{label}-', suffix='.json')
    os.close(fd)
    os.unlink(result_path)  # the child creates it; absence == no result

    cmd = [python_bin, child_script, '--target', target,
           '--label', label, '--result-file', result_path]

    env = dict(os.environ)
    env.setdefault('PYTHONUNBUFFERED', '1')

    popen_kwargs: Dict[str, Any] = dict(
        cwd=str(SCRIPT_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors='replace',
    )
    if os.name == 'nt':
        popen_kwargs['creationflags'] = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
    else:
        popen_kwargs['start_new_session'] = True  # own process group -> killpg

    started = time.time()
    log(f"  [{label}] subprocess start (timeout {timeout}s): {target}")
    try:
        proc = subprocess.Popen(cmd, **popen_kwargs)
    except Exception as e:
        log(f"  [{label}] could not spawn child: {type(e).__name__}: {e}")
        return None

    timed_out = False
    try:
        out, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        elapsed = int(time.time() - started)
        log(f"  [{label}] TIMEOUT after {elapsed}s — killing process group "
            f"(pid {proc.pid}) and every browser/driver it spawned")
        _kill_process_group(proc)
        try:
            out, _ = proc.communicate(timeout=30)
        except Exception:
            out = ''
    except Exception as e:
        log(f"  [{label}] child communicate failed: {type(e).__name__}: {e}")
        _kill_process_group(proc)
        out = ''

    # Tee the child's log into ours, bounded so a runaway scraper cannot fill
    # the scheduler log with megabytes.
    if out:
        lines = out.splitlines()
        cap = int(os.getenv("SCRAPE_CHILD_LOG_LINES", "400"))
        if len(lines) > cap:
            head, tail = lines[:cap // 2], lines[-(cap // 2):]
            lines = head + [f"    ... [{len(out.splitlines()) - cap} child log lines elided] ..."] + tail
        for line in lines:
            log(f"    | {line}")

    result = None
    try:
        if os.path.exists(result_path):
            with open(result_path, 'r', encoding='utf-8') as fh:
                result = json.load(fh)
    except Exception as e:
        log(f"  [{label}] could not read child result: {e}")
    finally:
        for p in (result_path, result_path + '.part'):
            try:
                os.unlink(p)
            except OSError:
                pass

    if timed_out:
        return None
    if isinstance(result, dict) and 'error' in result and 'total_auctions' not in result:
        log(f"  [{label}] child reported error: {result.get('error')}")
        return None
    if proc.returncode not in (0, None):
        log(f"  [{label}] child exited {proc.returncode}")
        if result is None:
            return None

    log(f"  [{label}] subprocess done in {int(time.time() - started)}s")
    return result


# ---------------------------------------------------------------------------
# Thread path (fallback)
# ---------------------------------------------------------------------------

def run_in_thread(
    label: str,
    fn: Callable[..., Any],
    log: Callable[[str], None],
    timeout: Optional[int] = None,
    args: tuple = (),
    kwargs: Optional[dict] = None,
) -> Optional[Any]:
    """
    Run `fn` on a fresh loop-free thread with a HARD join timeout.

    On expiry: log loudly, reap our own leaked Playwright children, and RETURN.
    The thread is `daemon=True` precisely so a wedged scrape can never keep the
    interpreter alive at shutdown — the old code used `daemon=False`, which
    turned a hung scrape into a hung container stop as well.
    """
    timeout = timeout if timeout is not None else timeout_seconds(label)
    kwargs = kwargs or {}
    box: Dict[str, Any] = {}

    def _worker():
        try:
            box['result'] = fn(*args, **kwargs)
        except BaseException as e:  # noqa: BLE001
            import traceback
            box['error'] = e
            box['traceback'] = traceback.format_exc()

    t = threading.Thread(target=_worker, name=f"scrape-{label}", daemon=True)
    started = time.time()
    t.start()
    t.join(timeout)

    if t.is_alive():
        log(f"  [{label}] TIMEOUT after {int(time.time() - started)}s — abandoning "
            f"the scrape thread (it is a daemon and cannot block shutdown) and "
            f"reaping leaked browser/driver children")
        killed = kill_leaked_playwright_children(log)
        log(f"  [{label}] reaped {killed} leaked child process(es); lock released")
        return None

    if 'error' in box:
        log(f"  [{label}] scrape thread crashed: "
            f"{type(box['error']).__name__}: {box['error']}")
        log(box.get('traceback', ''))
        return None
    return box.get('result')


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def run_scrape(
    label: str,
    fn: Callable[..., Any],
    log: Callable[[str], None],
    args: tuple = (),
    kwargs: Optional[dict] = None,
    timeout: Optional[int] = None,
) -> Optional[Any]:
    """
    Run one scrape under a hard timeout, preferring the subprocess path.

    `fn` is the caller's in-process closure; it is used when the label has no
    registered subprocess target, or when `SCRAPE_ISOLATION=thread`.
    """
    from scrape_targets import SUBPROCESS_TARGETS

    target = SUBPROCESS_TARGETS.get(label)
    if target and isolation_mode() == 'subprocess' and not args and not kwargs:
        return run_in_subprocess(label, target, log, timeout=timeout)

    if target and (args or kwargs):
        log(f"  [{label}] extra args present — falling back to the thread path")
    elif not target:
        log(f"  [{label}] no subprocess target registered — thread path "
            f"(hard join timeout still applies)")

    return run_in_thread(label, fn, log, timeout=timeout, args=args, kwargs=kwargs)
