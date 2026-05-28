# AI Trends Integration Test Guide

## Quick Test Checklist

### 1. Server Startup Test
```bash
cd dennisproject
npm run server
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Dennis Automation Server                              ║
║                                                            ║
║   Server running on: http://localhost:3001                 ║
║   Downloads folder:  ./downloads                           ║
║                                                            ║
║   Available models: Gemini & OpenAI DALL-E                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### 2. API Endpoint Tests

#### Test 1: Search Endpoint
```bash
curl -X POST http://localhost:3001/api/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "wireless earbuds", "marketplace": "US"}'
```

**Expected Response Structure:**
```json
{
  "keyword": "wireless earbuds",
  "marketplace": "US",
  "volume": 100000,
  "volumeConfidence": 0.45,
  "difficulty": 50,
  "avgPrice": 29.99,
  "totalRevenue": 89970000,
  "competitorCount": 120,
  "results": [...],
  "snapshots": [...],
  "metadata": {
    "runs": 1,
    "variance": 0.042,
    "lastUpdated": "...",
    "isSimulated": true
  }
}
```

#### Test 2: Queue Stats Endpoint
```bash
curl http://localhost:3001/api/amazon/queue/stats
```

**Expected Response:**
```json
{
  "queue": {
    "total": 1,
    "pending": 0,
    "processing": 0,
    "completed": 1,
    "failed": 0,
    "isProcessing": false
  },
  "cache": {
    "total": 1,
    "expired": 0
  },
  "history": {
    "totalKeywords": 1,
    "totalSnapshots": 31,
    "simulatedKeywords": 1,
    "realKeywords": 0
  }
}
```

#### Test 3: History Endpoint
```bash
curl http://localhost:3001/api/amazon/history/wireless%20earbuds?marketplace=US
```

**Expected Response:**
```json
{
  "keyword": "wireless earbuds",
  "marketplace": "US",
  "snapshots": [
    {
      "date": "2025-11-23",
      "rank": 18,
      "volume": 100000,
      "avgPrice": 29.99
    }
    // ... 30 more entries
  ],
  "lastUpdated": "...",
  "isSimulated": true,
  "snapshotCount": 31
}
```

### 3. Frontend Test

#### Start Development Server
```bash
cd dennisproject
npm run dev
```

#### Navigate to AI Trends
1. Open browser to `http://localhost:5173`
2. Navigate to `/ai-trends` route

#### Test Context Provider
The AITrends component should be wrapped with:
```typescript
<QueryClientProvider>  // ✅ Added in main.tsx
  <AITrendsProvider>   // ⚠️ Needs to be added to AITrends component
    <AITrendsLayout>
      // ... components
    </AITrendsLayout>
  </AITrendsProvider>
</QueryClientProvider>
```

### 4. Hook Usage Test

#### In KeywordExplorer Component:
```typescript
import { useKeywordSearch } from '../../hooks/useAmazonData';
import { useAITrends } from '../../contexts/AITrendsContext';

function KeywordExplorer() {
  const { currentKeyword, marketplace } = useAITrends();
  
  const { data, isLoading, error } = useKeywordSearch(
    currentKeyword,
    marketplace,
    !!currentKeyword // Only fetch if keyword exists
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return <div>No data</div>;

  return (
    <div>
      <h2>{data.keyword}</h2>
      <p>Volume: {data.volume.toLocaleString()}</p>
      <p>Difficulty: {data.difficulty}</p>
      {/* ... render results */}
    </div>
  );
}
```

### 5. Cache Behavior Test

#### First Request (Cold Cache)
```bash
time curl -X POST http://localhost:3001/api/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "bluetooth speaker", "marketplace": "US"}'
```
**Expected:** Takes ~30-45 seconds (includes scraping time)

#### Second Request (Warm Cache)
```bash
time curl -X POST http://localhost:3001/api/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "bluetooth speaker", "marketplace": "US"}'
```
**Expected:** Takes <100ms (served from cache)

### 6. Console Output Test

