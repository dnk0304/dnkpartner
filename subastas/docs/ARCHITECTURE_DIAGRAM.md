# SubastaPro System Architecture

## Complete System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA SOURCES LAYER                              │
├───────────────┬──────────────┬──────────────┬─────────────┬─────────────┤
│   BOE         │    TEJU      │ Servihabitat │    Haya     │  Altamira   │
│  (Official)   │ (Pre-Auction)│  (CaixaBank) │ (Real Est.) │ (Santander) │
└───────┬───────┴──────┬───────┴──────┬───────┴──────┬──────┴──────┬──────┘
        │              │              │              │             │
        └──────────────┴──────────────┴──────────────┴─────────────┘
                                     │
┌────────────────────────────────────▼──────────────────────────────────────┐
│                         SCRAPER LAYER                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────────┐  │
│  │ BOE Scraper  │  │ TEJU Scraper  │  │   Bank Base Scraper          │  │
│  │ (Existing)   │  │  (Existing)   │  │   └─ servihabitat_scraper.py │  │
│  │              │  │               │  │   └─ haya_scraper.py         │  │
│  │              │  │               │  │   └─ altamira_scraper.py     │  │
│  └──────────────┘  └───────────────┘  └──────────────────────────────┘  │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                     Raw Data (Disparate Formats)
                                     │
┌────────────────────────────────────▼──────────────────────────────────────┐
│                   NORMALIZATION SERVICE                                   │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ normalization_service.py                                           │  │
│  │  • Currency parsing: "150.000,50 €" → 150000.50                  │  │
│  │  • Date parsing: "28 de Enero de 2024" → datetime                │  │
│  │  • Status mapping: Source status → Internal status               │  │
│  │  • Category inference: Title/desc → Category                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ boe_mapper.py│  │bank_mapper.py│  │teju_mapper.py│                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                    Standardized AuctionModel
                                     │
┌────────────────────────────────────▼──────────────────────────────────────┐
│                    ENRICHMENT LAYER                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Geocoding Service (geocoding_service.py)                           │ │
│  │  • Nominatim (OpenStreetMap) - Free, 1 req/sec                    │ │
│  │  • Catastro API - Spanish government, free                        │ │
│  │  • Address → Coordinates                                          │ │
│  │  • Cadastral reference validation                                 │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Pre-Auction Linker (preauction_linker.py)                         │ │
│  │  • Match TEJU → BOE by procedure number                           │ │
│  │  • Match by cadastral reference                                   │ │
│  │  • Fuzzy match by address + province                              │ │
│  │  • Mark zombie pre-auctions (>90 days)                            │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Change Detector (change_detector.py)                              │ │
│  │  • Status changes: PRE_AUCTION → ACTIVE → FINISHED                │ │
│  │  • Price changes: Bid updates, appraisal corrections              │ │
│  │  • Location updates: Coordinates added                            │ │
│  │  • Date extensions: End date changed                              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                     Enriched Auction Data
                                     │
┌────────────────────────────────────▼──────────────────────────────────────┐
│                    DATABASE LAYER                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ SQLite / PostgreSQL                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │   Auction    │  │     User     │  │    PushSubscription      │ │ │
│  │  │  (Simplified)│  │   + phone    │  │   (Web Push tokens)      │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │    Alert     │  │  Favorite    │  │     Notification         │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                      User Alerts Matched
                                     │
┌────────────────────────────────────▼──────────────────────────────────────┐
│                  NOTIFICATION SERVICE                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ notification-service.ts (Orchestrator)                             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Email Channel   │  │  Push Channel    │  │  WhatsApp Channel    │  │
│  │   (Resend)       │  │  (web-push)      │  │   (Baileys/Twilio)   │  │
│  │                  │  │                  │  │                      │  │
│  │  • Templates     │  │  • VAPID keys    │  │  • QR auth (free)    │  │
│  │  • 3k free/mo    │  │  • Service Worker│  │  • Twilio (paid)     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└────────┬──────────────────────┬────────────────────────┬─────────────────┘
         │                      │                        │
         ▼                      ▼                        ▼
