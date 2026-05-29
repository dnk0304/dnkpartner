# BOE Parallel Scraping System - ACTIVE

## 🚀 **3 Parallel Scrapers Running**

### **System Overview:**
- **Strategy**: 15-day batches to avoid BOE "too many results" error
- **Results per page**: 500
- **All auction types**: Tipo=Todos, Estado=Cualquiera, Bien=Todos

---

## **Scraper 1: 2020-2022**
- **Date Range**: January 1, 2020 → December 31, 2022
- **Total Period**: 3 years (1,095 days)
- **Estimated Batches**: ~73 batches (15 days each)
- **Log File**: `scraper/parallel_1_2020_2022.log`
- **Progress File**: `scraper/parallel_backfill_1_progress.json`
- **Estimated Auctions**: ~54,000

---

## **Scraper 2: 2023-2024**
- **Date Range**: January 1, 2023 → December 31, 2024
- **Total Period**: 2 years (730 days)
- **Estimated Batches**: ~49 batches (15 days each)
- **Log File**: `scraper/parallel_2_2022_2024.log`
- **Progress File**: `scraper/parallel_backfill_2_progress.json`
- **Estimated Auctions**: ~36,000

---

## **Scraper 3: 2025-2026**
- **Date Range**: January 1, 2025 → February 9, 2026 (today)
- **Total Period**: 1.1 years (~400 days)
- **Estimated Batches**: ~27 batches (15 days each)
- **Log File**: `scraper/parallel_3_2024_2026.log`
- **Progress File**: `scraper/parallel_backfill_3_progress.json`
- **Estimated Auctions**: ~20,000

---

## **📊 Expected Totals:**
- **Total Batches**: ~149 (15-day chunks across all scrapers)
- **Total Auctions**: ~110,000 auctions (6 years of historical data)
- **Estimated Runtime**: 12-18 hours per scraper
- **Total Runtime**: 12-18 hours (running in parallel)

---

## **🔍 Progress Tracking:**

### **Via Admin Dashboard:**
Navigate to: `/admin/dashboard` → "Scraper Backfill" tab

**Dashboard Shows:**
- Status of all 3 scrapers (Running/Stopped)
- Progress percentage for each scraper
- Total batches completed vs. total
- Auctions found vs. auctions fetched per batch
- Errors encountered
- Overall totals across all 3 scrapers

### **Via Progress Files:**
```powershell
# Check Scraper 1 progress
Get-Content scraper/parallel_backfill_1_progress.json | ConvertFrom-Json

# Check Scraper 2 progress  
Get-Content scraper/parallel_backfill_2_progress.json | ConvertFrom-Json

# Check Scraper 3 progress
Get-Content scraper/parallel_backfill_3_progress.json | ConvertFrom-Json
```

### **Via Log Files:**
```powershell
# Monitor Scraper 1
Get-Content scraper/parallel_1_2020_2022.log -Tail 30 -Wait

# Monitor Scraper 2
Get-Content scraper/parallel_2_2022_2024.log -Tail 30 -Wait

# Monitor Scraper 3
Get-Content scraper/parallel_3_2024_2026.log -Tail 30 -Wait
```

---

## **✅ What Each Scraper Does:**

1. **Breaks date range into 15-day batches** (avoids BOE limits)
2. **Submits search form** with exact dates for each batch
3. **Paginates through ALL pages** (500 results per page)
4. **Clicks into EVERY auction detail page** to extract:
   - Información general
   - Autoridad Gestora
   - Bienes
   - Pujas
   - Detail URL for user redirection
5. **Saves auctions** even without appraisal value (marked as 0)
6. **Tracks progress**:
   - `batches_found`: How many results appeared in search
   - `batches_fetched`: How many auctions were actually saved
7. **Resume capability**: Can be stopped and restarted anytime

---

## **🎯 Key Metrics Tracked:**

For each batch:
- **Results Found**: Total auctions in search results
- **Results Fetched**: Auctions successfully saved to database
- **Pages Processed**: Number of pagination pages
- **Errors**: Any failures during processing

---

## **⚙️ System Benefits:**

✅ **3x Faster**: Parallel processing = 3 scrapers working simultaneously
✅ **No BOE Errors**: 15-day batches stay under BOE result limits  
✅ **Complete Data**: Full detail page extraction for every auction
✅ **Resilient**: Progress saved after each batch, can resume anytime
✅ **Transparent**: Real-time tracking in admin dashboard
✅ **Comprehensive**: Gets ALL auction types and statuses

---

## **📝 Current Status:**

All 3 scrapers started successfully and are now running in separate PowerShell windows.

**Check their status:**
1. Go to `/admin/dashboard`
2. Click "Scraper Backfill" tab
3. See live progress for all 3 scrapers

---

**Last Updated**: 2026-02-09 16:20:00
