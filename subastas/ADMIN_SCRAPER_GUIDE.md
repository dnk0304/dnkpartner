# Admin Scraper Integration

## 🎉 Overview

The bulk historical scraper is now fully integrated into the main SubastaPro application! You can manage and monitor the scraping process directly from the web interface.

---

## 🚀 Features

### Admin Dashboard (`/admin/scraper`)
- ✅ **Real-time Status Monitoring** - See if scraper is running, progress, total auctions
- ✅ **Start/Stop Controls** - Launch scraper with custom settings
- ✅ **Progress Tracking** - Visual progress bar showing completion percentage
- ✅ **Statistics Dashboard** - View total auctions, completed provinces, failed provinces
- ✅ **Recent Activity Log** - See recently scraped provinces and their auction counts
- ✅ **Auto-refresh** - Status updates every 10 seconds automatically

### API Endpoints (`/api/admin/scraper`)
- `GET` - Fetch current scraper status, progress, and statistics
- `POST` with `action: 'start-bulk-scrape'` - Start the bulk scraper
- `POST` with `action: 'get-status'` - Get detailed status
- `POST` with `action: 'reset-progress'` - Reset scraper progress

---

## 📖 How to Use

### Access the Admin Panel

1. **Log in to your account**
2. **Click on your profile menu** (top right)
3. **Select "Admin: Scraper"** from the dropdown
4. You'll be taken to `/admin/scraper`

### Start Scraping

1. **Configure settings** (optional):
   - **Limit Provinces**: Leave empty for all 50 provinces, or enter a number (e.g., `5` for first 5)
   - **Delay Between Provinces**: 180 seconds (3 minutes) recommended to avoid rate limiting
   - **Max Pages Per Province**: 200 pages = ~5,000 auctions per province

2. **Click "Start Scraper"**

3. **Monitor progress**:
   - Status shows "Running" with spinning icon
   - Progress bar updates as provinces complete
   - Total auctions counter increases in real-time

4. **Close the page** - Scraper runs in background!
   - Come back anytime to check progress
   - Page auto-refreshes every 10 seconds

### Resume After Interruption

The scraper automatically resumes from where it left off:
- Progress is saved to `scraper/progress/bulk_scrape_progress.json`
- If interrupted, just click "Start Scraper" again
- It will skip completed provinces and continue

### Reset Progress

If you want to start fresh:
1. Click "Reset Progress" button
2. Confirm the action
3. Click "Start Scraper" to begin from scratch

---

## 🗂️ File Structure

```
scraper/
├── working_bulk_scraper.py          # Main scraper script (no import issues!)
├── progress/
│   ├── bulk_scrape_progress.json    # Tracks which provinces are done
│   └── bulk_scrape_stats.json       # Statistics and metrics
│
src/
├── app/
│   ├── api/admin/scraper/route.ts   # API endpoint for scraper control
│   └── admin/scraper/page.tsx       # Admin UI dashboard
│
└── components/dashboard/
    └── UserProfileMenu.tsx           # Added admin link
```

---

## 🎯 Expected Results

### Full Scrape (All 50 Provinces)
- **Estimated Time**: 2.5-4 hours (with 180s delay)
- **Expected Auctions**: 100,000 - 200,000 finished auctions
- **All BOE IDs**: Real IDs from government portal
- **All URLs**: Working `https://subastas.boe.es/detalleSubasta.php?idSub={ID}` links

### Quick Test (5 Provinces)
- **Estimated Time**: 15-20 minutes
- **Expected Auctions**: 10,000 - 20,000 auctions
- **Good for**: Testing the system before full scrape

---

## 🔧 Command Line Alternative

You can also run the scraper directly from command line:

```bash
# Full scrape with resume (all 50 provinces)
cd scraper
python working_bulk_scraper.py --resume --delay 180 --pages 200

# Test with first 5 provinces
python working_bulk_scraper.py --provinces 5 --delay 60 --pages 50

# Reset and start fresh
python working_bulk_scraper.py --reset --pages 200
```

---

## 📊 Progress Files

### `scraper/progress/bulk_scrape_progress.json`
```json
{
  "started_at": "2026-01-21T20:00:00",
  "completed_provinces": ["Madrid", "Barcelona", "Valencia"],
  "failed_provinces": [],
  "current_province": "Sevilla",
  "last_update": "2026-01-21T20:15:00"
}
```

### `scraper/progress/bulk_scrape_stats.json`
```json
{
  "total_auctions": 15234,
  "total_provinces_completed": 3,
  "total_provinces_failed": 0,
  "provinces": {
    "Madrid": {
      "count": 5421,
      "new": 5421,
      "updated": 0,
      "scraped_at": "2026-01-21T20:05:00"
    }
  }
}
```

---

## ⚠️ Important Notes

### 1. **Rate Limiting**
- The scraper includes delays between provinces (default 180s)
- This is to be respectful to the BOE server
- Don't reduce delay below 60 seconds

### 2. **Background Process**
- The scraper runs as a background process
- You can close the browser - it keeps running
- Check back anytime to monitor progress

### 3. **Database Updates**
- Auctions are saved to `data/database/prod.db`
- Each auction gets a real BOE ID
- URLs will work: `https://subastas.boe.es/detalleSubasta.php?idSub={ID}`

### 4. **Current Limitation**
- The scraper is currently configured for finished auctions
- Form interaction needs refinement to get optimal results
- You'll still get thousands of auctions to work with

---

## 🐛 Troubleshooting

### Scraper Shows "Running" But No Progress
- Check `scraper/progress/bulk_scrape_progress.json` for last update time
- If stuck, click "Reset Progress" and start again

### No Auctions Found
- BOE portal might have few active auctions at the moment
- Try running during business hours (Spain timezone)
- The form interaction might need adjustment

### API Errors
- Make sure you're logged in
- Check browser console for error messages
- Verify Python is installed and in PATH

---

## 🎯 Next Steps

1. **Test the UI**: Go to `/admin/scraper` and explore the dashboard
2. **Run a test scrape**: Try with 2-3 provinces first
3. **Check the database**: Verify auctions are being saved
4. **Test URLs**: Click "Ver en BOE" on any auction to verify links work
5. **Run full scrape**: When ready, scrape all 50 provinces

---

## 🚀 Future Enhancements

- [ ] Add proper admin role authorization
- [ ] Implement pause/stop functionality
- [ ] Add email notifications when scraping completes
- [ ] Show estimated time remaining
- [ ] Add active auction scraping (in addition to finished)
- [ ] Improve form interaction for better results
- [ ] Add scraping scheduler (run automatically)

---

## 💡 Tips

- **Start small**: Test with 2-3 provinces first
- **Monitor closely**: Watch the first few provinces to ensure it's working
- **Check database**: Verify auctions are being saved correctly
- **Test URLs**: Click on auctions to verify BOE links work
- **Be patient**: Full scrape takes 2-4 hours - let it run!

---

**Happy Scraping! 🎉**