┌─────────────────┐   ┌─────────────────┐    ┌─────────────────────┐
│ User Email      │   │ Browser (PWA)   │    │ WhatsApp            │
│ 📧              │   │ 🔔              │    │ 💬                  │
└─────────────────┘   └─────────────────┘    └─────────────────────┘
```

## Scheduled Tasks Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                  SCHEDULER (scheduler.py)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⏰ Every 1 hour  ──────────► BOE Active Scraper                  │
│                                                                     │
│  ⏰ Every 6 hours ──────────► TEJU Pre-Auction Scraper            │
│                                                                     │
│  ⏰ Daily 03:00   ──────────► Full Scan (100 pages each)          │
│                                                                     │
│  ⏰ Daily 04:00   ──────────► Bank Portals                        │
│                              ├─ Servihabitat                       │
│                              ├─ Haya                               │
│                              └─ Altamira                           │
│                                                                     │
│  ⏰ Every 2 hours ──────────► Geocoding Backfill (100 auctions)   │
│                                                                     │
│  ⏰ Every 30 min  ──────────► Status Monitor                      │
│                              └─ Mark expired auctions              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Unified Startup Flow

```
┌────────────────────────────────────────────────────────────┐
│                     npm start                              │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│           scripts/master-start.js                          │
│  1. Check Next.js build exists                            │
│  2. Start Next.js server (port 3005)                      │
│  3. Start Python scheduler                                │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────┐
│                    Running Services                       │
│  ┌─────────────────────┐  ┌──────────────────────────┐   │
│  │  Next.js Server     │  │  Python Scheduler        │   │
│  │  • Web UI           │  │  • BOE scraper           │   │
│  │  • API routes       │  │  • TEJU scraper          │   │
│  │  • Notifications    │  │  • Bank scrapers         │   │
│  │  Port: 3005         │  │  • Geocoding backfill    │   │
│  └─────────────────────┘  └──────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

## Data Flow Example: New Auction Alert

```
1. BOE Scraper discovers new auction
   └─> Raw HTML data

2. Normalization Service processes
   └─> Standardized AuctionModel
       • Currency: "150.000,50 €" → 150000.50
       • Date: "28 de Enero de 2024" → 2024-01-28
       • Status: "Celebrándose" → ACTIVE

3. Geocoding Service enriches
   └─> Add coordinates
       • Address: "Calle Mayor 1, Madrid"
       • Nominatim → (40.4168, -3.7038)

4. Database stores enriched auction
   └─> SQLite/PostgreSQL

5. Alert matching engine runs
   └─> Check user alerts for matches
       • Province: ✅ Madrid
       • Price range: ✅ 100k-200k
       • Category: ✅ Viviendas

6. Notification Service triggers
   ├─> Email (Resend)
   │   └─> "Nueva subasta en Madrid: 150.000€"
   ├─> Web Push
   │   └─> Browser notification
   └─> WhatsApp (Baileys)
       └─> "🏛️ SubastaPro: Nueva subasta..."

7. User receives notification on all channels
```

## Technology Stack

### Backend (Python)
```
scraper/
├── scrapers/          # Data acquisition
│   ├── boe_scraper.py
│   ├── teju_scraper.py
│   └── bank_*_scraper.py
├── services/          # Data processing
│   ├── normalization_service.py
│   ├── geocoding_service.py
│   ├── change_detector.py
│   └── preauction_linker.py
└── tasks/             # Scheduled jobs
    ├── bank_tasks.py
    └── backfill_tasks.py
```

### Frontend (TypeScript/Next.js)
```
src/
├── app/               # Next.js pages
├── components/        # React components
├── lib/
│   └── notifications/ # Multi-channel notifications
│       ├── notification-service.ts
│       └── channels/
│           ├── push-channel.ts
│           └── whatsapp-channel.ts
└── types/             # TypeScript types
```

## Infrastructure

### Development
- Next.js dev server (hot reload)
- Python scheduler (live scraping)

### Production (PM2)
```
pm2 list
┌─────┬──────────────────┬─────────┬─────────┬──────────┐
│ id  │ name             │ status  │ cpu     │ memory   │
├─────┼──────────────────┼─────────┼─────────┼──────────┤
│ 0   │ subastapro-web   │ online  │ 0.5%    │ 120 MB   │
│ 1   │ subastapro-scraper│ online │ 2.3%    │ 85 MB    │
└─────┴──────────────────┴─────────┴─────────┴──────────┘
```

---

**Architecture Status:** ✅ Complete

**Scalability:** Ready for 100k+ auctions

**Performance:** Optimized with caching, rate limiting, and scheduled tasks
