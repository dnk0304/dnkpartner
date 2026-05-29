# SubastaPro - Luxury Auction Intelligence Platform

A premium Spanish auction intelligence platform built with Next.js 15, Prisma, and Python scrapers. Features tiered access control, real-time data from BOE and TEJU, and an elegant UI inspired by Linear.app.

## 🏗️ Architecture

```
SubastaPro/
├── src/                      # Next.js frontend
│   ├── app/                  # App router pages & API routes
│   │   ├── api/
│   │   │   ├── auctions/     # Main auction endpoint with tier masking
│   │   │   └── stats/        # Province statistics
│   │   ├── login/            # Authentication page
│   │   └── page.tsx          # Dashboard
│   ├── components/
│   │   ├── dashboard/        # Core UI components
│   │   └── ui/               # Shadcn components
│   ├── lib/
│   │   ├── constants.ts      # Spain's 50 provinces & categories
│   │   ├── prisma.ts         # Database client
│   │   └── utils.ts
│   └── types/
│
├── prisma/                   # Database schema & migrations
│   ├── schema.prisma         # Auction, User, Alert models
│   └── seed.ts               # Initial data seeder
│
├── scraper/                  # Python scraper module
│   ├── boe_scraper.py        # BOE Discovery + Pulse Mode
│   ├── teju_scraper.py       # TEJU PDF + OCR
│   ├── tasks.py              # Celery task definitions
│   ├── celeryconfig.py       # Schedules (6h, 30m, 15m, daily)
│   └── db.py                 # Direct Postgres access
│
└── docker-compose.yml        # Postgres + Redis containers
```

## 🚀 Quick Start

### One Command to Rule Them All

```bash
npm start
```

**That's it!** This single command:
1. ✅ Checks/installs dependencies
2. ✅ Generates Prisma client
3. ✅ Creates SQLite database (no Docker needed!)
4. ✅ Seeds 2,000+ auctions across all 50 Spanish provinces
5. ✅ Starts the development server with hot-reload

Visit **http://localhost:3000** 🎉

---

### Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | 🚀 **Master command** - Full setup + dev server |
| `npm run start:fresh` | Reset database + fresh start |
| `npm run start:prod` | Full setup + production server |
| `npm run dev` | Quick dev server (skips full setup) |
| `npm run db:reset` | Reset database only |
| `npm run db:studio` | Open Prisma database GUI |

---

### Fresh Start (Reset Everything)
```bash
npm run start:fresh
```
This deletes the database and re-seeds with fresh data.

---

### Want to use Docker/PostgreSQL instead?

See [Docker Setup](#docker-setup-optional) below.

---

### Manual Setup (Alternative)

If you prefer step-by-step control:

```bash
# 1. Install dependencies
npm install

# 2. Setup database (local SQLite file - no Docker!)
npx prisma generate
npx prisma db push
npm run seed

# 3. Start app
npm run dev  # Development with hot-reload
```

Visit **http://localhost:3000** 🎉

---

## 🗄️ Database Options

### Option 1: SQLite (Default - Local File) ✅

**No installation needed!** Database is stored as `prisma/dev.db`

**Pros:**
- ✅ Zero configuration
- ✅ No Docker required
- ✅ Perfect for development
- ✅ Just works!

**Current Setup:** Already configured!

---

### Option 2: Docker/PostgreSQL (Optional)

For production-like setup or team collaboration:

1. **Install Docker Desktop**: https://www.docker.com/products/docker-desktop/

2. **Update Prisma schema** (`prisma/schema.prisma`):
```prisma
datasource db {
  provider = "postgresql"  // Change from sqlite
}
```

3. **Start Docker services:**
```bash
docker compose up -d
```

4. **Create `.env.local`:**
```env
DATABASE_URL="postgresql://subastapro:subastapro_dev_password@localhost:5432/subastapro"
```

5. **Run setup:**
```bash
npx prisma migrate dev --name init
npm run seed
```

See [SQLITE_SETUP.md](SQLITE_SETUP.md) for more details.

---

### Prerequisites

- **Node.js 20+** ✅
- **Docker Desktop** ⚠️ (only if using PostgreSQL)
- **Python 3.11+** (optional, for scraper)

---

### Setup Python Scraper (Optional)

See [scraper/README.md](scraper/README.md) for detailed instructions.

```bash
cd scraper

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Test manually
python main.py discovery
```

## 🎯 Key Features

### Tiered Access Control ("2-Newest Rule")

| Tier | Access |
|------|--------|
| **FREE** | ✅ Last 15 Finished auctions<br>✅ First 2 Active auctions (full)<br>🔒 Remaining Active (blurred)<br>🔒 All Pre-Auctions (blurred) |
| **GOLD** | ✅ All Active auctions<br>✅ All Finished<br>🔒 Pre-Auctions locked |
| **DIAMOND** | ✅ Everything (including TEJU Pre-Auctions) |

### API Endpoints

#### `GET /api/auctions`
Returns auctions with tiered field masking.

**Query Params:**
- `tier` - User tier (FREE, GOLD, DIAMOND)
- `province` - Filter by province (e.g., "Las Palmas")
- `category` - Filter by category

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "title": "Ático de lujo en Las Canteras",
      "currentBid": 450000,
      "appraisalValue": 680000,
      "status": "active",
      "isLocked": false,
      "address": "Calle León y Castillo, 123"
    }
  ],
  "count": 20
}
```

#### `GET /api/stats`
Returns auction counts per province for sidebar badges.

**Response:**
```json
{
  "success": true,
  "data": {
    "Las Palmas": {
      "active": 3,
      "preAuction": 2,
      "finished": 15,
      "total": 20
    }
  }
}
```

## 🤖 Python Scraper System

### Celery Task Schedule

| Task | Frequency | Purpose |
|------|-----------|---------|
| `discovery_sync` | Every 6 hours | Scrape BOE for new Las Palmas auctions |
| `pulse_check` | Every 30 minutes | Update `current_bid` for ACTIVE auctions |
| `urgent_pulse` | Every 15 minutes | Monitor auctions ending < 24h |
| `teju_scan` | Daily at 08:00 | Scan TEJU PDFs with OCR for pre-auctions |

### How It Works

1. **Discovery Mode** - Playwright scrapes BOE search results, extracts auction metadata
2. **Pulse Mode** - Visits detail pages of active auctions, updates bids
3. **TEJU OCR** - Downloads PDFs from TEJU, uses pytesseract to extract property addresses
4. **State Machine** - Marks auctions as FINISHED when end date passes

## 📊 Database Schema

```prisma
model Auction {
  id             String        @id @default(cuid())
  boeId          String        @unique
  title          String
  category       String
  province       String
  status         AuctionStatus // ACTIVE, FINISHED, TEJU
  appraisalValue Float
  currentBid     Float?
  publishedAt    DateTime
  endsAt         DateTime
  address        String?
  // ... coordinates, images, etc.
}

