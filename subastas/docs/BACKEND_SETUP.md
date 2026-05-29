# SubastaPro Backend - Setup & Configuration

## Overview

This document describes the backend implementation for SubastaPro, including:
- Bank portal scrapers (Servihabitat, Haya, Altamira)
- Centralized normalization service
- Geocoding with Nominatim
- Change detection and pre-auction linking
- Multi-channel notifications (Email, Push, WhatsApp)

## Prerequisites

- Node.js 20+ with npm
- Python 3.8+
- SQLite or PostgreSQL

## Installation

### 1. Install Node.js Dependencies

```bash
npm install
```

This installs:
- `@whiskeysockets/baileys` - WhatsApp integration
- `web-push` - Web Push notifications
- `concurrently` - Run multiple processes
- And all existing dependencies

### 2. Install Python Dependencies

The existing Python environment should have:
- `requests` - For API calls
- `schedule` - For task scheduling
- `beautifulsoup4` / `lxml` - For HTML parsing

Additional requirements for new features:
```bash
pip install requests schedule
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Push Notifications (Web Push)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

# WhatsApp (Optional - Baileys or Twilio)
# For Baileys: No API keys needed, just scan QR code on first run
# For Twilio:
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Database
DATABASE_URL="file:./data/database/prod.db"

# Resend Email (Already configured)
RESEND_API_KEY=your_resend_api_key

# Optional: Google Maps for better geocoding
GOOGLE_MAPS_API_KEY=your_google_maps_key
```

### 4. Generate VAPID Keys for Web Push

```bash
npx web-push generate-vapid-keys
```

Add the output to your `.env` file.

### 5. Update Database Schema

```bash
npm run db:push
```

This adds the `PushSubscription` model and `phone` field to User.

## Starting the Application

### Development Mode

```bash
npm run dev
```

This starts:
- Next.js dev server on port 3005
- Python scheduler for scraping

### Production Mode

```bash
# Build Next.js
npm run build

# Start all services with master command
npm start
```

This orchestrates:
1. Next.js production server (port 3005)
2. Python scraper scheduler

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 status
pm2 logs

# Stop
pm2 stop all
```

## Architecture Overview

### Scraping Pipeline

```
BOE / TEJU / Banks (APIs)
    ↓
Raw Data Scrapers
    ↓
Normalization Service → Standardized AuctionModel
    ↓
Geocoding Service → Add coordinates
    ↓
Database (SQLite/PostgreSQL)
    ↓
Change Detection → Trigger Notifications
    ↓
Multi-Channel Notification Service
    ├─ Email (Resend)
    ├─ Web Push
    └─ WhatsApp (Baileys)
```

### Key Services

#### 1. Bank Scrapers

Located in `scraper/scrapers/`:
- `bank_base_scraper.py` - Base class with JSON API handling
- `servihabitat_scraper.py` - Servihabitat (CaixaBank)
- `haya_scraper.py` - Haya Real Estate
- `altamira_scraper.py` - Altamira (Santander)

**Note:** Bank APIs need reverse engineering with browser DevTools. Current implementations are indicative templates.

#### 2. Normalization Service

`scraper/services/normalization_service.py`

Converts disparate data formats into standardized `AuctionModel`:
- Currency parsing (European format)
- Spanish date parsing
- Status mapping
- Category inference

#### 3. Geocoding Service

`scraper/services/geocoding_service.py`

Features:
- Nominatim (OpenStreetMap) integration
- 1 req/sec rate limiting
- Cadastral reference validation
- Catastro API integration for Spanish properties

#### 4. Change Detection

`scraper/services/change_detector.py`

Detects:
- Status changes (ACTIVE → FINISHED)
- Price changes (bid updates)
- Location data updates

#### 5. Pre-Auction Linker

`scraper/services/preauction_linker.py`

Links TEJU pre-auctions to BOE active listings:
- Match by procedure number
- Match by cadastral reference
- Fuzzy match by address
- Mark "zombie" pre-auctions (>90 days stale)

#### 6. Notification Service

`src/lib/notifications/notification-service.ts`

Orchestrates multi-channel notifications:
- **Email**: Using Resend (already configured)
- **Web Push**: Using `web-push` library
- **WhatsApp**: Using Baileys (free) or Twilio (paid)

### Scheduled Tasks

Defined in `scraper/scheduler.py`:

| Task | Frequency | Description |
|------|-----------|-------------|
| BOE Active | Every 1 hour | Priority scraping of active auctions |
| Pre-auctions | Every 6 hours | TEJU/Sede pre-auction discovery |
| Bank portals | Daily at 04:00 | Servihabitat, Haya, Altamira |
| Geocoding backfill | Every 2 hours | Add coordinates to 100 auctions |
| Status monitor | Every 30 minutes | Update expired auctions |
| Full daily scan | Daily at 03:00 | Comprehensive scrape (100 pages) |

## API Endpoints

### Push Notifications

**Subscribe to Push**
```
POST /api/push/subscribe
Body: { endpoint, keys: { p256dh, auth } }
```

**Unsubscribe**
```
DELETE /api/push/subscribe
Body: { endpoint }
```

## Testing Bank Scrapers

To test a specific bank scraper:

```python
from scraper.scrapers.servihabitat_scraper import ServihabitatScraper

