# COMPREHENSIVE PARALLEL SCRAPING GUIDE

## 🎯 Overview

This system provides **COMPLETE COVERAGE** of the BOE (Boletín Oficial del Estado) auction database through two powerful parallel scrapers:

1. **Comprehensive Scraper**: Current auctions (all categories × all provinces)
2. **Historical Scraper**: Last 5 years of finished auctions (year by year)

## 📊 Coverage Statistics

### Comprehensive Scraper (Current Auctions)
- **Total Combinations**: 4,680
- **Formula**: 5 Tipo de subasta × 6 Estado × 3 Tipo de bien × 52 Provinces
- **Exclusions**: "Todos" and "Cualquiera" options (for precise filtering)
- **Results per page**: 500
- **Max pages per combination**: 10 (configurable)
- **Maximum potential auctions**: ~23.4 million

### Historical Scraper (2021-2026)
- **Total Combinations**: 7,800
- **Formula**: 5 Years × 5 Tipo de subasta × 2 Estado (finished only) × 3 Tipo de bien × 52 Provinces
- **Years covered**: 2021, 2022, 2023, 2024, 2025, 2026
- **Results per page**: 500
- **Max pages per combination**: 20 (configurable)
- **Maximum potential auctions**: ~78 million

### Combined Total
- **Total unique combinations**: 12,480
- **Estimated scraping time** (with 10 instances each): 24-48 hours
- **Database coverage**: COMPLETE BOE auction history

## 🚀 Quick Start

### Option 1: Launch from Admin Panel (Recommended)

1. Start the Next.js development server:
   ```bash
   npm run dev
   ```

2. Navigate to the admin panel:
   ```
   http://localhost:3005/admin/scraper
   ```

3. Choose your scraping strategy:
   - **Comprehensive Tab** (Purple): Current auctions with full province coverage
   - **Historical Tab** (Amber): Last 5 years of finished auctions

4. Configure settings:
   - **Max Pages**: How many pages per combination (10-20 recommended)
   - **Cooldown**: Seconds between combinations (90-120 recommended)
   - **Parallel Instances**: Number of simultaneous scrapers (10 recommended)

5. Click the launch button and monitor progress in real-time!

### Option 2: Launch from Batch Files

#### For Comprehensive Scraping (Current Auctions):
```bash
run_comprehensive_parallel.bat
```
- Launches 10 parallel instances
- Each handles ~468 combinations
- Estimated time: 15-20 hours

#### For Historical Scraping (Last 5 Years):
```bash
run_historical_parallel.bat
```
- Launches 10 parallel instances  
- Each handles ~780 combinations
- Estimated time: 19-25 hours

#### For EVERYTHING (Nuclear Option):
```bash
run_all_parallel_scrapers.bat
```
- Launches **20 parallel instances** (10 comprehensive + 10 historical)
- Processes all 12,480 combinations
- Estimated time: 24-48 hours
- ⚠️ Requires powerful system (20 Chrome instances)

### Option 3: Manual Command Line

#### Comprehensive Scraper:
```bash
# Single instance (all combinations)
python scraper/comprehensive_category_scraper.py --max-pages 10 --cooldown 120 --headless

# Parallel execution (batch 1 of 10)
python scraper/comprehensive_category_scraper.py --batch 1 --total-batches 10 --max-pages 10 --cooldown 120 --headless
```

#### Historical Scraper:
```bash
# Single instance (all combinations)
python scraper/historical_scraper.py --max-pages 20 --cooldown 90 --headless

# Parallel execution (batch 1 of 10)
python scraper/historical_scraper.py --batch 1 --total-batches 10 --max-pages 20 --cooldown 90 --headless
```

## 📁 File Structure

```
dnksubastas/
├── scraper/
│   ├── comprehensive_category_scraper.py  # NEW: Category + Province scraper
│   ├── historical_scraper.py              # NEW: Historical data scraper (5 years)
│   ├── category_scraper.py                # OLD: Basic category scraper (90 combos)
│   └── progress/
│       ├── comprehensive_scraper_batch_X_progress.json
│       └── historical_scraper_batch_X_progress.json
├── run_comprehensive_parallel.bat         # NEW: Launch comprehensive scrapers
├── run_historical_parallel.bat            # NEW: Launch historical scrapers
└── run_all_parallel_scrapers.bat          # NEW: Launch everything
```

## 🎛️ Configuration Options

### Comprehensive Scraper Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--max-pages` | 10 | Maximum pages to scrape per combination (500 results/page) |
| `--cooldown` | 120 | Seconds to wait between combinations |
| `--headless` | False | Run browser in headless mode |
| `--resume` | False | Resume from previous progress |
| `--batch` | None | Batch number for parallel execution (1-based) |
| `--total-batches` | None | Total number of batches |

### Historical Scraper Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--max-pages` | 20 | Maximum pages to scrape per combination (500 results/page) |
| `--cooldown` | 90 | Seconds to wait between combinations |
| `--headless` | False | Run browser in headless mode |
| `--resume` | False | Resume from previous progress |
| `--batch` | None | Batch number for parallel execution (1-based) |
| `--total-batches` | None | Total number of batches |

## 📈 Progress Monitoring

### Real-time Monitoring (Admin Panel)
Visit `http://localhost:3005/admin/scraper` to see:
- Number of new auctions found
- Number of existing auctions updated
- Auctions checked and skipped
- Combinations completed
- Progress percentage per batch
- PIDs of running processes

