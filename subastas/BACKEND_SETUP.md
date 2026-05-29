# SubastaPro Backend Setup

## Prerequisites

1. **Docker Desktop** - Install from https://www.docker.com/products/docker-desktop/
2. **Node.js 20+** - Already installed
3. **Python 3.11+** - Required for scraper module

## Quick Start

### 1. Start Docker Services

```bash
# Start Postgres & Redis
docker compose up -d

# Verify containers are running
docker compose ps
```

### 2. Setup Database

```bash
# Copy environment file
cp .env.example .env.local

# Run Prisma migrations
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate
```

### 3. Seed Database

```bash
# Populate with Las Palmas mock data
npm run seed
```

### 4. Start Next.js

```bash
npm run dev
```

### 5. Setup Python Scraper (Optional)

```bash
cd scraper

# Create virtual environment
python -m venv venv

# Windows
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install

# Start Celery worker
celery -A tasks worker --loglevel=info

# Start Celery beat (scheduler)
celery -A tasks beat --loglevel=info
```

## Environment Variables

Create a `.env.local` file:

```env
DATABASE_URL="postgresql://subastapro:subastapro_dev_password@localhost:5432/subastapro"
REDIS_URL="redis://localhost:6379/0"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

## API Endpoints

- `GET /api/auctions?province=Las%20Palmas&tier=FREE` - Get auctions with tier filtering
- `GET /api/stats` - Get auction counts per province

## Database Management

```bash
# Open Prisma Studio (GUI)
npx prisma studio

# Reset database
npx prisma migrate reset

# Create new migration
npx prisma migrate dev --name your_migration_name
```
