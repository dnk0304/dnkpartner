#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_targets — SN-5: the subprocess-able scrape entrypoints.

WHY THIS FILE EXISTS
--------------------
`scheduler._run_sync_scrape(label, fn, ...)` receives a *closure*, which cannot
be handed to a subprocess. But every closure it is given today reduces to
"import one module, call one zero-argument function, get a JSON-able progress
dict back". This module makes that reduction explicit:

  * `SUBPROCESS_TARGETS` maps the scheduler's existing LABEL to a
    `"module:callable"` spec, so NO call site in scheduler.py has to change.
  * Targets that need a little setup (the JUDICIAL 5-day window) get a thin
    wrapper here rather than a new symbol inside a scraper module, so the
    scraper files stay untouched.

Anything NOT in the registry falls back to the in-process thread path with a
hard join timeout — see `scrape_runner.run_scrape`.

CONTRACT FOR A TARGET CALLABLE
------------------------------
  * takes no arguments
  * returns a JSON-serialisable dict (the "progress" dict: `total_auctions`,
    `errors`, ...) or None
  * owns and tears down its OWN Playwright lifecycle
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict


# ---------------------------------------------------------------------------
# Wrappers
# ---------------------------------------------------------------------------

def judicial_daily_update() -> Dict[str, Any]:
    """
    Rolling 5-day BOE JUDICIAL update — the subprocess form of the closure in
    `scheduler.run_daily_update_scraper`. Identical semantics: fresh 5-day
    window, `resume=False`, browser closed in a `finally`.
    """
    import sys
    sys.path.insert(0, '/')
    from app.scrapers.boe_parallel_scraper import BOEParallelScraper  # type: ignore

    today = datetime.now()
    start = today - timedelta(days=5)

    scraper = BOEParallelScraper(scraper_id=1)
    try:
        return scraper.scrape_date_range(
            start_year=start.year, start_month=start.month, start_day=start.day,
            end_year=today.year, end_month=today.month, end_day=today.day,
            resume=False,
        )
    finally:
        scraper._close_own_browser()


# ---------------------------------------------------------------------------
# Registry: scheduler label -> "module:callable"
# ---------------------------------------------------------------------------
# Keys are EXACTLY the labels already passed to `_run_sync_scrape`, so adding a
# label here is the only thing needed to move a job onto the subprocess path.
#
# Deliberately ABSENT (they stay on the hard-timeout thread path because their
# closures read scheduler/DB state that a child process cannot be handed
# cheaply): PREAUCTION_WITHDRAW_VERIFY, SUSPENDED_RECHECK, BOE_RECONCILE.
SUBPROCESS_TARGETS: Dict[str, str] = {
    "JUDICIAL":           "scrape_targets:judicial_daily_update",
    "NOTARIAL":           "app.scrapers.notarial_scraper:run_daily_update",
    "AEAT":               "app.scrapers.aeat_scraper:run_daily_update",
    "OTRAS_TRIBUTARIAS":  "app.scrapers.otras_tributarias_scraper:run_daily_update",
    "ADMINISTRATIVAS":    "app.scrapers.administrativas_scraper:run_daily_update",
    "SEGSOCIAL":          "app.scrapers.segsocial_scraper:run_daily_update",
    "PLABI":              "app.scrapers.plabi_scraper:run_daily_update",
    "PREAUCTION_PA":      "app.scrapers.boe_preauction_scraper:run_discovery",
}


def resolve(spec: str):
    """Resolve a `"module:callable"` spec to the callable. Raises on failure."""
    import importlib
    import sys
    if ':' not in spec:
        raise ValueError(f"bad target spec (want 'module:callable'): {spec!r}")
    mod_name, fn_name = spec.split(':', 1)
    # The container puts the scraper tree at /app and the package root at / —
    # the same two-step every scrape closure in scheduler.py does today.
    sys.path.insert(0, '/')
    mod = importlib.import_module(mod_name)
    fn = getattr(mod, fn_name, None)
    if fn is None or not callable(fn):
        raise AttributeError(f"{mod_name} has no callable {fn_name!r}")
    return fn
