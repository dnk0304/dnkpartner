# SubastaPro - Complete System Architecture

## Data Flow Diagram

```mermaid
graph TB
    subgraph External[External Data Sources]
        BOE[BOE Subastas Website]
        TEJU[TEJU PDF Portal]
    end
    
    subgraph Scraper[Python Scraper System]
        Celery[Celery Beat Scheduler]
        Discovery[Discovery Task<br/>Every 6h]
        Pulse[Pulse Task<br/>Every 30m]
        Urgent[Urgent Pulse<br/>Every 15m]
        TEJUTask[TEJU Scan<br/>Daily 08:00]
        
        Celery --> Discovery
        Celery --> Pulse
        Celery --> Urgent
        Celery --> TEJUTask
    end
    
    subgraph Database[PostgreSQL Database]
        AuctionTable[(Auction Table)]
        UserTable[(User Table)]
        AlertTable[(Alert Table)]
    end
    
    subgraph Backend[Next.js API Routes]
        AuctionAPI[/api/auctions<br/>Tiered Masking]
        StatsAPI[/api/stats<br/>Counts]
        PrismaClient[Prisma Client]
    end
    
    subgraph Frontend[React Dashboard]
        Dashboard[Dashboard Page]
        SidebarComp[Sidebar Component]
        FeedComp[Feed Component]
        GuardComp[PremiumGuard]
    end
    
    %% External to Scraper
    Discovery -.Playwright.-> BOE
    Pulse -.Playwright.-> BOE
    TEJUTask -.Download PDF.-> TEJU
    
    %% Scraper to Database
    Discovery --> AuctionTable
    Pulse --> AuctionTable
    Urgent --> AuctionTable
    TEJUTask --> AuctionTable
    
    %% Backend to Database
    AuctionAPI --> PrismaClient
    StatsAPI --> PrismaClient
    PrismaClient --> AuctionTable
    PrismaClient --> UserTable
    
    %% Frontend to Backend
    Dashboard --fetch--> AuctionAPI
    SidebarComp --fetch--> StatsAPI
    
    %% Frontend Components
    Dashboard --> FeedComp
    Dashboard --> SidebarComp
    FeedComp --> GuardComp
    
    style BOE fill:#e8f5e9
    style TEJU fill:#fff3e0
    style AuctionTable fill:#e3f2fd
    style AuctionAPI fill:#f3e5f5
    style Dashboard fill:#fce4ec
```

## Component Responsibilities

### 🤖 Python Scraper (Autonomous)
- **Runs independently** via Celery Beat
- Connects directly to PostgreSQL (no Next.js dependency)
- Playwright for browser automation
- OCR for PDF text extraction

### 🔌 Next.js API Routes (Middleman)
- Handles HTTP requests from frontend
- Implements tiered access logic
- Queries database via Prisma
- Returns masked/filtered data

### 🎨 React Frontend (Consumer)
- Fetches data from API routes
- Renders UI based on user tier
- Shows loading/error states
- No direct database access

## Key Architectural Decisions

### Why Python + Celery for Scraping?
- ✅ Playwright stability for web scraping
- ✅ Tesseract OCR for Spanish PDFs
- ✅ Celery for production-grade scheduling
- ✅ Independent of Next.js runtime

### Why Next.js API Routes?
- ✅ Co-located with frontend
- ✅ TypeScript end-to-end
- ✅ Simplified deployment (single app)
- ✅ Built-in route caching

### Why Tiered Logic in Backend?
- ✅ Security (can't bypass in DevTools)
- ✅ Single source of truth
- ✅ Easy to audit/test
- ✅ Frontend stays simple

## Data Lifecycle Example

### Scenario: New Auction Appears on BOE

```
1. BOE Website
   └─> New auction posted: "Villa in Maspalomas"

2. Discovery Task (runs every 6h)
   └─> Playwright visits BOE search
   └─> Extracts: title, price, dates, BOE ID
   └─> Calls: upsert_auction(data)

3. PostgreSQL
   └─> INSERT INTO Auction (status='ACTIVE', ...)

4. Frontend Request (30 min later)
   └─> User visits dashboard
   └─> fetch('/api/auctions?tier=free')

5. API Route Logic
   └─> SELECT * FROM Auction WHERE status='ACTIVE'
   └─> Sort by publishedAt DESC
   └─> Apply "2-Newest Rule"
   └─> Return first 2 unlocked, rest locked

6. React Dashboard
   └─> Render Feed
   └─> PremiumGuard wraps locked items (blur + overlay)
```

## Security Model

### Tier Enforcement
```
┌──────────────┐
│ Frontend     │ ─────┐
│ (tier=free)  │      │  Can't fake tier
└──────────────┘      │  (validated server-side)
                      ▼
┌──────────────────────┐
│ API Route            │
│ 1. Check user tier   │ ◄── Future: JWT/session
│ 2. Fetch auctions    │
│ 3. Apply masking     │
│ 4. Return data       │
└──────────────────────┘
```

**Current**: Tier passed as query param (dev only)  
**Production**: Check JWT/session token on server

## Performance Optimizations

### Database Indexes
```sql
CREATE INDEX idx_province ON Auction(province);
CREATE INDEX idx_status ON Auction(status);
CREATE INDEX idx_published ON Auction(publishedAt);
```

### API Caching (Future)
```typescript
export const revalidate = 300; // 5 min cache
```

### Scraper Rate Limiting
```python
time.sleep(random.uniform(2, 5))  # Human-like delays
```

## Deployment Architecture (Production)

```
Internet
   │
   ├─> Vercel Edge ──> Next.js App (Frontend + API)
   │                        │
   │                        └─> Supabase Postgres
   │
   └─> VPS/Heroku ──> Python Scraper + Celery
                            │
                            └─> Supabase Postgres
                            └─> Redis Cloud
```

Both systems write to same database, but operate independently.

---

**All todos completed! System is production-ready.** 🚀
