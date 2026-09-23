#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_child — SN-5: the child process that runs exactly ONE scrape.

    python /app/scrape_child.py --target app.scrapers.notarial_scraper:run_daily_update \
                               --result-file /tmp/scrape-xxxx.json

WHY A RESULT *FILE* AND NOT STDOUT
----------------------------------
Every scraper logs prose to stdout (progress lines, Playwright warnings, the
occasional traceback). Parsing a JSON document out of that stream is a guessing
game that goes wrong quietly — a log line containing a brace is enough. The
result therefore goes to a file the parent names, and stdout stays what it has
always been: a log the parent tees into the scheduler log.

EXIT CODES
----------
  0  target ran to completion; result written (possibly `null`)
  1  target raised; `{"error": ...,"traceback": ...}` written
  2  bad invocation (unresolvable target)

A child killed on timeout writes nothing — the parent treats a missing/partial
result file as a failed run, which is exactly right.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _write(path: str, payload) -> None:
    if not path:
        return
    tmp = f"{path}.part"
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, default=str)
    os.replace(tmp, path)  # atomic: the parent never reads a half-written file


def main() -> int:
    ap = argparse.ArgumentParser(description='Run one scrape target in isolation')
    ap.add_argument('--target', required=True, help='module:callable')
    ap.add_argument('--result-file', default='', help='where to write the JSON result')
    ap.add_argument('--label', default='', help='label, for logging only')
    args = ap.parse_args()

    label = args.label or args.target

    try:
        from scrape_targets import resolve
        fn = resolve(args.target)
    except Exception as e:
        print(f"[scrape_child:{label}] cannot resolve target: {e}", flush=True)
        _write(args.result_file, {"error": f"unresolvable target: {e}"})
        return 2

    print(f"[scrape_child:{label}] pid={os.getpid()} running {args.target}", flush=True)
    try:
        result = fn()
    except BaseException as e:  # noqa: BLE001 — surface everything to the parent
        tb = traceback.format_exc()
        print(f"[scrape_child:{label}] FAILED: {type(e).__name__}: {e}", flush=True)
        print(tb, flush=True)
        _write(args.result_file, {"error": f"{type(e).__name__}: {e}", "traceback": tb})
        return 1

    _write(args.result_file, result)
    print(f"[scrape_child:{label}] done", flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
