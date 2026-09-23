#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
watchdog — SN-5: heartbeat, stall detection and the one admin mail per stall.

WHY: on 2026-09-23 the scheduler stopped ticking at 05:03Z and NOTHING said so.
It was found ~8h later, by hand, because a user-visible mail did not arrive. The
scheduler was "up" the whole time — the container was healthy, the process was
alive, the log was block-buffered and hours behind. Liveness of the process is
not liveness of the work.

So the work reports itself:

  * every light tick stamps `/app/logs/heartbeat.json` (T4)
  * `healthcheck.py` reads that file and fails when the DISPATCH stamp is older
    than STALL_ALERT_MIN — this is what Docker/compose polls
  * `StallMonitor` runs in-process on its own thread and, the moment the
    dispatch stamp goes stale, sends exactly ONE admin mail per stall episode
    (re-armed when ticks resume), and optionally self-exits so the container's
    restart policy recovers it without a human.

THE MAIL PATH IS DELIBERATELY NOT THE APP. It reuses the SAME provider and the
SAME envs as SN-2 (`RESEND_API_KEY`, `EMAIL_FROM_ALERTS`/`RESEND_FROM_EMAIL`,
`ADMIN_NOTIFY_EMAIL`) — no new provider, no new key — but posts directly to
Resend rather than through an app route, because an alert about the scheduler
must not depend on the app container being reachable.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

#: The tick whose staleness defines "stalled". It is the 1-minute job, so it is
#: the most sensitive signal available, and it is the one that actually sends
#: user mail.
PRIMARY_TICK = "dispatch"

DEFAULT_STALL_MIN = 15
RESEND_ENDPOINT = "https://api.resend.com/emails"
DEFAULT_ALERTS_FROM = "SubastasActivas <alertas@subastasactivas.com>"
DEFAULT_ADMIN_TO = "hola@subastasactivas.com"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def stall_threshold_seconds() -> int:
    try:
        minutes = float(os.getenv("STALL_ALERT_MIN", str(DEFAULT_STALL_MIN)))
    except (TypeError, ValueError):
        minutes = DEFAULT_STALL_MIN
    if minutes <= 0:
        minutes = DEFAULT_STALL_MIN
    return int(minutes * 60)


def heartbeat_path() -> Path:
    explicit = os.getenv("HEARTBEAT_PATH")
    if explicit:
        return Path(explicit)
    log_dir = os.getenv("LOG_DIR", "/app/logs")
    return Path(log_dir) / "heartbeat.json"


# ---------------------------------------------------------------------------
# Heartbeat file
# ---------------------------------------------------------------------------

class Heartbeat:
    """Records the last successful run of each light tick. Never raises."""

    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path else heartbeat_path()
        self._lock = threading.Lock()
        self._ticks: Dict[str, str] = {}
        self._started_at = _now().isoformat()

    def stamp(self, name: str) -> None:
        """Record that tick `name` just completed. Safe from any thread."""
        with self._lock:
            self._ticks[name] = _now().isoformat()
            payload = {
                "pid": os.getpid(),
                "started_at": self._started_at,
                "written_at": self._ticks[name],
                "ticks": dict(self._ticks),
            }
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(self.path.suffix + ".part")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, self.path)  # atomic — a reader never sees a partial file
        except Exception:
            # A heartbeat that cannot be written must not take the tick down
            # with it. Staleness will surface it.
            pass

    def read(self) -> dict:
        return read_heartbeat(self.path)


