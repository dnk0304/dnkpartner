"""
Task modules for SubastaPro scraper

NOTE (2026-06-01 corrective): submodule imports are guarded. Several task
modules (discovery_tasks, pulse_tasks, lifecycle_tasks) import Celery at module
top-level. Celery is NOT installed in the lightweight scheduler container — it
is only present in dedicated Celery worker images. Previously this package
__init__ eagerly imported all submodules, so merely doing
`from app.tasks.backfill_tasks import geocode_missing_coordinates` (which has no
Celery dependency) crashed the scheduler's geocode_drain with
`ModuleNotFoundError: No module named 'celery'`.

Guarding each import lets the package be imported in a Celery-less environment
while still re-exporting everything that successfully loads. Anything that fails
to import (because its optional deps are absent) is simply omitted from the
namespace — callers that need those tasks run in the Celery image where the
deps exist.
"""

__all__ = []


def _safe_export(module_name, names):
    """Import `names` from a sibling submodule; skip silently if its optional
    dependencies (e.g. celery) are unavailable in this environment."""
    try:
        module = __import__(f"{__name__}.{module_name}", fromlist=list(names))
    except Exception:  # noqa: BLE001 - optional dep (celery) may be absent
        return
    for name in names:
        if hasattr(module, name):
            globals()[name] = getattr(module, name)
            __all__.append(name)


_safe_export("discovery_tasks", (
    "discover_boe_province",
    "discover_boe_all_provinces",
    "discover_teju",
    "discover_sede",
    "discover_registro",
    "discover_borme",
))
_safe_export("pulse_tasks", (
    "pulse_check_active",
    "urgent_pulse",
))
_safe_export("lifecycle_tasks", (
    "check_status_transitions",
    "check_cancelled_auctions",
))
_safe_export("backfill_tasks", (
    "backfill_historical",
    "archive_old_auctions",
    "cleanup_duplicates",
    "geocode_missing_coordinates",
    "backfill_streetview_images",
))
