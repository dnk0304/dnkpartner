"""
Task modules for SubastaPro scraper
"""
from .discovery_tasks import (
    discover_boe_province,
    discover_boe_all_provinces,
    discover_teju,
    discover_sede,
    discover_registro,
    discover_borme
)

from .pulse_tasks import (
    pulse_check_active,
    urgent_pulse
)

from .lifecycle_tasks import (
    check_status_transitions,
    check_cancelled_auctions
)

from .backfill_tasks import (
    backfill_historical,
    archive_old_auctions,
    cleanup_duplicates,
    geocode_missing_coordinates,
    backfill_streetview_images,
)

__all__ = [
    # Discovery
    'discover_boe_province',
    'discover_boe_all_provinces',
    'discover_teju',
    'discover_sede',
    'discover_registro',
    'discover_borme',
    
    # Pulse
    'pulse_check_active',
    'urgent_pulse',
    
    # Lifecycle
    'check_status_transitions',
    'check_cancelled_auctions',
    
    # Backfill
    'backfill_historical',
    'archive_old_auctions',
    'cleanup_duplicates',
    'geocode_missing_coordinates',
    'backfill_streetview_images',
]