model User {
  id    String   @id
  email String   @unique
  tier  UserTier @default(FREE) // FREE, GOLD, DIAMOND
}
```

## 🎨 UI Components

### PremiumGuard
Blurs locked content and shows upgrade CTA based on user tier.

```tsx
<PremiumGuard userTier={userTier} auctionStatus="active" isLocked={item.isLocked}>
  <AuctionCard item={item} />
</PremiumGuard>
```

### Status Pills
- **Active** - Green with pulsing dot
- **Finished** - Solid gray
- **Pre-Auction** - Gold glow (TEJU exclusive)

### Urgency Factor
Auctions ending < 48h show red pulsing timer.

## 🔧 Development Commands

```bash
# Main Commands
npm start                # 🚀 Full setup + dev server (recommended)
npm run start:fresh      # Reset database + fresh start
npm run start:prod       # Full setup + production server
npm run dev              # Quick dev server (skips setup)

# Database
npm run db:reset         # Reset database only
npm run db:studio        # Open Prisma database GUI
npm run db:push          # Push schema changes
npm run seed             # Re-seed database

# Build
npm run build            # Production build
npm run lint             # Run ESLint

# Python Scraper (optional)
cd scraper
python main.py discovery # Run BOE scraper
celery -A tasks worker   # Start background worker
celery -A tasks beat     # Start scheduler
```

## 🌍 Spain Framework

SubastaPro covers all **50 provinces** across **17 Autonomous Communities**:

- Andalucía (8 provinces)
- Canarias (Las Palmas, Santa Cruz de Tenerife)
- Madrid, Cataluña, Galicia, etc.

**Official Categories:**
- Real Estate: Viviendas, Garajes, Locales, Terrenos, Fincas rústicas
- Movable: Turismos, Barcos, Joyas, Maquinaria

## 📝 Environment Variables

Create `.env.local`:

```env
DATABASE_URL="postgresql://subastapro:subastapro_dev_password@localhost:5432/subastapro"
REDIS_URL="redis://localhost:6379/0"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

## 🚢 Production Deployment

1. **Frontend**: Deploy to Vercel (connects to remote Postgres)
2. **Database**: Use Supabase or Neon for managed Postgres
3. **Scraper**: Deploy to VPS with cron jobs or use Celery on Heroku

## 📚 Resources

- [BOE Subastas](https://subastas.boe.es)
- [TEJU (Tablón Edictal Único)](https://www.administraciondejusticia.gob.es/paj/publico/citaciones/busqueda)
- [Prisma Docs](https://www.prisma.io/docs)
- [Celery Docs](https://docs.celeryq.dev)

---

Built with ❤️ for the Spanish real estate market.
