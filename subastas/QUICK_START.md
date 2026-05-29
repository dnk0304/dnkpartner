# 🚀 SubastaPro - Quick Start Guide

## One-Command Startup

### For Windows (PowerShell/CMD):
```bash
npm run startup
```

### For Mac/Linux (Bash):
```bash
npm run startup:sh
```

### For Development Mode (with hot-reload):
```bash
# Windows
npm run startup:dev

# Mac/Linux
npm run startup:sh:dev
```

---

## What the Startup Script Does

The master startup command automatically:

1. ✅ **Checks Docker** - Verifies Docker Desktop is running
2. ✅ **Starts Services** - Launches Postgres + Redis containers
3. ✅ **Sets Up Database** - Runs migrations (first time only)
4. ✅ **Seeds Data** - Adds 20 Las Palmas auctions (first time only)
5. ✅ **Generates Client** - Creates Prisma client
6. ✅ **Builds App** - Compiles production bundle (production mode)
7. ✅ **Starts Server** - Launches at http://localhost:3000

---

## Command Options

### Production Mode (Default)
```bash
npm run startup
```
- Builds optimized bundle
- Runs `npm start`
- Best for: Production deployment

### Development Mode
```bash
npm run startup:dev
```
- Skips build step
- Runs `npm run dev`
- Hot-reload enabled
- Best for: Local development

---

## First Time Setup

The script is **idempotent** - safe to run multiple times:
- First run: Does full setup
- Subsequent runs: Skips completed steps

### Manual Reset (if needed):
```bash
# Reset database
npx prisma migrate reset

# Restart from scratch
docker compose down -v
npm run startup
```

---

## Troubleshooting

### "Docker is not running"
**Solution:** Start Docker Desktop, then retry:
```bash
npm run startup
```

### "Port 5432 already in use"
**Solution:** Stop conflicting services:
```bash
docker compose down
npm run startup
```

### Database connection errors
**Solution:** Wait for containers to fully start:
```bash
docker compose restart
sleep 10
npm run startup
```

---

## Quick Commands Reference

```bash
# Start everything (production)
npm run startup

# Start everything (development)
npm run startup:dev

# Just the Next.js app
npm run dev          # Development
npm start            # Production

# Database management
npx prisma studio    # Open database GUI
npx prisma migrate reset  # Reset database
npm run seed         # Re-seed data

# Docker services
docker compose up -d     # Start
docker compose down      # Stop
docker compose restart   # Restart
docker compose logs -f   # View logs
```

---

## Verify Everything Works

After running `npm run startup`, check:

1. **Dashboard**: http://localhost:3000
   - Should show 20 auctions
   - Tier switcher works
   - Sidebar shows "3 / 20"

2. **API**: http://localhost:3000/api/auctions?tier=free
   - Returns JSON data

3. **Database**: Run `npx prisma studio`
   - Opens at http://localhost:5555
   - Shows 20 auction records

---

## Success! 🎉

Your SubastaPro platform is now running at:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3000/api/auctions
- **Database GUI**: http://localhost:5555 (run `npx prisma studio`)

For more details, see:
- [README.md](README.md) - Full documentation
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Production deployment
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
