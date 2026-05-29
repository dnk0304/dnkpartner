"""
Celery configuration for SubastaPro scraper
"""
from celery import Celery
from celery.schedules import crontab
import os
from dotenv import load_dotenv

load_dotenv()

# Redis connection for broker and backend
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# Initialize Celery app
app = Celery(
    'subastapro_scraper',
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        'tasks.discovery_tasks',
        'tasks.pulse_tasks',
        'tasks.lifecycle_tasks',
        'tasks.backfill_tasks'
    ]
)

# Celery Configuration
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Atlantic/Canary',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes max per task
    task_soft_time_limit=25 * 60,  # Soft limit at 25 minutes
    worker_prefetch_multiplier=1,  # Process one task at a time
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks to prevent memory leaks
)

# Periodic Task Schedule
# Updated with 1-hour BOE limit and all source schedules
app.conf.beat_schedule = {
    # ==================================================
    # BOE DISCOVERY - Every 2 hours (respects 1-hour rate limit)
    # ==================================================
    'discover-boe-all-provinces': {
        'task': 'tasks.discover_boe_all_provinces',
        'schedule': crontab(minute=0, hour='*/2'),  # Every 2 hours
        'options': {'expires': 7200}  # 2 hour expiry
    },
    
    # ==================================================
    # PULSE CHECKS - Active auction bid updates
    # ==================================================
    'pulse-check-active': {
        'task': 'tasks.pulse_check_active',
        'schedule': crontab(minute=0, hour='*'),  # Every 1 hour (respects 30-min limit)
        'options': {'expires': 3600}
    },
    'urgent-pulse': {
        'task': 'tasks.urgent_pulse',
        'schedule': crontab(minute='*/30'),  # Every 30 minutes for ending-soon auctions
        'options': {'expires': 1800}
    },
    
    # ==================================================
    # PRE-AUCTION SOURCES - Discovery tasks
    # ==================================================
    'discover-teju': {
        'task': 'tasks.discover_teju',
        'schedule': crontab(minute=0, hour='*/4'),  # Every 4 hours
        'options': {'expires': 14400}
    },
    'discover-sede': {
        'task': 'tasks.discover_sede',
        'schedule': crontab(hour=6, minute=0),  # Daily at 06:00
        'options': {'expires': 86400}
    },
    'discover-registro': {
        'task': 'tasks.discover_registro',
        'schedule': crontab(hour=7, minute=0),  # Daily at 07:00
        'options': {'expires': 86400}
    },
    'discover-borme': {
        'task': 'tasks.discover_borme',
        'schedule': crontab(hour=9, minute=0),  # Daily at 09:00
        'options': {'expires': 86400}
    },
    
    # ==================================================
    # LIFECYCLE MANAGEMENT
    # ==================================================
    'check-status-transitions': {
        'task': 'tasks.check_status_transitions',
        'schedule': crontab(minute=0, hour='*'),  # Every 1 hour
        'options': {'expires': 3600}
    },
    'check-cancelled-auctions': {
        'task': 'tasks.check_cancelled_auctions',
        'schedule': crontab(hour=10, minute=0),  # Daily at 10:00
        'options': {'expires': 86400}
    },
    
    # ==================================================
    # BACKFILL & MAINTENANCE
    # ==================================================
    'backfill-historical': {
        'task': 'tasks.backfill_historical',
        'schedule': crontab(hour=2, minute=0, day_of_week=0),  # Sunday at 02:00
        'options': {'expires': 604800}  # 1 week
    },
    'archive-old-auctions': {
        'task': 'tasks.archive_old_auctions',
        'schedule': crontab(hour=3, minute=0, day_of_month=1),  # 1st of month at 03:00
        'options': {'expires': 2592000}  # 30 days
    },
    'cleanup-duplicates': {
        'task': 'tasks.cleanup_duplicates',
        'schedule': crontab(hour=4, minute=0, day_of_week=0),  # Sunday at 04:00
        'options': {'expires': 604800}
    },
    'geocode-missing-coordinates': {
        'task': 'tasks.geocode_missing_coordinates',
        'schedule': crontab(hour=5, minute=0),  # Daily at 05:00
        'options': {'expires': 86400}
    },
}

# Task routing
app.conf.task_routes = {
    'tasks.discover_*': {'queue': 'discovery'},
    'tasks.pulse_*': {'queue': 'pulse'},
    'tasks.urgent_*': {'queue': 'urgent'},
    'tasks.check_*': {'queue': 'lifecycle'},
    'tasks.backfill_*': {'queue': 'maintenance'},
    'tasks.archive_*': {'queue': 'maintenance'},
    'tasks.cleanup_*': {'queue': 'maintenance'},
    'tasks.geocode_*': {'queue': 'maintenance'},
}
