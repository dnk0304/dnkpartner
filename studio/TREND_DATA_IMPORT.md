# Trend Data Import Guide

This guide explains how to import trend data from external providers like Helium 10, Exploding Topics, SEMrush, Ahrefs, or custom sources.

## Table of Contents

- [Quick Start](#quick-start)
- [API Endpoints](#api-endpoints)
- [Import Formats](#import-formats)
- [Data Providers](#data-providers)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Repair Existing Data

First, repair any corrupted data in your trend store:

```bash
# Via API
curl -X POST http://localhost:3001/api/trends/repair

# Via CLI
cd server/trends
node repairData.ts
```

### Import External Data

Send a POST request to `/api/trends/import` with your data:

```bash
curl -X POST http://localhost:3001/api/trends/import \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "helium10",
    "data": [
      {
        "topic": "kawaii coloring book",
        "searchVolume": 12500,
        "growthRate": 45,
        "category": "books",
        "timestamp": "2025-12-28T10:00:00Z"
      }
    ]
  }'
```

## API Endpoints

### POST /api/trends/import

Import trends from external providers.

**Request Body:**
```json
{
  "provider": "helium10|exploding-topics|semrush|ahrefs|custom",
  "data": [
    {
      "topic": "string (required)",
      "volume": "number (optional)",
      "searchVolume": "number (optional alternative)",
      "growth": "number (optional)",
      "growthRate": "number (optional alternative)",
      "growthPercent": "number (optional alternative)",
      "category": "string (optional)",
      "timestamp": "string ISO date (optional)",
      "date": "string ISO date (optional alternative)",
      "relatedTopics": "string[] (optional)",
      "metadata": "object (optional)"
    }
  ],
  "sourceName": "string (optional - override source name)"
}
```

**Response:**
```json
{
  "success": true,
  "imported": 150,
  "failed": 5,
  "errors": ["..."],
  "message": "Successfully imported 150 trends, 5 failed"
}
```

### POST /api/trends/repair

Repair corrupted data in the trend store.

**Response:**
```json
{
  "success": true,
  "fixed": 23,
  "removed": 2,
  "message": "Repaired 23 trends, removed 2 invalid trends"
}
```

### POST /api/trends/snapshot

Create historical snapshots from current trend data.

**Response:**
```json
{
  "success": true,
  "count": 150,
  "message": "Created 150 historical snapshots"
}
```

## Import Formats

### Helium 10 Format

```json
{
  "provider": "helium10",
  "data": [
    {
      "topic": "kawaii coloring book",
      "searchVolume": 12500,
      "growthRate": 45,
      "category": "books",
      "timestamp": "2025-12-28T10:00:00Z"
    }
  ]
}
```

### Exploding Topics Format

```json
{
  "provider": "exploding-topics",
  "data": [
    {
      "topic": "viral trend name",
      "volume": 50000,
      "growth": 250,
      "relatedTopics": ["related", "keywords"],
      "timestamp": "2025-12-28T10:00:00Z"
    }
  ]
}
```

### SEMrush / Ahrefs Format

```json
{
  "provider": "semrush",
  "data": [
    {
      "topic": "keyword phrase",
      "searchVolume": 8900,
      "growthPercent": 23,
      "category": "tech",
      "date": "2025-12-28"
    }
  ]
}
```

### Custom Format

```json
{
  "provider": "custom",
  "sourceName": "google", // Override source
  "data": [
    {
      "topic": "anything",
      "volume": 1000,
      "growth": 15
    }
  ]
}
```

## Data Providers

### Supported Providers

| Provider | Source Mapping | Notes |
|----------|---------------|-------|
| `helium10` | amazon | Amazon product trends |
| `exploding-topics` | google | General web trends |
| `semrush` | google | SEO & search data |
| `ahrefs` | google | SEO & backlink data |
| `custom` | google (default) | Use with `sourceName` override |

### Field Name Mapping

The system automatically maps various field names:

- **Volume**: `volume`, `searchVolume`
- **Growth**: `growth`, `growthRate`, `growthPercent`
- **Timestamp**: `timestamp`, `date`

All fields are optional except `topic`.

## Data Storage

### Historical Data Points

Every imported trend automatically creates a historical data point with:
- Date/timestamp
- Volume at that time
- Growth rate at that time

This enables:
- Time-series analysis
- Trend trajectory visualization
- Explosion score calculation (requires 7+ days of data)

### Data Location

All trend data is stored in: `data/trends/exploding-trends.json`

This file includes:
- All trends from all sources
- Historical data points (last 365 days)
- Calculated metrics (explosion scores, growth velocity)
- Source attribution

**Backup this file regularly!**

## Automated Data Collection

### Current Scrapers

The system automatically collects data from:
- Google Trends (every 4 hours)
- Reddit (every 2 hours)
- TikTok (every 6 hours)
- Pinterest (every 8 hours)
- Twitter (every 1 hour)
- Etsy (every 12 hours)
- eBay (every 12 hours)
- Google Shopping (every 6 hours)
- TikTok Shop (every 6 hours)

### Manual Refresh

Trigger a manual scrape:

```bash
curl -X POST http://localhost:3001/api/trends/refresh/reddit
```

Available sources:
- `googleTrends`
- `reddit`
- `tiktok`
- `pinterest`
- `twitter`
- `etsy`
- `ebay`
- `googleShopping`
- `tiktokShop`

## Troubleshooting

### Common Issues

**Q: My imported trends have null values**

A: Run the repair endpoint:
```bash
curl -X POST http://localhost:3001/api/trends/repair
```

**Q: Explosion scores are not calculated**

A: Explosion scores require at least 7 days of historical data. Create snapshots daily:
```bash
curl -X POST http://localhost:3001/api/trends/snapshot
```

**Q: How do I view my imported trends?**

A: Use the trends API:
```bash
# Get all trends
curl http://localhost:3001/api/trends/exploding

# Search for specific trend
curl http://localhost:3001/api/trends/search?q=kawaii

# Get by category
curl http://localhost:3001/api/trends/categories
```

**Q: Can I import historical data?**

A: Yes! Include a `timestamp` or `date` field with each data point. You can import multiple entries with different timestamps for the same topic to build historical data.

Example:
```json
{
  "provider": "custom",
  "data": [
    {
      "topic": "kawaii coloring book",
      "volume": 10000,
      "growth": 20,
      "timestamp": "2025-12-21T00:00:00Z"
    },
    {
      "topic": "kawaii coloring book",
      "volume": 11000,
      "growth": 25,
      "timestamp": "2025-12-22T00:00:00Z"
    },
    {
      "topic": "kawaii coloring book",
      "volume": 13000,
      "growth": 35,
      "timestamp": "2025-12-23T00:00:00Z"
    }
  ]
}
```

## Best Practices

1. **Daily Snapshots**: Create snapshots daily to build historical data
   ```bash
   curl -X POST http://localhost:3001/api/trends/snapshot
   ```

2. **Regular Repairs**: Run repair weekly to fix any data issues
   ```bash
   curl -X POST http://localhost:3001/api/trends/repair
   ```

3. **Backup Data**: Backup `data/trends/exploding-trends.json` regularly

4. **Import Strategy**:
   - Import data with timestamps to build history
   - Use consistent provider names for related data
   - Include categories when possible for better organization

5. **API Integration**: For Helium 10 or Exploding Topics APIs:
   - Fetch data daily
   - Transform to our format
   - POST to `/api/trends/import`
   - Automated with cron jobs or scheduled tasks

## Example Integration Scripts

### Python Example (Helium 10)

```python
import requests
import json
from datetime import datetime

# Fetch from Helium 10 API (pseudo-code)
helium_data = fetch_helium10_trends()

# Transform to our format
trends_data = {
    "provider": "helium10",
    "data": [
        {
            "topic": trend["keyword"],
            "searchVolume": trend["search_volume"],
            "growthRate": trend["trend_score"],
            "category": "books",
            "timestamp": datetime.now().isoformat()
        }
        for trend in helium_data
    ]
}

# Import to our system
response = requests.post(
    "http://localhost:3001/api/trends/import",
    json=trends_data
)
print(response.json())
```

### JavaScript/Node Example (Exploding Topics)

```javascript
const fetch = require('node-fetch');

async function importExplodingTopics() {
  // Fetch from Exploding Topics API
  const response = await fetch('https://api.explodingtopics.com/trends');
  const data = await response.json();
  
  // Transform to our format
  const trendsData = {
    provider: 'exploding-topics',
    data: data.trends.map(trend => ({
      topic: trend.name,
      volume: trend.volume,
      growth: trend.growth_percentage,
      relatedTopics: trend.related_keywords,
      timestamp: new Date().toISOString()
    }))
  };
  
  // Import to our system
  const importResponse = await fetch('http://localhost:3001/api/trends/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trendsData)
  });
  
  const result = await importResponse.json();
  console.log(result);
}

importExplodingTopics();
```

## Support

For issues or questions, check:
- Server logs: `dennisproject/server/`
- Data file: `dennisproject/data/trends/exploding-trends.json`
- API response errors for specific details