### Progress Files
Each batch creates a JSON progress file:
```
scraper/progress/comprehensive_scraper_batch_1_progress.json
scraper/progress/historical_scraper_batch_1_progress.json
```

Progress file structure:
```json
{
  "started_at": "2026-01-22T10:00:00",
  "last_update": "2026-01-22T12:30:00",
  "batch_num": 1,
  "total_batches": 10,
  "current_combination": "Judicial|Celebrándose|Inmuebles|Madrid",
  "completed_combinations": ["..."],
  "stats": {
    "total_new": 1500,
    "total_updated": 250,
    "total_checked": 5000,
    "total_skipped": 3250,
    "total_combinations": 468,
    "completed_combinations": 125
  }
}
```

## 🔍 What Gets Scraped?

### Comprehensive Scraper Filters

**Tipo de subasta** (5 options - NO "Todos"):
- Judicial
- Notarial
- AEAT
- Otras administraciones tributarias
- Subastas administrativas generales

**Estado** (6 options - NO "Cualquiera"):
- Prox. apertura
- Celebrándose
- Suspendida
- Cancelada
- Concluida en Portal de Subastas
- Finalizada por Autoridad Gestora

**Tipo de bien** (3 options - NO "Cualquiera"):
- Inmuebles
- Vehículos
- Otros bienes muebles

**Provincia** (52 options - NO "Todas las provincias"):
- All 50 Spanish provinces + Ceuta + Melilla

### Historical Scraper Filters

Same as comprehensive, but:
- **Only 2 Estados**: "Concluida en Portal de Subastas" and "Finalizada por Autoridad Gestora"
- **Year filtering**: Searches by date range (01/01/YEAR to 31/12/YEAR)
- **Years**: 2021, 2022, 2023, 2024, 2025, 2026

## 💾 Database Integration

All scraped auctions are automatically saved to:
```
data/database/prod.db
```

The scrapers:
- ✅ Check for existing auctions (no duplicates)
- ✅ Update changed auctions (title, status, prices)
- ✅ Skip unchanged auctions (efficient)
- ✅ Use SQLite transactions (safe for parallel execution)
- ✅ Track province data (accurate location)

## ⚡ Performance Tips

### Recommended Parallel Instances

| System Specs | Comprehensive | Historical | Total |
|--------------|---------------|------------|-------|
| 8GB RAM, 4 cores | 3-5 instances | 3-5 instances | 6-10 |
| 16GB RAM, 8 cores | 5-10 instances | 5-10 instances | 10-20 |
| 32GB RAM, 16+ cores | 10-15 instances | 10-15 instances | 20-30 |

### Optimization Settings

For **faster scraping** (more aggressive):
```bash
--max-pages 5 --cooldown 60
```

For **safer scraping** (less aggressive):
```bash
--max-pages 20 --cooldown 180
```

For **maximum coverage** (thorough):
```bash
--max-pages 50 --cooldown 120
```

## 🛑 Stopping Scrapers

### From Admin Panel
Click the **"Stop All"** button to terminate all Python scraper processes.

### From Command Line
```bash
# Windows
taskkill /F /IM python.exe /T

# Linux/Mac
pkill -f "python.*scraper"
```

## 🔄 Resume Capability

If a scraper is interrupted, you can resume it:

```bash
python scraper/comprehensive_category_scraper.py --batch 1 --total-batches 10 --resume --headless
```

The scraper will:
- Load previous progress
- Skip completed combinations
- Continue from where it left off

## 📊 Expected Results

### After Comprehensive Scraping
- ✅ All current auctions from all provinces
- ✅ Accurate province data for each auction
- ✅ Complete category coverage
- ✅ All auction states (active, finished, pre-auction, etc.)

### After Historical Scraping
- ✅ 5 years of auction history
- ✅ Finished auctions year by year
- ✅ Province-level historical data
- ✅ Trend analysis capability

### Combined Benefits
- 📈 Complete market analysis
- 🗺️ Geographic insights
- 📊 Historical trends
- 🎯 Accurate property locations
- 💰 Comprehensive pricing data

## 🚨 Troubleshooting

### "Failed to select provincia"
**Solution**: The BOE form structure may have changed. Check the selector:
```python
page.select_option('select#id_subasta_ava\\.bien\\.codProvincia', label=provincia)
```

### "Too many instances, system slow"
**Solution**: Reduce parallel instances in the batch files or admin panel.

### "Database locked error"
**Solution**: SQLite handles this automatically with retries. If persistent, reduce cooldown time.

### "Browser crashes"
**Solution**: Add more memory or reduce `--max-pages` to lower memory usage.

## 📝 Logging

Each scraper logs to console with emoji indicators:
- 🎯 Filter selection
- ✓ Successful operations
- ⚠️ Warnings
- ❌ Errors
- 📄 Page scraping
- 💾 Database operations
- ✅ Completion status

## 🎯 Next Steps

1. **Start with one scraper** to test your system
2. **Monitor the first hour** to ensure stability
3. **Scale up** to more parallel instances
4. **Let it run** for 24-48 hours for complete coverage
5. **Check the database** for results
6. **Analyze the data** in your Next.js app

## 🏆 Success Metrics

When scraping is complete, you'll have:
- ✅ Tens of thousands of auctions
- ✅ Province-accurate location data
- ✅ Complete category coverage
- ✅ 5 years of historical data
- ✅ Real-time scraping capability
- ✅ The most comprehensive BOE auction database available!

---

**Ready to scrape?** Run `run_all_parallel_scrapers.bat` and monitor at `http://localhost:3005/admin/scraper`! 🚀
