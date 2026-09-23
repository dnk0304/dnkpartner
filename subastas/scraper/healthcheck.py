#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
healthcheck — SN-5: what Docker polls to decide the scheduler is alive.

    HEALTHCHECK CMD python /app/healthcheck.py

Exit 0 = the dispatch tick has run within STALL_ALERT_MIN (default 15 min).
Exit 1 = stale, missing, or unreadable heartbeat => container UNHEALTHY.

Process liveness is NOT the signal: on 2026-09-23 the process was alive and
doing nothing for ~8h. The signal is the work.

Grace period: a missing heartbeat is only unhealthy once the recorded
`started_at` is older than the threshold, so the container is not marked
unhealthy during boot before the first tick lands. Compose's `start_period`
covers the same ground; both together are cheap.
"""

from __future__ import annotations

import sys


def main() -> int:
    try:
        from watchdog import PRIMARY_TICK, is_stalled, read_heartbeat, \
            stall_threshold_seconds, tick_age_seconds
    except Exception as e:  # noqa: BLE001
        print(f"healthcheck: cannot import watchdog: {e}")
        return 1

    data = read_heartbeat()
    if not data:
        print("healthcheck: UNHEALTHY — no heartbeat file")
        return 1

    threshold = stall_threshold_seconds()
    stalled, age = is_stalled(data, threshold)
    age_txt = f"{int(age)}s" if age is not None else "never"

    if stalled:
        print(f"healthcheck: UNHEALTHY — {PRIMARY_TICK} tick {age_txt} "
              f"(threshold {threshold}s)")
        return 1

    others = {k: tick_age_seconds(data, k) for k in (data.get('ticks') or {})}
    print(f"healthcheck: OK — {PRIMARY_TICK} {age_txt} (threshold {threshold}s); "
          + ", ".join(f"{k}={int(v)}s" for k, v in sorted(others.items()) if v is not None))
    return 0


if __name__ == '__main__':
    sys.exit(main())