scraper = ServihabitatScraper(province="Madrid")
auctions = scraper.scrape(max_pages=2)

print(f"Found {len(auctions)} auctions")
for auction in auctions[:3]:
    print(auction['title'], auction['appraisal_value'])
```

**Important:** You'll need to reverse engineer the actual API endpoints using browser DevTools:

1. Open bank website (e.g., servihabitat.com)
2. Open DevTools → Network tab
3. Search for properties
4. Find XHR/Fetch requests to API
5. Copy request headers and parameters
6. Update scraper with real endpoints

## WhatsApp Setup

### Option 1: Baileys (Free)

1. First run will display QR code
2. Scan with WhatsApp on your phone
3. Session saved to `data/whatsapp-session/`
4. Auto-reconnects on subsequent runs

### Option 2: Twilio (Paid, ~$0.005/message)

1. Sign up at twilio.com
2. Enable WhatsApp sandbox
3. Add credentials to `.env`
4. Modify `whatsapp-channel.ts` to use Twilio

## Troubleshooting

### Geocoding Rate Limits

Nominatim has 1 req/sec limit. If you hit rate limits:
- Increase `RATE_LIMIT_DELAY` in `geocoding_service.py`
- Consider paid Google Maps Geocoding API for higher volumes

### Bank Scraper Failures

If bank scrapers fail:
1. Check if website structure changed
2. Verify API endpoints are still valid
3. Check if IP is blocked (use proxies)
4. Review rate limiting settings

### WhatsApp Connection Lost

If Baileys connection drops:
1. Delete `data/whatsapp-session/`
2. Restart and scan QR code again
3. Ensure phone has internet connection

## Performance Optimization

### Database Indexes

Key indexes already configured in Prisma:
- `province`, `status`, `publishedAt`
- `municipality`, `propertyType`, `source`

### Caching

Geocoding results are cached in-memory. For production:
- Consider Redis for persistent cache
- Implement cache expiration policies

### Proxies for Scrapers

For high-volume scraping:
- Use BrightData or ScraperAPI
- Rotate user agents
- Implement exponential backoff

## Monitoring & Logs

### Scraper Logs

Located in `scraper/logs/`:
- `scheduler_YYYYMMDD.log` - Daily scheduler logs

### PM2 Logs

```bash
pm2 logs subastapro-web       # Next.js logs
pm2 logs subastapro-scraper   # Python scraper logs
```

### Database Monitoring

```bash
npm run db:studio
```

Opens Prisma Studio on port 5556.

## Security Considerations

1. **API Keys**: Never commit `.env` to version control
2. **Rate Limiting**: Respect API rate limits to avoid IP bans
3. **User Data**: Phone numbers stored for WhatsApp must comply with GDPR
4. **Push Subscriptions**: Validate endpoint origins
5. **Proxies**: Use authenticated proxies for bank scraping

## Future Enhancements

- [ ] Implement Redis for distributed caching
- [ ] Add Catastro API enrichment for property details
- [ ] Telegram notifications as alternative to WhatsApp
- [ ] GraphQL API for mobile app
- [ ] Real-time bidding tracker using WebSockets
- [ ] ML model for property price prediction

## Support

For issues or questions:
- Check logs in `scraper/logs/`
- Review error messages in PM2: `pm2 logs`
- Ensure all dependencies installed: `npm install && pip install -r requirements.txt`
