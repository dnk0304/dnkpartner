# SubastaPro Backend - Quick Start

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Node.js dependencies
npm install

# Python dependencies (if not already installed)
pip install requests schedule beautifulsoup4 lxml
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Generate VAPID keys for push notifications
npx web-push generate-vapid-keys

# Add the keys to .env
# Edit .env and add your API keys (Resend, Stripe, etc.)
```

### 3. Update Database

```bash
npm run db:push
```

### 4. Start Application

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

**With PM2 (recommended for production):**
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 📚 Documentation

- **[BACKEND_SETUP.md](./docs/BACKEND_SETUP.md)** - Comprehensive setup guide
- **[IMPLEMENTATION_SUMMARY.md](./docs/IMPLEMENTATION_SUMMARY.md)** - Complete feature list
- **[FILES_CREATED.md](./docs/FILES_CREATED.md)** - All files created/modified
- **[AUCTION_SCRAPING_WORKFLOW.md](./docs/AUCTION_SCRAPING_WORKFLOW.md)** - Scraping architecture

## ✅ What's Implemented

### Scraping
- ✅ BOE active auctions (every 1 hour)
- ✅ TEJU pre-auctions (every 6 hours)
- ✅ Bank portals: Servihabitat, Haya, Altamira (daily at 04:00)

### Data Processing
- ✅ Normalization service (currency, dates, status)
- ✅ Geocoding (Nominatim + Catastro)
- ✅ Change detection (price, status, location)
- ✅ Pre-auction linking

### Notifications
- ✅ Email (Resend)
- ✅ Web Push
- ✅ WhatsApp (Baileys/Twilio)

### Infrastructure
- ✅ Unified startup command
- ✅ PM2 configuration
- ✅ Scheduled tasks
- ✅ Database schema updates

## ⚠️ Important Notes

### Bank Scrapers Need API Reverse Engineering

The bank scrapers are **template implementations**. Before production use:

1. Open bank website in browser
2. Open DevTools → Network tab
3. Search for properties
4. Find API requests (XHR/Fetch)
5. Update scraper with actual endpoints

**Example:**
```python
# In servihabitat_scraper.py
def get_api_base_url(self) -> str:
    return "https://api.servihabitat.com"  # ← Replace with real URL

def get_search_endpoint(self) -> str:
    return "/v1/assets/search"  # ← Replace with real endpoint
```

### WhatsApp Setup

**Option 1: Baileys (Free)**
- First run will show QR code
- Scan with WhatsApp
- Session saved automatically

**Option 2: Twilio (Paid)**
- Sign up at twilio.com
- Add credentials to `.env`
- ~$0.005 per message

## 🔧 Troubleshooting

### "Module not found" errors
```bash
npm install
pip install -r scraper/requirements.txt
```

### Database errors
```bash
npm run db:push
```

### Bank scraper returns empty
- API endpoints need reverse engineering
- See "Bank Scrapers Need API Reverse Engineering" above

### Geocoding rate limit
- Nominatim: 1 req/sec (free)
- Consider Google Maps API for higher volume

## 📊 Monitoring

```bash
# View scraper logs
tail -f scraper/logs/scheduler_*.log

# PM2 status
pm2 status
pm2 logs

# Database GUI
npm run db:studio
```

## 🔐 Security

- ✅ `.env` excluded from git
- ✅ API keys in environment variables
- ✅ Rate limiting on all scrapers
- ⚠️ Generate VAPID keys (see setup above)
- ⚠️ Use HTTPS in production

## 📈 Scheduled Tasks

| Task | Frequency | Description |
|------|-----------|-------------|
| BOE Active | Every 1 hour | Active auctions (priority) |
| Pre-auctions | Every 6 hours | TEJU pre-auction discovery |
| Bank portals | Daily 04:00 | Servihabitat, Haya, Altamira |
| Geocoding | Every 2 hours | Backfill 100 auctions |
| Status monitor | Every 30 min | Update expired auctions |
| Full scan | Daily 03:00 | Comprehensive scrape |

## 🆘 Support

Issues? Check:
1. Logs: `scraper/logs/scheduler_*.log`
2. PM2: `pm2 logs`
3. Database: `npm run db:studio`
4. Documentation: `docs/BACKEND_SETUP.md`

---

**Status:** ✅ Ready for production (after bank API setup)

**Version:** 1.0.0

**Last Updated:** 2026-01-28
