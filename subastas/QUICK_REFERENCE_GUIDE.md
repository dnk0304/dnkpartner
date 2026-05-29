# Quick Reference Guide - New Features

## Map Toggle Feature

### User Interface
- **Toggle Button**: Floating button at bottom-right (mobile) or integrated in layout
- **Map Position**: Slides in from right side (400-500px responsive width)
- **Persistence**: Your preference is saved in browser localStorage
- **Animation**: Smooth 300ms slide transition

### Usage
```tsx
// In your dashboard page component
<DashboardLayout
  sidebar={<Sidebar />}
  feed={<Feed />}
  map={<MapInner items={auctions} />}
/>
```

The map visibility state is automatically managed and persisted.

---

## Auction Lifecycle States

### Status Flow
```
PRE_AUCTION → ACTIVE → FINISHED
     ↓           ↓
 CANCELLED   SUSPENDED → ACTIVE
```

### Status Meanings
- **PRE_AUCTION**: Found in TEJU/Sede/Registro, not yet on BOE Portal
- **ACTIVE**: Live auction on BOE Portal with active bidding
- **FINISHED**: Auction has ended (automatic transition when endsAt < now)
- **SUSPENDED**: Temporarily halted by court order (can resume)
- **CANCELLED**: Permanently cancelled by court

### Automatic Transitions
Runs every hour via `check_status_transitions` task:
1. Checks PRE_AUCTION items to see if they appeared on BOE
2. Checks ACTIVE items to see if they've ended
3. Checks SUSPENDED items to see if they've resumed

---

## Celery Task Schedule

### Discovery (Find New Auctions)
```
discover_boe_all_provinces    Every 2 hours       All 50 provinces
discover_teju                 Every 4 hours       TEJU edicts
discover_sede                 Daily at 06:00      Court proceedings
discover_registro             Daily at 07:00      Property liens
discover_borme                Daily at 09:00      Business auctions
```

### Pulse (Update Bids)
```
pulse_check_active            Every 1 hour        All ACTIVE auctions
urgent_pulse                  Every 30 minutes    Auctions ending < 24h
```

### Lifecycle (Status Management)
```
check_status_transitions      Every 1 hour        PRE→ACTIVE→FINISHED
check_cancelled_auctions      Daily at 10:00      Find court cancellations
```

### Maintenance
```
backfill_historical          Sunday 02:00        Historical data
archive_old_auctions         1st of month 03:00  Archive old items
cleanup_duplicates           Sunday 04:00        Remove duplicates
geocode_missing_coordinates  Daily 05:00         Add lat/lng
```

---

## Running the System

### Development (SQLite)
```bash
# Terminal 1: Redis
docker-compose up -d redis

# Terminal 2: Celery Worker
cd scraper
celery -A tasks.celeryconfig worker --loglevel=info

# Terminal 3: Celery Beat
cd scraper
celery -A tasks.celeryconfig beat --loglevel=info

# Terminal 4: Next.js
npm run dev
```

### Production (Docker)
```bash
# Start all services
docker-compose up -d

# View real-time logs
docker-compose logs -f scraper-worker

# Monitor with Flower
open http://localhost:5555
```

### Manual Task Execution
```python
# Run a specific task immediately
from tasks.discovery_tasks import discover_boe_province
result = discover_boe_province('Las Palmas')

# Or via Celery
from tasks.celeryconfig import app
app.send_task('tasks.discover_boe_province', args=['Las Palmas'])
```

---

## Database Queries

### Get Auctions by Status
```python
from database.adapter import DatabaseAdapter

db = DatabaseAdapter()

# Get all PRE_AUCTION items
pre_auctions = db.get_auctions_by_status('PRE_AUCTION')

# Get ACTIVE auctions
active = db.get_auctions_by_status('ACTIVE')

# Get urgent auctions (ending soon)
from datetime import datetime, timedelta
cutoff = datetime.now() + timedelta(hours=24)
urgent = db.get_urgent_auctions(cutoff)
```

### Transition Status
```python
# Manually transition an auction
db.transition_status(
    boe_id='BOE-A-2024-12345',
    from_status='PRE_AUCTION',
    to_status='ACTIVE'
)
```

### Update Bid
```python
# Update current bid
db.update_auction_bid('BOE-A-2024-12345', 150000.00)
```

---

## Environment Configuration

### Essential Variables
```env
# Database (choose one)
DATABASE_URL="file:./prisma/dev.db"                              # SQLite
DATABASE_URL="postgresql://user:pass@localhost:5432/subastapro" # PostgreSQL

# Redis (required for Celery)
REDIS_URL="redis://localhost:6379/0"

# Scraper rate limits
SCRAPE_DELAY_SECONDS=120
SCRAPE_MAX_PAGES=10
```

