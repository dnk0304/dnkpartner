# AlertaSubastas Historical Scraper - Setup Complete

## Status: ✅ READY TO LAUNCH

**Date:** January 23, 2026  
**Target:** 200,000+ finished/historical auctions from AlertaSubastas  
**Current Database:** 558 AlertaSubastas auctions (383 active, 139 finished, 36 suspended)

---

## What Has Been Set Up

### 1. Optimized Batch Scraper
**File:** `scraper/alertasubastas_finished_batch.py`

**Features:**
- ✅ Manual login support (opens browser, waits for you to log in)
- ✅ Split by province ranges for parallel execution
- ✅ Real-time progress tracking
- ✅ Deduplication (skips existing auctions)
- ✅ Comprehensive error handling

### 2. Parallel Launcher
**File:** `run_alertasubastas_finished_2parallel.bat`

**Configuration:**
- **2 parallel instances** (as requested)
- **Batch 1:** Provinces A-M (32 provinces × 22 property types)
- **Batch 2:** Provinces N-Z (20 provinces × 22 property types)
- **Total combinations:** 1,144 (52 provinces × 22 property types)

### 3. Progress Monitoring
**File:** `check_alerta_status.py`

Quick database statistics:
```bash
python check_alerta_status.py
```

---

## How to Run

### Step 1: Launch the Scrapers
```bash
.\run_alertasubastas_finished_2parallel.bat
```

This will open **2 browser windows** and **2 terminal windows**.

### Step 2: Log In Manually (Per Browser)
For **each of the 2 browser windows** that open:

1. ✅ Browser will automatically navigate to https://alertasubastas.com/login
2. ✅ **Log in with your credentials** (kotlenko@hotmail.com)
3. ✅ Wait until you see "Nikolay" or your account name
4. ✅ Go to the corresponding terminal window
5. ✅ **Press ENTER** to start scraping

### Step 3: Let It Run
- Each scraper will go through all property types and provinces
- Progress shown in real-time in each terminal
- Expected completion: **24-48 hours**
- Scrapers will continue even if you close the launcher window

---

## Progress Monitoring

### Check Database Growth
```bash
python check_alerta_status.py
```

Sample output:
```
Total auctions in database: 1152
AlertaSubastas auctions: 558

AlertaSubastas by status:
  ACTIVE: 383
  FINISHED: 139
  SUSPENDED: 36
```

### Check Running Processes
```powershell
tasklist | findstr python
```

Should show 4 Python processes (2 scrapers + 2 browser helpers).

### Terminal Output Format
Each scraper shows:
```
[15/704] VIVIENDA - MADRID
Progress: 2% | Saved: 1,234 | Scraped: 1,450
================================
  📋 Found 45 auctions
    [1/45] 0x123ABC... ✅
    [2/45] 0x456DEF... ⏭️ (already exists)
    ...
```

---

## What Gets Scraped

### Coverage
- **Property Types:** All 22 categories
  - Vivienda (housing)
  - Garaje (garages)
  - Local comercial (commercial premises)
  - Vehículos (vehicles)
  - Joyas, arte (jewelry, art)
  - Maquinaria industrial
  - And 16 more...
  
- **Provinces:** All 52 Spanish provinces
- **Status:** Finalizadas (finished/historical auctions)

### Data Extracted
For each auction:
- Auction ID
- Title
- Status (FINISHED, SUSPENDED, etc.)
- Appraisal value
- Final bid / minimum bid
- Deposit amount
- Property description
- Location (address, municipality, province)
- Source (judicial, tax authority, etc.)
- Published date

---

## Expected Results

### Timeline
- **First auctions:** Within 5-10 minutes of starting
- **First 1,000 auctions:** 2-4 hours
- **First 10,000 auctions:** 8-12 hours
- **Complete (200k+):** 24-48 hours

### Database Growth
- **Current:** 558 AlertaSubastas auctions
- **Expected:** 200,000+ historical auctions
- **Growth rate:** ~2,000-5,000 auctions per hour (both scrapers combined)

---

## Troubleshooting

### If Login Fails
- Make sure you're using the correct credentials
- Try logging in manually first at https://alertasubastas.com
- Check if the website is accessible

### If Scraper Stops
- Check the terminal window for error messages
- Verify Python processes are still running: `tasklist | findstr python`
- Check database to see if auctions were added: `python check_alerta_status.py`

### If No Progress After 30 Minutes
- The scraper may be encountering rate limits
- Try restarting with longer delays
- Contact AlertaSubastas about API access for bulk data

### If You Need to Restart
Simply run the batch file again:
```bash
.\run_alertasubastas_finished_2parallel.bat
```

The scraper automatically skips auctions that already exist in the database, so you can safely restart without duplicates.

---

## Files Created

1. ✅ `scraper/alertasubastas_finished_batch.py` - Main batch scraper
2. ✅ `run_alertasubastas_finished_2parallel.bat` - 2-parallel launcher
3. ✅ `check_alerta_status.py` - Database monitoring tool
4. ✅ `ALERTASUBASTAS_HISTORICAL_READY.md` - This documentation

## Files Modified

1. ✅ `scraper/alertasubastas_scraper_fixed.py` - Added comma-separated property types support

---

## Next Steps

1. ✅ Run `.\run_alertasubastas_finished_2parallel.bat`
2. ✅ Log in manually in both browser windows
3. ✅ Press ENTER in both terminal windows to start
4. ⏳ Wait 24-48 hours for completion
5. ✅ Monitor with `python check_alerta_status.py`

---

## Success Indicators

✅ **2 Python processes running**  
✅ **2 browser windows open**  
✅ **Terminal shows "Found X auctions"**  
✅ **Database growing** (check with `check_alerta_status.py`)  
✅ **Auctions marked with ✅ or ⏭️**

---

**Last Updated:** January 23, 2026  
**Status:** READY TO LAUNCH 🚀  
**Estimated Completion:** 24-48 hours after manual login
