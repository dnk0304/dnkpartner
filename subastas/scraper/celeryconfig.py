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
    backend=REDIS_URL
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
)

# Periodic Task Schedule
app.conf.beat_schedule = {
    'discovery-sync-every-6-hours': {
        'task': 'tasks.discovery_sync',
        'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
    },
    'pulse-check-every-30-minutes': {
        'task': 'tasks.pulse_check',
        'schedule': crontab(minute='*/30'),  # Every 30 minutes
    },
    'urgent-pulse-every-15-minutes': {
        'task': 'tasks.urgent_pulse',
        'schedule': crontab(minute='*/15'),  # Every 15 minutes
    },
    'teju-scan-daily': {
        'task': 'tasks.teju_scan',
        'schedule': crontab(hour=8, minute=0),  # Daily at 08:00
    },
}