### Optional Enhancements
```env
# Geocoding
GOOGLE_MAPS_API_KEY=your_key
GEOCODING_ENABLED=true

# Proxy (for production scraping)
PROXY_PROVIDER=brightdata
BRIGHTDATA_USERNAME=your_username
BRIGHTDATA_PASSWORD=your_password

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
```

### Feature Flags
```env
# Enable/disable scrapers
SCRAPER_BOE_ENABLED=true
SCRAPER_TEJU_ENABLED=true
SCRAPER_SEDE_ENABLED=false    # Experimental
SCRAPER_REGISTRO_ENABLED=false
SCRAPER_BORME_ENABLED=false

# Enable features
PULSE_MODE_ENABLED=true
URGENT_PULSE_ENABLED=true
GEOCODING_ENABLED=true
```

---

## Monitoring & Debugging

### Flower Dashboard
Access at `http://localhost:5555`
- View active tasks
- Monitor worker status
- See task history
- Inspect task results

### Logs
```bash
# View worker logs
docker-compose logs -f scraper-worker

# View beat logs
docker-compose logs -f scraper-beat

# View all scraper logs
docker-compose logs -f scraper-worker scraper-beat

# Local logs (if LOG_FILE set)
tail -f logs/scraper.log
```

### Task Status
```python
from tasks.celeryconfig import app

# Get task info
result = app.AsyncResult('task-id')
print(result.state)      # PENDING, STARTED, SUCCESS, FAILURE
print(result.info)       # Task result or error
print(result.traceback)  # If failed
```

### Database Status
```python
from database.adapter import DatabaseAdapter

db = DatabaseAdapter()

# Count auctions by status
for status in ['PRE_AUCTION', 'ACTIVE', 'FINISHED']:
    count = len(db.get_auctions_by_status(status))
    print(f"{status}: {count}")
```

---

## Troubleshooting

### Map Not Showing
1. Check browser console for errors
2. Verify localStorage is enabled
3. Clear localStorage: `localStorage.removeItem('subastapro_map_visible')`
4. Ensure MapInner component is properly loaded

### Tasks Not Running
1. Verify Redis is running: `docker-compose ps redis`
2. Check worker connection: `celery -A tasks.celeryconfig inspect active`
3. Verify beat is running: `docker-compose ps scraper-beat`
4. Check for task exceptions in logs

### Database Connection Issues
1. SQLite: Verify file path in DATABASE_URL
2. PostgreSQL: Check connection string and credentials
3. Run migrations: `npx prisma migrate dev`
4. Check connection: `npx prisma studio`

### Rate Limit Errors
1. Increase SCRAPE_DELAY_SECONDS (default: 120)
2. Reduce task frequency in celeryconfig.py
3. Add proxy configuration
4. Check BOE is not blocking your IP

---

## Performance Optimization

### Worker Concurrency
```bash
# Adjust based on CPU cores
celery -A tasks.celeryconfig worker --concurrency=8
```

### Task Queues
Tasks are routed to separate queues:
- `discovery` - New auction discovery
- `pulse` - Bid updates
- `urgent` - Critical ending-soon auctions
- `lifecycle` - Status transitions
- `maintenance` - Cleanup tasks

Run specialized workers:
```bash
# High-priority urgent worker
celery -A tasks.celeryconfig worker -Q urgent --concurrency=2

# Maintenance worker (low priority)
celery -A tasks.celeryconfig worker -Q maintenance --concurrency=1
```

### Database Connection Pooling
```env
# PostgreSQL only
DATABASE_POOL_SIZE=10
```

---

## API Integration

### Query Auctions
```typescript
// In your Next.js API route
import { prisma } from '@/lib/prisma';

// Get all active auctions
const active = await prisma.auction.findMany({
  where: { status: 'ACTIVE' },
  orderBy: { endsAt: 'asc' }
});

// Get pre-auctions from specific source
const tejuItems = await prisma.auction.findMany({
  where: {
    status: 'PRE_AUCTION',
    source: 'TEJU'
  }
});

// Get auctions with coordinates
const mapped = await prisma.auction.findMany({
  where: {
    AND: [
      { latitude: { not: null } },
      { longitude: { not: null } }
    ]
  }
});
```

---

## Next Steps

1. **Run Database Migration**
   ```bash
   npx prisma migrate dev --name add_lifecycle_fields
   ```

2. **Start Services**
   ```bash
   docker-compose up -d
   ```

3. **Monitor First Discovery**
   ```bash
   docker-compose logs -f scraper-worker
   ```

4. **Check Flower Dashboard**
   ```
   http://localhost:5555
   ```

5. **View Results in Frontend**
   ```
   http://localhost:3000
   ```

---

For detailed implementation information, see `IMPLEMENTATION_TASKS_SUMMARY.md`
