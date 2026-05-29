# Pipeline System Documentation

## Overview

The file-based pipeline system provides a robust, scalable architecture for managing auction data from scraping to display.

## Directory Structure

```
data/auctions/
├── 1_scraped/      # Raw scraped data from sources
├── 2_enriched/     # Validated and enriched data
├── 3_processed/    # Final data (in database)
└── 4_archived/     # Finished/expired auctions
```

## Pipeline Stages

### Stage 1: Scraping → `1_scraped/`
**Watchers:** Scrapers (boe_scraper.py, teju_scraper.py)
**Input:** Web scraping
**Output:** JSON files in `1_scraped/`

**File Format:**
```json
{
  "id": "BOE-12345",
  "source": "BOE",
  "stage": "scraped",
  "scraped_at": "2026-01-28T19:00:00Z",
  "version": 1,
  "data": {
    "boeId": "12345",
    "title": "...",
    "province": "Las Palmas",
    ...
  },
  "metadata": {
    "needs_enrichment": true,
    "needs_geocoding": true
  }
}
```

### Stage 2: Enrichment → `2_enriched/`
**Watcher:** `pipeline/2_enricher.py`
**Input:** Files from `1_scraped/`
**Output:** Enriched files in `2_enriched/`

**Tasks:**
- Validate data structure
- Geocode addresses
- Generate map images
- Extract metadata

### Stage 3: Processing → `3_processed/`
**Watcher:** `pipeline/3_processor.py`
**Input:** Files from `2_enriched/`
**Output:** Files in `3_processed/` + Database updates

**Tasks:**
- Insert/update SQLite database
- Update search indexes
- Mark as processed

### Stage 4: Change Detection → `4_archived/`
**Watcher:** `pipeline/4_change_detector.py`
**Input:** Files from `3_processed/`
**Output:** Reprocessing or archiving

**Tasks:**
- Periodically check for changes
- Move changed auctions back to `1_scraped/`
- Archive finished auctions to `4_archived/`

## Running the Pipeline

### Migration (One-time)
Export existing database auctions to files:
```bash
node pipeline/migrate_to_files.js
```

### Start All Watchers
```bash
# Terminal 1 - Enricher
python pipeline/2_enricher.py

# Terminal 2 - Processor
python pipeline/3_processor.py

# Terminal 3 - Change Detector (optional, runs every hour)
python pipeline/4_change_detector.py

# Terminal 4 - Scrapers (as usual)
python scraper/scheduler.py
```

### Or use concurrently (recommended)
Add to `package.json`:
```json
{
  "scripts": {
    "pipeline": "concurrently \"python pipeline/2_enricher.py\" \"python pipeline/3_processor.py\" \"python pipeline/4_change_detector.py\""
  }
}
```

Then: `npm run pipeline`

## Scraper Integration

### Update scrapers to use pipeline:
Instead of:
```python
from db import upsert_auction
```

Use:
```python
from scraper.pipeline_adapter import upsert_auction
```

The adapter automatically saves to `1_scraped/` instead of database.

## Benefits

1. **Resilient** - No data loss, can resume from any point
2. **Debuggable** - Inspect files at any stage
3. **Fast Reads** - Database for queries, files for raw data
4. **Scalable** - Parallel processing, easy to add stages
5. **Audit Trail** - Full history of changes

## Monitoring

Watch the watchers:
```bash
# Check scraped files waiting for enrichment
ls -l data/auctions/1_scraped/

# Check enriched files waiting for processing
ls -l data/auctions/2_enriched/

# Check processed files (current)
ls -l data/auctions/3_processed/

# Check archived files
ls -l data/auctions/4_archived/
```

## Troubleshooting

### Files stuck in 1_scraped/
- Enricher not running
- Check enricher logs for errors

### Files stuck in 2_enriched/
- Processor not running
- Database connection issue

### Slow performance
- Too many files accumulating
- Run change detector more frequently
- Archive old auctions

### Missing auctions in app
- Check if file exists in 3_processed/
- Check if database was updated
- Restart processor

## Performance Tips

1. **Archive regularly** - Move old auctions to keep directories small
2. **Batch processing** - Process multiple files at once
3. **Parallel stages** - Run multiple enrichers if needed
4. **Cache results** - Don't re-enrich unchanged data
