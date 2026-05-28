# Trends Microservice

Standalone trends scraping service that can run independently from the main application.

## Features

- **Independent Operation**: Runs on its own port (default: 3001)
- **Automated Scraping**: Scheduled trend collection from multiple sources
- **Health Monitoring**: Real-time scraper health tracking
- **RESTful API**: Complete API for trend data access
- **Captcha Handling**: Integrated free captcha detection and solving
- **Proxy Management**: Built-in proxy rotation and validation

## Running the Service

### Development Mode
```bash
cd server/trends
npm run dev
```

### Production Mode
```bash
cd server/trends
npm run build
npm run start:prod
```

### As Separate Process
The microservice can run completely independently:
```bash
# Terminal 1: Main application
npm run dev

# Terminal 2: Trends microservice
cd server/trends
npm run dev
```

## API Endpoints

### Trends Data
- `GET /api/trends` - Get all trends
- `GET /api/trends/:source` - Get trends by source
- `GET /api/categories` - Get monitored categories
- `POST /api/categories` - Add monitored category

### Keywords
- `GET /api/keywords` - Get discovered keywords
- `POST /api/keywords/:keyword/record` - Record keyword result

### Health & Monitoring
- `GET /health` - Service health check
- `GET /api/health/scrapers` - Scraper health status
- `GET /api/metrics/storage` - Storage metrics
- `GET /api/proxies` - Proxy status

### Scheduler Control
- `POST /api/scheduler/start` - Start scheduler
- `POST /api/scheduler/stop` - Stop scheduler
- `GET /api/scheduler/status` - Get scheduler status

### Manual Operations
- `POST /api/scrape/:source` - Trigger manual scrape

## Environment Variables

```bash
# Service Configuration
TRENDS_PORT=3001

# Proxy Configuration (Optional)
BRIGHT_DATA_PROXY=http://user:pass@proxy.brightdata.com:port
OXYLABS_PROXY=http://user:pass@proxy.oxylabs.io:port

# Scraping Configuration
SCRAPER_HEADLESS=true
SCRAPER_TIMEOUT=30000
```

## Benefits of Separate Microservice

### 1. Isolation
- Scraping failures don't affect main app
- Independent resource management
- Separate error boundaries

### 2. Scalability
- Can run on different server/container
- Easy horizontal scaling
- Independent deployment

### 3. Maintenance
- Update scraping logic without main app downtime
- Easier debugging and monitoring
- Independent restart capability

### 4. Performance
- Dedicated resources for scraping
- No blocking of main app
- Better memory management

### 5. Security
- Can run in isolated network
- Separate credentials/API keys
- Better proxy management

## Connecting to Main App

The main application can connect to the trends microservice via HTTP:

```typescript
// In main app
const TRENDS_SERVICE_URL = 'http://localhost:3001';

async function getTrends() {
  const response = await fetch(`${TRENDS_SERVICE_URL}/api/trends`);
  return response.json();
}
```

## Monitoring

Access the health dashboard at:
```
http://localhost:3001/api/health/scrapers
```

This provides real-time status for all scrapers including:
- Success rates
- Last successful scrape
- Error messages
- Data freshness
- Mock data usage

## Data Storage

Data is stored in `data/scrapers/` with the following structure:
```
data/scrapers/
├── trends/
│   ├── exploding-trends.json
│   ├── discovered-keywords.json
│   └── archive/
├── amazon/
├── tiktok/
├── reddit/
└── [other sources]/
```

## Troubleshooting

### Service won't start
- Check if port 3001 is available
- Verify Node.js version (>=18.0.0)
- Check file permissions for data directories

### Scrapers failing
- Check proxy configuration
- Review scraper health endpoint
- Check for captcha issues
- Verify network connectivity

### High mock data usage
- Review proxy rotation settings
- Check scraper health metrics
- Consider adding more proxies
- Review captcha solving configuration
