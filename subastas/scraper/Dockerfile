# Dockerfile for SubastaPro Scraper
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install --with-deps chromium

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p /app/logs

# Set Python path
ENV PYTHONPATH=/app

# SN-5: stdout was BLOCK-buffered, so `docker logs` lagged the file log by
# HOURS and the 2026-09-23 stall was invisible there. Unbuffered from now on.
ENV PYTHONUNBUFFERED=1

# SN-5 T4: liveness of the WORK, not of the process. Fails when the
# dispatch tick has not stamped /app/logs/heartbeat.json within
# STALL_ALERT_MIN (default 15 min). start-period covers boot.
HEALTHCHECK --interval=2m --timeout=20s --start-period=5m --retries=2 CMD python /app/healthcheck.py || exit 1

# Default command (can be overridden in docker-compose)
CMD ["celery", "-A", "tasks.celeryconfig", "worker", "--loglevel=info"]
