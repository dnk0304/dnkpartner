# 🗄️ Local SQLite Database (No Docker Needed!)

## ✅ Setup Complete

SubastaPro now uses **SQLite** - a local file-based database that requires **zero configuration**!

- **No Docker needed**
- **No installation needed**
- **Just works!™**

---

## 📁 Database File Location

Your database is stored in:
```
prisma/dev.db
```

This is a single file that contains all your auction data.

---

## 🚀 Quick Start (Now Even Easier!)

Just run:
```bash
npm run startup
```

**Output:**
```
🚀 SubastaPro - Master Startup Script
============================================================

📁 Using SQLite (local file database) - No Docker needed!
   Database file: prisma/dev.db

Step 1: Setting up database...
✓ Creating database schema - Done!
✓ Seeding database with Las Palmas data - Done!

Step 2: Generating Prisma Client...
✓ Generating Prisma Client - Done!

Step 3: Building application...
✓ Building production bundle - Done!

✅ Setup Complete! Starting application...
🌐 Opening: http://localhost:3000
📁 Database: prisma/dev.db (local file)
```

**That's it!** No Docker, no containers, no complex setup.

---

## 🔍 View Your Data

### Option 1: Prisma Studio (GUI)
```bash
npx prisma studio
```
Opens at http://localhost:5555

### Option 2: SQLite Browser
Download **DB Browser for SQLite**: https://sqlitebrowser.org/
Open `prisma/dev.db`

### Option 3: VS Code Extension
Install "SQLite Viewer" extension
Right-click `dev.db` → "Open Database"

---

## 🔄 Database Management

### Reset Database
```bash
npx prisma migrate reset
```
Deletes `dev.db` and recreates it fresh

### Backup Database
```bash
# Just copy the file!
cp prisma/dev.db prisma/dev.db.backup
```

### Restore Database
```bash
cp prisma/dev.db.backup prisma/dev.db
```

---

## 🆚 SQLite vs PostgreSQL

### SQLite (Current - Local File) ✅
**Pros:**
- ✅ Zero configuration
- ✅ No Docker needed
- ✅ Perfect for development
- ✅ Single file (easy to backup)
- ✅ Fast for small datasets
- ✅ No network overhead

**Cons:**
- ⚠️ Single user (no concurrent writes)
- ⚠️ Not ideal for production at scale
- ⚠️ No network access

**Best for:** Development, prototypes, small apps

---

### PostgreSQL (Optional - Docker)
**Pros:**
- ✅ Multi-user support
- ✅ Better for production
- ✅ Network accessible
- ✅ More features (JSON, Full-text search)
- ✅ Better concurrency

**Cons:**
- ❌ Requires Docker
- ❌ More complex setup
- ❌ Network latency

**Best for:** Production, team collaboration, scaling

---

## 🔄 Switch to PostgreSQL Later?

If you want to use Docker/PostgreSQL later:

### 1. Update schema
Edit `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"  // Change from sqlite
}
```

### 2. Start Docker
```bash
docker compose up -d
```

### 3. Update connection
Create `.env.local`:
```env
DATABASE_URL="postgresql://subastapro:subastapro_dev_password@localhost:5432/subastapro"
```

### 4. Re-run setup
```bash
npx prisma migrate dev --name init
npm run seed
```

---

## 🎯 Current Setup Summary

```
✓ Database: SQLite (local file)
✓ Location: prisma/dev.db
✓ Size: ~50KB with seed data
✓ Records: 20 auctions from Las Palmas
✓ Docker: Not needed!
```

---

## 🎉 Benefits for You

1. **Instant Start** - No Docker installation or setup
2. **Portable** - Copy `dev.db` to share with others
3. **Simple** - Just a file, easy to understand
4. **Fast** - No network overhead
5. **Free** - No cloud database needed

---

## 📝 Common Tasks

### See All Tables
```bash
npx prisma studio
```

### Run Raw SQL
```bash
sqlite3 prisma/dev.db
sqlite> SELECT COUNT(*) FROM Auction;
sqlite> SELECT * FROM Auction WHERE status = 'ACTIVE';
sqlite> .quit
```

### Check Database Size
```bash
# Windows PowerShell
(Get-Item prisma/dev.db).length / 1KB

# Mac/Linux
du -h prisma/dev.db
```

### Export Data
```bash
sqlite3 prisma/dev.db .dump > backup.sql
```

### Import Data
```bash
sqlite3 prisma/dev.db < backup.sql
```

---

## ✨ You're All Set!

Your database is now a simple file in your project. No servers, no Docker, no complexity.

Just run:
```bash
npm run startup
```

And start coding! 🚀
