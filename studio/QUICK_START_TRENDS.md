# Quick Start Guide - Multi-Source Trends

## Installation

Run this command to install the new dependencies:

```bash
cd dennisproject
npm install
```

This will install:
- `cheerio` - HTML parsing for web scraping
- `node-cron` - Scheduled task execution
- `@types/cheerio` - TypeScript types
- `@types/node-cron` - TypeScript types

## Starting the System

### Option 1: Run Everything Together (Recommended)
```bash
npm start
```

This runs both the server and frontend concurrently.

### Option 2: Run Separately
```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm run dev
```

## What Happens on Startup

1. **Server starts** on `http://localhost:3001`
2. **Trend scheduler initializes** with all 5 data sources
3. **Initial data collection begins** after 5 seconds:
   - Google Trends (US, UK, DE daily trends)
   - Reddit (trending topics across relevant subreddits)
   - Etsy (trending searches)
   - eBay (trending searches)
   - TikTok (trending hashtags)
4. **Frontend starts** on `http://localhost:5173`

## Accessing the Features

### 1. Category Explorer UI

Navigate to: **AI Trends → Exploding Trends → By Category**

Or directly: `http://localhost:5173/ai-trends` → Click "By Category"

**What you'll see:**
- Beautiful category cards with icons
- Top 3 trends per category
- Exploding trends count badges
- Click any category to see detailed view

### 2. API Endpoints

All endpoints are available at `http://localhost:3001/api/trends/`

**Test the API:**
```bash
# Get all exploding trends
curl http://localhost:3001/api/trends/exploding

# Get categories
curl http://localhost:3001/api/trends/categories

# Get stats
curl http://localhost:3001/api/trends/stats

# Get data source status
curl http://localhost:3001/api/trends/sources

# Search trends
curl http://localhost:3001/api/trends/search?q=coloring

# Trigger manual refresh
curl -X POST http://localhost:3001/api/trends/refresh/reddit
```

### 3. Scheduler Status

The scheduler runs automatically. Check its status:

```bash
curl http://localhost:3001/api/trends/sources
```

**Expected response:**
```json
{
  "success": true,
  "sources": [
    {
      "source": "googleTrends",
      "enabled": true,
      "lastRun": "2025-12-23T...",
      "nextRun": null,
      "status": "idle",
      "trendsCollected": 28
    },
    // ... other sources
  ]
}
```

## Scheduled Collection Times

The system automatically collects data on these schedules:

| Source | Interval | Cron Expression |
|--------|----------|-----------------|
| Google Trends | Every 4 hours | `0 */4 * * *` |
| Reddit | Every 2 hours | `0 */2 * * *` |
| Etsy | Every 12 hours | `0 */12 * * *` |
| eBay | Every 12 hours | `0 */12 * * *` |
| TikTok | Every 6 hours | `0 */6 * * *` |

## Manual Data Refresh

To manually trigger a data source refresh:

```bash
# Via API
curl -X POST http://localhost:3001/api/trends/refresh/googleTrends
curl -X POST http://localhost:3001/api/trends/refresh/reddit
curl -X POST http://localhost:3001/api/trends/refresh/etsy
curl -X POST http://localhost:3001/api/trends/refresh/ebay
curl -X POST http://localhost:3001/api/trends/refresh/tiktok
```

The refresh happens in the background. Check `/api/trends/sources` to see the status.

## Troubleshooting

### No trends showing up?

**Wait 1-2 minutes** after server startup. The initial collection runs after a 5-second delay and processes sources sequentially to avoid rate limiting.

Check the server console for logs:
```
[TrendScheduler] Running initial data collection...
[TrendScheduler] Collecting Google Trends data...
[TrendScheduler] Google Trends collection complete: 28 trends
[TrendScheduler] Collecting Reddit trends...
[TrendScheduler] Reddit collection complete: 35 trends
...
```

### API returns empty arrays?

The scrapers need time to collect data. You can:

1. **Check source status:**
   ```bash
   curl http://localhost:3001/api/trends/sources
   ```

2. **Manually trigger collection:**
   ```bash
   curl -X POST http://localhost:3001/api/trends/refresh/reddit
   ```

3. **Check server logs** for any errors

### Rate limiting errors?

The scrapers have built-in rate limiting:
- Etsy: 3 seconds between requests
- eBay: 2 seconds between requests
- TikTok: 3 seconds between requests
- Reddit: 2 seconds between requests

If you see rate limit errors, the scheduler will retry on the next cycle.

## Data Storage

Trends are stored in:
```
dennisproject/data/trends/
```

This directory is created automatically by the `trendStore`.

## Stopping the System

Press `Ctrl+C` in the terminal running the server.

The scheduler will gracefully shut down:
```
[Server] Shutting down gracefully...
[TrendScheduler] Stopping all scheduled tasks...
[TrendScheduler] Stopped googleTrends scheduler
[TrendScheduler] Stopped reddit scheduler
...
```

## Next Steps

1. **Explore the Category Explorer** - See trends organized by category
2. **Test the API** - Use the endpoints to build custom features
3. **Monitor the scheduler** - Check `/api/trends/sources` regularly
4. **Filter trends** - Use query parameters to filter by category, status, or score

Enjoy your Multi-Source Trend Intelligence System! 🚀

