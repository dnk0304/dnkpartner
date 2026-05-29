# 📊 Scraping Status & Instructions to Reach 100k-200k Auctions

## Current Database Status

**Total Auctions**: 2,083
- **ACTIVE**: 560
- **FINISHED**: 1,358  
- **PRE_AUCTION**: 165

**Goal**: 100,000 - 200,000 auctions

---

## 🎯 How to Reach the Goal

### The Bulk Historical Scraper

You have a **production-ready bulk scraper** that can scrape ALL finished auctions from the BOE Portal across all 50 Spanish provinces. This is located at `scraper/bulk_historical_scraper.py`.

### Expected Results

#### Conservative Scenario (DEFAULT)
```
Pages per province: 200
Provinces: 50
Auctions per page: ~25
─────────────────────────
Total Expected: ~250,000 finished auctions
Runtime: 6-8 hours
```

#### Maximum Scenario  
```
Pages per province: 500+
Provinces: 50
─────────────────────────
Total Expected: 500,000+ finished auctions
Runtime: 1-2 days
```

---

## 🚀 How to Run the Bulk Scraper

### Option 1: Quick Start (Easiest)

**Windows:**
```bash
run_bulk_scraper.bat
```

This will automatically:
- Navigate to scraper directory
- Install dependencies if needed
- Start scraping with default settings (200 pages per province)
- Save all progress automatically

### Option 2: Custom Configuration

```bash
cd scraper

# For maximum data (500k+ auctions potential)
python bulk_historical_scraper.py --pages 500 --delay 180 --resume

# For faster results (200k auctions)
python bulk_historical_scraper.py --pages 200 --delay 180 --resume

# For quick test (5 pages per province to verify it works)
python bulk_historical_scraper.py --pages 5 --delay 60 --reset
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--pages` | Max pages per province | 200 |
| `--delay` | Delay between provinces (seconds) | 180 |
| `--resume` | Resume from last progress | True |
| `--reset` | Reset progress and start fresh | False |
| `--summary` | Show current progress and exit | False |

---

## 📈 Monitoring Progress

### Live Console Output
While running, you'll see real-time updates:
```
[15/50] Processing: Sevilla
✓ Sevilla: Scraped 5,234 finished auctions

────────────────────────────────────────────
Progress: 15/50 provinces (30.0%)
Total auctions: 78,450
Elapsed: 2.5 hours
ETA: 5.8 hours remaining
────────────────────────────────────────────

⏳ Cooling down for 180 seconds...
```

### Progress Files

All progress is automatically saved in `scraper/progress/`:

1. **`bulk_scrape_progress.json`** - Tracks completed provinces
2. **`bulk_scrape_stats.json`** - Detailed statistics
3. **`bulk_scraper.log`** - Complete operation log

### Check Progress Anytime

```bash
cd scraper
python bulk_historical_scraper.py --summary
```

This shows current status without starting the scraper.

---

## 🛡️ Safety Features

### Resume Capability
- **Stop anytime**: Press `Ctrl+C`
- **No data loss**: Progress saved after each province
- **Resume easily**: Run the same command again
- Automatically skips completed provinces

### Error Recovery
- Continues even if some provinces fail
- Logs all errors to `bulk_scraper.log`
- Failed provinces can be retried

### Rate Limiting (Ethical Scraping)
- Default: 3 minutes between provinces
- Prevents IP bans
- Respects BOE server resources
- **Don't reduce delay below 120 seconds**

---

## 📊 What Gets Scraped

Each auction includes:
- ✅ Title, Category, Province, Municipality
- ✅ Appraisal value, Current bid (if available)
- ✅ Court name, Procedure number
- ✅ BOE link to original document
- ✅ Published date, End date
- ✅ GPS coordinates (if available)
- ✅ Address
- ✅ Image URL

All data is immediately available in your React app after scraping.

---

## 🎮 Control Commands

| Action | Command |
|--------|---------|
| **Start Fresh** | `python bulk_historical_scraper.py --reset` |
| **Resume from last** | `python bulk_historical_scraper.py --resume` |
| **Check status** | `python bulk_historical_scraper.py --summary` |
| **Stop scraping** | Press `Ctrl+C` (safe, progress saved) |

---

## ⏱️ Time Estimates

### To Reach 100k Auctions
- **Pages needed**: ~80-100 per province
- **Estimated time**: 3-4 hours
- **Command**: `python bulk_historical_scraper.py --pages 100 --delay 180`

### To Reach 200k Auctions  
- **Pages needed**: ~200 per province
- **Estimated time**: 6-8 hours
- **Command**: `python bulk_historical_scraper.py --pages 200 --delay 180`

### For Maximum Data (500k+)
- **Pages needed**: 500+ per province
- **Estimated time**: 1-2 days
- **Command**: `python bulk_historical_scraper.py --pages 500 --delay 180`

---

## 🎯 Recommended Approach

### Step 1: Test Run (5 minutes)
```bash
cd scraper
python bulk_historical_scraper.py --pages 5 --delay 60 --reset
```

This will scrape ~5 pages per province to verify everything works.

### Step 2: Full Production Run
```bash
cd scraper
python bulk_historical_scraper.py --pages 200 --delay 180 --resume
```

This will run for 6-8 hours and get you ~200,000+ auctions.

### Step 3: Run Overnight
- Start the command before going to bed
- Let it run overnight
- Check results in the morning
- All progress is logged to `bulk_scraper.log`

---

## 📦 Where Data is Stored

All scraped auctions go directly to:
- **Database**: `data/database/prod.db`
- **Table**: `Auction`
- **Indexed**: By province, status, date
- **Ready for**: Immediate use in React app

No additional import steps needed - data appears automatically in your application!

---

## 🔧 Troubleshooting

### "No auctions found"
- BOE structure may have changed
- Check `bulk_scraper.log` for details
- Try with `--reset` to start fresh

### "Rate limited / IP blocked"
- Increase delay: `--delay 300` (5 minutes)
- Run during off-peak hours (night in Spain)
- Wait 1 hour and try again

### "Script crashes"
- No worries! Progress is saved
- Simply run with `--resume`
- Check logs: `bulk_scraper.log`

### "Taking too long"
- This is normal for massive scraping
- 50 provinces with delays = hours
- Leave it running overnight

---

## 🎉 Success Indicators

After completion, you'll have:
- ✅ **100k-200k+ finished auctions** in database
- ✅ All 50 Spanish provinces covered
- ✅ Full historical data
- ✅ Searchable and filterable in app
- ✅ Displayed on map (where coordinates available)
- ✅ Grey "Finished" badges in UI

---

## 📝 Best Practices

1. **Test first**: Run with `--pages 5` before full scrape
2. **Run overnight**: Let it complete unattended
3. **Don't reduce delays**: Keep at 180+ seconds
4. **Monitor logs**: Check `bulk_scraper.log` periodically
5. **Backup database**: Before massive import (optional)
6. **Be patient**: Quality takes time

---

## 🆘 Support & Documentation

- **Full Usage Guide**: `scraper/BULK_SCRAPER_README.md`
- **Implementation Details**: `BULK_SCRAPER_SUMMARY.md`
- **Logs**: `scraper/progress/bulk_scraper.log`
- **Progress**: `scraper/progress/bulk_scrape_progress.json`

---

## 🚀 Quick Start Command

```bash
# Navigate to project root, then run:
run_bulk_scraper.bat
```

That's it! The script handles everything else automatically.

---

**Current Status**: Ready to launch
**Goal**: 100k-200k auctions  
**Time Needed**: 6-8 hours (run overnight)
**Complexity**: Just run one command!

🎯 **You're all set to reach your goal!**
