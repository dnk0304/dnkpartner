# Quick Start Guide - Using Real Trend Data

## Current Status ✅

**You now have REAL DATA from 9+ sources!**

Current stats (as of Dec 28, 2025):
- **476 total trends** being tracked
- **68 multi-source trends** (validated across platforms)
- **Real-time data** from: Google, Reddit, TikTok, Pinterest, Twitter, Etsy, eBay, Google Shopping, TikTok Shop

## Viewing Your Data

### 1. In the Web UI

Navigate to: `http://localhost:5173/ai-trends`

Views available:
- **Exploding Trends** - Highest growth trends (sorted by explosion score)
- **Category Explorer** - Browse by category (books, tech, fashion, etc.)
- **Data Sources** - Monitor scraper status

The source badges now show **full names** next to icons!

### 2. Via API

```bash
# Get top exploding trends
curl http://localhost:3001/api/trends/exploding?limit=10

# Get trends by category
curl "http://localhost:3001/api/trends/exploding?category=books&limit=20"

# Search for specific keyword
curl "http://localhost:3001/api/trends/search?q=coloring+book"

# Get statistics
curl http://localhost:3001/api/trends/stats
```

## What's Happening Right Now

### Automated Scraping (Running in Background)

| Source | Frequency | Last Collected |
|--------|-----------|----------------|
| Twitter | Every 1 hour | Active ✅ |
| Reddit | Every 2 hours | Active ✅ |
| Google Trends | Every 4 hours | Active ✅ |
| TikTok | Every 6 hours | Active ✅ |
| Pinterest | Every 8 hours | Active ✅ |
| Etsy | Every 12 hours | Active ✅ |
| eBay | Every 12 hours | Active ✅ |
| Google Shopping | Every 6 hours | Active ✅ |
| TikTok Shop | Every 6 hours | Active ✅ |

**Historical data is now being built** with each scrape! 🎉

## To See Better Results (7+ Days of History Needed)

Currently, explosion scores are calculated but limited because historical data points are just starting to accumulate.

### Speed Up with External Data Import

If you have access to Helium 10 or Exploding Topics:

```javascript
// Import historical data
await fetch('http://localhost:3001/api/trends/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'helium10',
    data: [
      // Multiple entries for same topic with different dates
      {
        topic: 'kawaii coloring book',
        searchVolume: 10000,
        growthRate: 20,
        timestamp: '2025-12-21T00:00:00Z'  // 7 days ago
      },
      {
        topic: 'kawaii coloring book',
        searchVolume: 11000,
        growthRate: 25,
        timestamp: '2025-12-22T00:00:00Z'  // 6 days ago
      },
      {
        topic: 'kawaii coloring book',
        searchVolume: 13000,
        growthRate: 35,
        timestamp: '2025-12-23T00:00:00Z'  // 5 days ago
      },
      // ... more dates
      {
        topic: 'kawaii coloring book',
        searchVolume: 18000,
        growthRate: 80,
        timestamp: '2025-12-28T00:00:00Z'  // today
      }
    ]
  })
});
```

## Sample Real Trends (From Your Data)

### Top Trends Right Now:

1. **Portable Blender** (TikTok Shop)
   - Volume: 14,616
   - Growth: 101%
   - Explosion Score: 70.5

2. **Aesthetic Stickers Pack** (TikTok Shop)
   - Volume: 42,999
   - Growth: 90%
   - Explosion Score: 70.5

3. **Aesthetic Room Decor** (TikTok Shop)
   - Volume: 36,138
   - Growth: 97%
   - Explosion Score: 70

### Multi-Source Validated Trends:

Check for trends with multiple sources - these are more reliable:

```bash
curl "http://localhost:3001/api/trends/exploding" | grep -A 20 '"sources".*length.*[2-9]'
```

## Next Actions

### Today (Immediate)

1. ✅ **Restart server** to load new endpoints (if not done):
   ```bash
   # Stop server (Ctrl+C in terminal)
   npm run server
   ```

2. ✅ **Check the UI**:
   - Open http://localhost:5173/ai-trends
   - Navigate through different views
   - See real source names displayed

### This Week

1. **Monitor data accumulation**:
   ```bash
   # Check daily
   curl http://localhost:3001/api/trends/stats
   ```

2. **Create daily snapshots** (set up scheduled task):
   ```bash
   # Run this once per day (automate with cron/Task Scheduler)
   curl -X POST http://localhost:3001/api/trends/snapshot
   ```

3. **Import external data** if available (Helium 10, Exploding Topics)

### After 7 Days

You'll have enough historical data for:
- 📈 Accurate explosion score calculations
- 🎯 Trend trajectory predictions
- ⚡ Growth velocity analysis
- 🔍 Pattern recognition

## Understanding the Data

### Explosion Score (0-100)

- **70-100**: 🔥 EXPLODING - Rapid growth, investigate immediately
- **50-69**: 📈 HOT - Strong upward trend
- **30-49**: 🌱 RISING - Emerging opportunity
- **0-29**: ➡️ STABLE - Consistent but not accelerating

### Trend Status

- **Exploding**: Rapid acceleration
- **Emerging**: Steady growth
- **Peaked**: At maximum, may decline soon
- **Stable**: Consistent performance
- **Declining**: Losing momentum

### Volume Interpretation

Volume means different things per source:
- **Reddit**: Total upvotes/score
- **TikTok**: View count
- **Google**: Search interest (0-100 scale)
- **Etsy/eBay**: Listing count
- **TikTok Shop**: Units sold

## Troubleshooting

### Q: I don't see explosion scores

**A**: Explosion scores require 7+ days of historical data. Either:
- Wait 7 days for automated collection
- Import historical data with timestamps

### Q: Some trends have "undefined" sources

**A**: Run repair (after server restart):
```bash
curl -X POST http://localhost:3001/api/trends/repair
```

### Q: How do I know scrapers are working?

**A**: Check the Data Sources view in the UI or:
```bash
curl http://localhost:3001/api/trends/sources
```

### Q: Can I manually trigger a scrape?

**A**: Yes!
```bash
curl -X POST http://localhost:3001/api/trends/refresh/reddit
curl -X POST http://localhost:3001/api/trends/refresh/google
# ... etc
```

## Data Files

Everything is stored in: `dennisproject/data/trends/exploding-trends.json`

**BACKUP THIS FILE!** It contains all your trend data.

```bash
# Backup command (run daily)
copy dennisproject\data\trends\exploding-trends.json backups\
```

## Performance

- **Data size**: ~11,000 lines JSON (476 trends)
- **Update frequency**: Every 1-12 hours depending on source
- **API response time**: <100ms for most queries
- **Storage**: ~1MB per 500 trends

## Summary

✅ **System is working!**
✅ **Real data is flowing!**
✅ **Historical tracking is enabled!**
✅ **External import is ready!**

Just keep the server running and in 2-3 days you'll have rich historical data for powerful trend analysis! 🚀

---

**For detailed API documentation**: See `TREND_DATA_IMPORT.md`
**For implementation details**: See `IMPLEMENTATION_SUMMARY.md`

