# Province/Municipality Update Scrapers

This directory contains scrapers to update existing auction records with accurate province, municipality, and coordinate data from the BOE source.

## Problem

Currently, ~219,000 out of 229,000 auctions have invalid province data (`"Unknown"`, `"Desconocida"`, `"mapa de la zona"`, etc.). This causes:
- Incorrect statistics
- Map not showing auctions
- Province grid showing wrong data

## Solution

6 parallel scrapers that:
1. Query existing auctions with bad province data
2. Re-fetch detail pages from BOE
3. Extract accurate province/municipality information
4. Update database records
5. Process in 15-day batches to avoid rate limits

## Scraper Configuration

| Scraper | Date Range | Description |
|---------|------------|-------------|
| 1 | 2015-2017 | Historical auctions 2015-2017 |
| 2 | 2018-2019 | Historical auctions 2018-2019 |
| 3 | 2020-2021 | Historical auctions 2020-2021 |
| 4 | 2022-2023 | Recent auctions 2022-2023 |
| 5 | 2024-2025 | Recent auctions 2024-2025 |
| 6 | 2026-Now | Current year auctions |

## Usage

### Windows (PowerShell) - Recommended

```powershell
cd scraper
.\launch_province_updates.ps1
```

### Windows (Batch)

```cmd
cd scraper
launch_province_updates.bat
```

### Linux/Mac (Python)

```bash
cd scraper
python3 launch_province_updates.py
```

### Manual Launch (Single Scraper)

```bash
python scrapers/province_update_scraper.py --id 1 --start 2015-01-01 --end 2017-12-31
```

## Monitoring Progress

Each scraper creates two files:

1. **Progress File**: `province_update_{ID}_progress.json`
   - Tracks completed batches
   - Shows total updates/failures
   - Enables resume on restart

2. **Log File**: `province_update_{ID}_YYYYMMDD.log`
   - Detailed logging
   - Shows which auctions were updated
   - Error messages

### Example Progress File

```json
{
  "scraper_id": 1,
  "completed_batches": [
    "2015-01-01_to_2015-01-15",
    "2015-01-16_to_2015-01-30"
  ],
  "total_updated": 1234,
  "total_failed": 56,
  "total_batches": 50,
  "last_updated": "2026-02-11T15:30:00"
}
```

## Performance

- **Batch Size**: 15 days
- **Rate Limiting**: 5-7 seconds between requests
- **Parallel Scrapers**: 6 simultaneous
- **Expected Duration**: 2-3 hours for full update

## What Gets Updated

For each auction with invalid province data:

```sql
UPDATE Auction 
SET province = 'Barcelona',        -- Extracted from BOE detail page
    municipality = 'Sant Cugat',   -- Extracted from BOE detail page
    updatedAt = CURRENT_TIMESTAMP
WHERE id = '...'
```

## Resume Capability

Scrapers automatically resume from where they left off:
- Completed batches are tracked in progress file
- Safe to stop and restart anytime
- Won't re-process completed batches

To force re-scrape from beginning:
- Delete the progress file: `province_update_{ID}_progress.json`

## Province Extraction Logic

The scraper looks for province information in:

1. **Location patterns**:
   - "Bien situado en..."
   - "Ubicación: ..."
   - Postal code + municipality

2. **Autoridad Gestora**:
   - "Juzgado de [Province]"
   - "Tribunal de [Province]"

3. **Validation**:
   - Checks against list of 52 valid Spanish provinces
   - Normalizes accents and case

## Valid Provinces

The scraper recognizes all 52 Spanish provinces including:
- 50 provinces
- 2 autonomous cities (Ceuta, Melilla)
- Alternative names (e.g., `Bizkaia` / `Vizcaya`, `Illes Balears` / `Illes Balear`)

## Troubleshooting

### Scraper Won't Start

```bash
# Check Python is installed
python --version

# Check required packages
pip install playwright
python -m playwright install chromium
```

### BOE Rate Limiting

If you see many failures:
- Scrapers already include delays (5-7s)
- If needed, increase `BOE_REQUEST_DELAY_SECONDS` in `config/settings.py`

### Browser Issues

Scrapers run in non-headless mode (visible browser) for monitoring:
- To run headless, edit `province_update_scraper.py` line 94: `headless=True`

### Database Lock

If you see "database is locked":
- Stop other database connections
- Only one process should write at a time
- Scrapers handle this with retries

## After Completion

Once all 6 scrapers finish:

1. **Check Statistics**:
   ```bash
   node scripts/test-filters.js
   ```

2. **Rebuild Application**:
   ```bash
   npm run build
   ```

3. **Restart Server**:
   ```bash
   npm start
   ```

4. **Verify Results**:
   - Province grid should show real data
   - Map should display auctions
   - Dashboard stats should be accurate

## Files Created

- `scraper/province_update_scraper.py` - Main scraper class
- `scraper/launch_province_updates.py` - Python launcher
- `scraper/launch_province_updates.bat` - Windows batch launcher
- `scraper/launch_province_updates.ps1` - PowerShell launcher
- `scraper/province_update_{1-6}_progress.json` - Progress tracking
- `scraper/province_update_{1-6}_YYYYMMDD.log` - Logs
