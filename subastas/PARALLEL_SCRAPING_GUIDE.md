# Parallel Category Scraping Guide

## Overview

The category scraper now supports **parallel execution**, allowing you to run multiple instances simultaneously to speed up the scraping process.

With 3 parallel instances, you can complete all 90 combinations in **~1.5 hours** instead of **~4.5 hours**!

## How It Works

The scraper divides the 90 filter combinations into equal batches:
- **Batch 1:** Combinations 1-30
- **Batch 2:** Combinations 31-60
- **Batch 3:** Combinations 61-90

Each batch runs independently with its own:
- Browser instance
- Progress tracking file
- Cooldown timer

All batches share the same database, so duplicates are automatically prevented.

## Quick Start (Recommended)

### Option 1: Use the Launcher Script

Simply run the provided batch file:

```bash
run_parallel_scraper.bat
```

This will automatically:
1. Launch 3 separate command windows
2. Start one scraper instance in each window
3. Each scraper handles 30 combinations
4. All run with 180-second cooldowns and headless mode

### Option 2: Manual Launch

Open **3 separate terminals** and run:

**Terminal 1:**
```bash
cd scraper
python category_scraper.py --batch 1 --total-batches 3 --max-pages 10 --cooldown 180 --headless
```

**Terminal 2:**
```bash
cd scraper
python category_scraper.py --batch 2 --total-batches 3 --max-pages 10 --cooldown 180 --headless
```

**Terminal 3:**
```bash
cd scraper
python category_scraper.py --batch 3 --total-batches 3 --max-pages 10 --cooldown 180 --headless
```

## Command Line Arguments

```bash
python category_scraper.py [options]
```

### New Parallel Execution Options:

- `--batch N` - Batch number (1-based, e.g., 1, 2, 3)
- `--total-batches N` - Total number of batches (e.g., 3 for 3-way split)

### Existing Options:

- `--max-pages N` - Max pages per combination (default: 10)
- `--cooldown N` - Seconds between combinations (default: 120)
- `--headless` - Run browser in headless mode
- `--resume` - Resume from previous run (skips completed combinations)

## Progress Tracking

### Single Instance
Progress is saved to:
```
scraper/progress/category_scraper_progress.json
```

### Parallel Instances
Each batch has its own progress file:
```
scraper/progress/category_scraper_batch_1_progress.json
scraper/progress/category_scraper_batch_2_progress.json
scraper/progress/category_scraper_batch_3_progress.json
```

### Viewing Progress

**Admin Interface:**
- Go to `http://localhost:3005/admin/scraper`
- The "Current Progress" section shows all running batches
- Combined statistics are displayed

**Command Line:**
```powershell
# View batch 1 progress
Get-Content scraper\progress\category_scraper_batch_1_progress.json | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

## Time Estimates

### Single Instance (90 combinations)
- **Cooldown:** 180 seconds (3 minutes)
- **Time per combination:** ~3-5 minutes (scraping + cooldown)
- **Total time:** ~4.5 hours

### 3 Parallel Instances (30 combinations each)
- **Each batch:** ~1.5 hours
- **Total time:** ~1.5 hours (all run simultaneously)
- **Speed improvement:** **3x faster!**

## Stopping Scrapers

### Stop All Instances
```powershell
taskkill /F /IM python.exe
```

### Stop Individual Instance
1. Find the process ID:
   ```powershell
   Get-Process python | Select-Object Id, ProcessName
   ```

2. Stop specific process:
   ```powershell
   Stop-Process -Id <PID>
   ```

### Or just close the terminal windows

## Database Safety

✅ **Safe for parallel execution!**

- SQLite handles concurrent writes properly
- Each scraper checks for existing `boeId` before inserting
- Duplicates are automatically prevented
- Database transactions ensure data integrity

## Best Practices

### 1. Start with 3 Batches
```bash
run_parallel_scraper.bat
```
This provides a good balance between speed and system resources.

### 2. Monitor System Resources
Each scraper uses:
- 1 browser instance (~200-500 MB RAM)
- 1 Python process (~50-100 MB RAM)
- **Total for 3 instances:** ~750-1800 MB RAM

### 3. Use Longer Cooldowns for Parallel Runs
When running 3+ instances, use at least 180 seconds cooldown to avoid rate limiting:
```bash
--cooldown 180
```

### 4. Resume After Interruptions
If a scraper crashes or is stopped, resume it:
```bash
python category_scraper.py --batch 1 --total-batches 3 --resume --headless
```

## Advanced Usage

### 5-Way Split (even faster!)
If you have enough RAM and want maximum speed:

```bash
# Terminal 1
python category_scraper.py --batch 1 --total-batches 5 --cooldown 180 --headless

# Terminal 2
python category_scraper.py --batch 2 --total-batches 5 --cooldown 180 --headless

# ... and so on for batches 3, 4, 5
```

**Result:** All 90 combinations in **<1 hour**!

### 2-Way Split (conservative)
If you want to be more conservative:

```bash
# Terminal 1
python category_scraper.py --batch 1 --total-batches 2 --cooldown 240 --headless

# Terminal 2
python category_scraper.py --batch 2 --total-batches 2 --cooldown 240 --headless
```

**Result:** ~2.25 hours total

## Troubleshooting

### "Error: --batch and --total-batches must be used together"
**Solution:** Always provide both arguments:
```bash
python category_scraper.py --batch 1 --total-batches 3
```

### "Error: --batch must be between 1 and 3"
**Solution:** Batch numbers start at 1 and must not exceed total-batches:
```bash
# Correct
python category_scraper.py --batch 3 --total-batches 3

# Wrong
python category_scraper.py --batch 4 --total-batches 3
```

### Scrapers Not Showing in Admin UI
**Solution:** Refresh the page or wait for the next 10-second update cycle.

### Database Lock Errors
Very rare, but if it happens:
- SQLite will automatically retry
- Increase cooldown between combinations
- Reduce number of parallel instances

## Example: Complete Parallel Scraping Session

```powershell
# 1. Stop any running scrapers
taskkill /F /IM python.exe

# 2. Clear old progress (optional - only if you want fresh start)
Remove-Item scraper\progress\category_scraper_batch_*.json

# 3. Launch parallel scrapers
.\run_parallel_scraper.bat

# 4. Monitor progress in admin UI
# Open browser: http://localhost:3005/admin/scraper

# 5. Wait ~1.5 hours

# 6. Check results
python scraper/check_db.py
```

## Summary

✅ **3x faster** with 3 parallel instances  
✅ **Safe** for concurrent execution  
✅ **Easy** to use with `run_parallel_scraper.bat`  
✅ **Monitored** via admin UI  
✅ **Resumable** if interrupted  

Happy scraping! 🚀