def read_heartbeat(path: Optional[Path] = None) -> dict:
    """Read the heartbeat file. Returns {} when missing or unreadable."""
    p = Path(path) if path else heartbeat_path()
    try:
        with open(p, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def tick_age_seconds(data: dict, name: str, now: Optional[datetime] = None) -> Optional[float]:
    """
    Age of tick `name` in seconds, or None when it has never been recorded.

    A never-recorded tick is NOT age-zero and NOT infinitely stale: the caller
    decides. (At boot, before the first tick, "missing" must not page anyone.)
    """
    raw = (data.get("ticks") or {}).get(name)
    if not raw:
        return None
    try:
        stamped = datetime.fromisoformat(raw)
    except (TypeError, ValueError):
        return None
    if stamped.tzinfo is None:
        stamped = stamped.replace(tzinfo=timezone.utc)
    return ((now or _now()) - stamped).total_seconds()


def is_stalled(
    data: dict,
    threshold_s: Optional[int] = None,
    now: Optional[datetime] = None,
    tick: str = PRIMARY_TICK,
) -> Tuple[bool, Optional[float]]:
    """
    (stalled, age_seconds) for the primary tick.

    A MISSING heartbeat file counts as stalled only once the process has been up
    longer than the threshold — otherwise every boot would alert before the
    first tick lands.
    """
    threshold_s = threshold_s if threshold_s is not None else stall_threshold_seconds()
    age = tick_age_seconds(data, tick, now=now)
    if age is not None:
        return (age > threshold_s, age)

    started = data.get("started_at")
    if not started:
        return (False, None)  # nothing to judge yet
    try:
        t0 = datetime.fromisoformat(started)
        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return (False, None)
    uptime = ((now or _now()) - t0).total_seconds()
    return (uptime > threshold_s, None)


def stale_summary(data: dict, now: Optional[datetime] = None) -> List[str]:
    """Human-readable age of every recorded tick, for the alert body."""
    out = []
    for name in sorted((data.get("ticks") or {}).keys()):
        age = tick_age_seconds(data, name, now=now)
        out.append(f"{name}: {int(age)}s ago" if age is not None else f"{name}: never")
    return out


# ---------------------------------------------------------------------------
# Admin mail (Resend, same envs as SN-2)
# ---------------------------------------------------------------------------

def send_admin_stall_mail(subject: str, body: str,
                          log: Callable[[str], None] = print) -> str:
    """
    Send ONE plain-text operator mail. Returns a status string; NEVER raises —
    a failed alert must not take down the thing that noticed the failure.
    """
    key = os.getenv("RESEND_API_KEY")
    if not key:
        log("  [watchdog] RESEND_API_KEY not set — stall alert NOT sent")
        return "no-resend-key"

    to = os.getenv("ADMIN_NOTIFY_EMAIL")
    if not to:
        log("  [watchdog] ADMIN_NOTIFY_EMAIL not set — falling back to the hola@ alias")
        to = DEFAULT_ADMIN_TO
    sender = (os.getenv("EMAIL_FROM_ALERTS")
              or os.getenv("RESEND_FROM_EMAIL")
              or DEFAULT_ALERTS_FROM)

    payload = json.dumps({
        "from": sender, "to": to, "subject": subject, "text": body,
    }).encode("utf-8")
    req = urllib.request.Request(
        RESEND_ENDPOINT, data=payload, method="POST",
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        log(f"  [watchdog] stall alert mailed to {to}")
        return "sent"
    except urllib.error.HTTPError as e:
        log(f"  [watchdog] stall alert HTTP {e.code}: {e.read()[:300]!r}")
        return "send-failed"
    except Exception as e:  # noqa: BLE001
        log(f"  [watchdog] stall alert failed: {type(e).__name__}: {e}")
        return "send-failed"


# ---------------------------------------------------------------------------
# In-process monitor
# ---------------------------------------------------------------------------

class StallMonitor(threading.Thread):
    """
    Daemon thread that watches the heartbeat and alerts once per stall episode.

    Runs in-process ON ITS OWN THREAD so it survives a wedged scrape lane and a
    wedged tick lane alike. `STALL_SELF_EXIT=1` makes it `os._exit()` after
    alerting, so a `restart: unless-stopped` container heals itself without the
    healthcheck having to be wired — belt to the healthcheck's braces.
    """

    def __init__(self, heartbeat: Heartbeat, log: Callable[[str], None],
                 threshold_s: Optional[int] = None, interval_s: int = 60):
        super().__init__(name="stall-monitor", daemon=True)
        self.hb = heartbeat
        self.log = log
        self.threshold_s = threshold_s if threshold_s is not None else stall_threshold_seconds()
        self.interval_s = interval_s
        self._stop = threading.Event()
        self.alerted = False  # armed/disarmed => exactly one mail per episode

    def stop(self) -> None:
        self._stop.set()

    def check_once(self, now: Optional[datetime] = None) -> bool:
        """One evaluation. Returns True if an alert was sent this call."""
        data = self.hb.read()
        stalled, age = is_stalled(data, self.threshold_s, now=now)

        if not stalled:
            if self.alerted:
                self.log(f"  [watchdog] ticks RESUMED ({PRIMARY_TICK} "
                         f"{int(age) if age is not None else '?'}s ago) — re-arming alert")
            self.alerted = False
            return False

        if self.alerted:
            return False  # one mail per episode, not one per minute

        age_txt = f"{int(age)}s" if age is not None else "never recorded"
        self.log(f"  [watchdog] STALL: {PRIMARY_TICK} tick last seen {age_txt} "
                 f"(threshold {self.threshold_s}s)")
        body = (
            "SubastasActivas scheduler STALL detected.\n\n"
            f"Primary tick : {PRIMARY_TICK}\n"
            f"Last seen    : {age_txt} ago\n"
            f"Threshold    : {self.threshold_s}s\n"
            f"Heartbeat    : {self.hb.path}\n"
            f"PID          : {data.get('pid')}\n"
            f"Booted at    : {data.get('started_at')}\n"
            f"Checked at   : {(now or _now()).isoformat()}\n\n"
            "Tick ages:\n  " + "\n  ".join(stale_summary(data, now=now) or ["(none)"]) + "\n\n"
            "Likely cause: a scrape wedged inside Playwright. Check "
            "/app/logs/scheduler_<date>.log for a [LABEL] TIMEOUT line.\n"
        )
        send_admin_stall_mail(
            "[SubastasActivas] scheduler stalled — no dispatch tick", body, self.log)
        self.alerted = True

        if os.getenv("STALL_SELF_EXIT", "").strip().lower() in ("1", "true", "yes"):
            self.log("  [watchdog] STALL_SELF_EXIT set — exiting so the container "
                     "restart policy recovers the scheduler")
            time.sleep(2)  # give the log a chance to flush
            os._exit(3)
        return True

    def run(self) -> None:
        self.log(f"  [watchdog] stall monitor started "
                 f"(threshold {self.threshold_s}s, poll {self.interval_s}s)")
        while not self._stop.is_set():
            try:
                self.check_once()
            except Exception as e:  # noqa: BLE001
                self.log(f"  [watchdog] monitor error: {type(e).__name__}: {e}")
            self._stop.wait(self.interval_s)
