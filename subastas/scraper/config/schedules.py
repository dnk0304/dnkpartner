"""
Schedules Module
Celery beat schedules for automated scraping tasks
"""

from datetime import timedelta

# Scrape schedules configuration
SCRAPE_SCHEDULES = {
    # Discovery tasks - find new auctions
    'discover_boe_all_provinces': {
        'task': 'tasks.discovery_tasks.discover_boe_all_provinces',
        'schedule': timedelta(hours=2),  # Every 2 hours
        'description': 'Scrape BOE for all 50 provinces (staggered)',
        'enabled': True,
    },
    
    'discover_teju': {
        'task': 'tasks.discovery_tasks.discover_teju',
        'schedule': timedelta(hours=4),  # Every 4 hours
        'description': 'Scan TEJU for pre-auction edicts',
        'enabled': True,
    },
    
    'discover_sede': {
        'task': 'tasks.discovery_tasks.discover_sede',
        'schedule': timedelta(days=1),  # Daily at 06:00
        'description': 'Scan Sede Judicial for court proceedings',
        'enabled': True,
    },
    
    'discover_registro': {
        'task': 'tasks.discovery_tasks.discover_registro',
        'schedule': timedelta(days=1),  # Daily at 07:00
        'description': 'Scan Registro de la Propiedad for liens',
        'enabled': False,  # Enable when ready
    },
    
    'discover_borme': {
        'task': 'tasks.discovery_tasks.discover_borme',
        'schedule': timedelta(days=1),  # Daily at 09:00
        'description': 'Scan BORME for commercial auctions',
        'enabled': False,  # Enable when ready
    },
    
    # Pulse tasks - update existing auctions
    'pulse_check_active': {
        'task': 'tasks.pulse_tasks.pulse_check_active',
        'schedule': timedelta(hours=1),  # Every hour
        'description': 'Update bids for active auctions',
        'enabled': True,
    },
    
    'urgent_pulse': {
        'task': 'tasks.pulse_tasks.urgent_pulse',
        'schedule': timedelta(minutes=30),  # Every 30 minutes
        'description': 'Urgent pulse for auctions ending < 24h',
        'enabled': True,
    },
    
    # Lifecycle tasks - manage auction status transitions
    'check_status_transitions': {
        'task': 'tasks.lifecycle_tasks.check_status_transitions',
        'schedule': timedelta(hours=1),  # Every hour
        'description': 'Check PRE_AUCTION -> ACTIVE -> FINISHED transitions',
        'enabled': True,
    },
    
    # Backfill tasks - historical data
    'backfill_historical': {
        'task': 'tasks.backfill_tasks.backfill_historical',
        'schedule': timedelta(days=7),  # Weekly on Sunday 02:00
        'description': 'Archive finished auctions',
        'enabled': False,  # Enable when needed
    },
}


def get_celery_beat_schedule():
    """
    Convert SCRAPE_SCHEDULES to Celery beat format
    Filters out disabled tasks
    """
    beat_schedule = {}
    
    for task_name, config in SCRAPE_SCHEDULES.items():
        if config.get('enabled', True):
            beat_schedule[task_name] = {
                'task': config['task'],
                'schedule': config['schedule'],
            }
    
    return beat_schedule


def get_enabled_tasks():
    """Get list of enabled task names"""
    return [
        name for name, config in SCRAPE_SCHEDULES.items()
        if config.get('enabled', True)
    ]


def get_task_info(task_name: str) -> dict:
    """Get detailed info for a task"""
    return SCRAPE_SCHEDULES.get(task_name, {})