#### Server Console During Search
```
[Amazon API] Queueing scrape job for keyword: wireless earbuds
✓ Job abc-123 completed successfully (KEYWORD_SNAPSHOT)
[SnapshotStore] Cached keyword: wireless earbuds (US)
[HistoricalStore] Stored 31 snapshots for wireless earbuds (US) - simulated
[Amazon API] Using cached data for keyword: wireless earbuds
```

#### Browser Console (React Dev Tools)
```
[useAmazonData] Fetching keyword: wireless earbuds
[useAmazonData] Data received: { keyword: "wireless earbuds", ... }
[AITrendsContext] Current keyword updated: wireless earbuds
```

### 7. Integration Verification

#### Check All Services are Running
```typescript
// In browser console after running a search
fetch('http://localhost:3001/api/amazon/queue/stats')
  .then(r => r.json())
  .then(data => {
    console.log('Queue:', data.queue);
    console.log('Cache:', data.cache);
    console.log('History:', data.history);
  });
```

**Expected Output:**
```
Queue: { total: 5, pending: 0, processing: 0, completed: 5, failed: 0 }
Cache: { total: 3, expired: 0 }
History: { totalKeywords: 3, totalSnapshots: 93, simulatedKeywords: 3, realKeywords: 0 }
```

### 8. Error Handling Test

#### Test Invalid Keyword
```bash
curl -X POST http://localhost:3001/api/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "", "marketplace": "US"}'
```
**Expected:** 400 Bad Request with error message

#### Test Invalid Marketplace
```bash
curl -X POST http://localhost:3001/api/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "test", "marketplace": "INVALID"}'
```
**Expected:** Should still work (defaults to US) or return validation error

## Troubleshooting

### Issue: "Cannot find module '@tanstack/react-query'"
**Solution:**
```bash
cd dennisproject
npm install @tanstack/react-query
```

### Issue: Server routes not responding
**Solution:**
1. Check server is running on port 3001
2. Verify no firewall blocking
3. Check server console for errors

### Issue: Puppeteer fails to launch
**Solution:**
```bash
# Windows - May need to install Chrome dependencies
npm install puppeteer --force
```

### Issue: Context not working
**Solution:**
Make sure AITrendsProvider wraps the component:
```typescript
// In src/components/AITrends/AITrends.tsx
import { AITrendsProvider } from '../../contexts/AITrendsContext';

export function AITrends() {
  return (
    <AITrendsProvider>
      <AITrendsLayout>
        {/* ... */}
      </AITrendsLayout>
    </AITrendsProvider>
  );
}
```

## Success Criteria

✅ Server starts without errors  
✅ API endpoints respond with correct data structure  
✅ Cache stores and retrieves data  
✅ Historical store generates 31 snapshots  
✅ Queue processes jobs with rate limiting  
✅ Frontend queries can fetch data  
✅ Context provides state management  
✅ No linter errors  
✅ TypeScript types are correct  

## Next Integration Steps

1. **Wrap AITrends component with AITrendsProvider**
2. **Connect TrendsHeader search to context**
3. **Wire KeywordExplorer to useKeywordSearch hook**
4. **Add loading states and error handling**
5. **Display confidence indicators in UI**
6. **Test end-to-end data flow**

## Performance Benchmarks

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| First search (cold) | 30-45s | Includes Puppeteer scraping |
| Cached search | <100ms | Served from memory |
| History lookup | <10ms | In-memory retrieval |
| Queue stats | <5ms | Simple aggregation |
| Context state update | <1ms | React re-render |

## Security Notes

- ⚠️ API has no authentication (add before production)
- ⚠️ CORS is wide open (restrict in production)
- ⚠️ Rate limiting is per-server (use Redis for multi-server)
- ⚠️ No input sanitization (add validation)
- ✅ User agent rotation prevents blocking
- ✅ Rate limiting prevents abuse

## Future Enhancements

1. Add Redis for distributed caching
2. Add database persistence for historical data
3. Add authentication/authorization
4. Add request rate limiting per user
5. Add WebSocket for real-time updates
6. Add analytics and monitoring
7. Add export functionality
8. Add email alerts for tracked keywords




