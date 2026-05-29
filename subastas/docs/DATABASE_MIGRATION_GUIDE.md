# Database Migration & Data Persistence Guide

## Overview

This guide explains how to migrate your database to the new persistent data directory and ensure your data is never lost during updates, deployments, or server restarts.

## What Changed?

### Before
- Database location: `prisma/dev.db`
- Backups location: `data/backups/`
- Risk: Database could be lost during code updates

### After
- Database location: `data/database/prod.db`
- Backups location: `data/database/backups/`
- Benefit: Data persists independently of code changes

## Automatic Migration

The system will automatically migrate your existing database when you run the setup script.

### Step 1: Run Setup Script

```bash
node scripts/setup-data-dir.js
```

This will:
- Create the `data/database/` directory structure
- Copy existing database from `prisma/dev.db` to `data/database/prod.db`
- Preserve all data, users, and auctions
- Display migration status

### Step 2: Update Environment Variables

Update your `.env` file:

```env
# OLD (deprecated)
DATABASE_URL="file:./prisma/dev.db"

# NEW (persistent)
DATABASE_URL="file:./data/database/prod.db"
```

### Step 3: Push Schema Changes

```bash
npx prisma db push
```

This applies the password reset token schema fix.

### Step 4: Restart the Server

```bash
npm run dev
```

## Manual Migration (If Needed)

If automatic migration fails, you can manually migrate:

### Windows (PowerShell)
```powershell
# Create directories
New-Item -ItemType Directory -Force -Path "data\database\backups"

# Copy database
Copy-Item "prisma\dev.db" "data\database\prod.db"

# Update .env
(Get-Content .env) -replace 'file:./prisma/dev.db', 'file:./data/database/prod.db' | Set-Content .env
```

### Linux/Mac (Bash)
```bash
# Create directories
mkdir -p data/database/backups

# Copy database
cp prisma/dev.db data/database/prod.db

# Update .env
sed -i 's|file:./prisma/dev.db|file:./data/database/prod.db|g' .env
```

## Backup Strategy

### Automatic Backups

The system now backs up to the persistent directory:

```bash
npm run db:backup
```

Backup location: `data/database/backups/backup-YYYY-MM-DDTHH-MM-SS.db`

### Backup Retention
- Keeps last 30 backups automatically
- Older backups are automatically deleted
- Each backup includes timestamp

### Manual Backup

```bash
# Create timestamped backup
node scripts/backup-db.js

# Or simple copy
cp data/database/prod.db data/database/backups/manual-backup.db
```

## Recovery from Backup

### Step 1: Stop the Server
```bash
# Press Ctrl+C in terminal where server is running
# Or kill the process
Stop-Process -Name node -Force  # Windows PowerShell
```

### Step 2: List Available Backups
```bash
# Windows
dir data\database\backups\

# Linux/Mac
ls -lh data/database/backups/
```

### Step 3: Restore from Backup
```bash
# Windows
Copy-Item "data\database\backups\backup-2026-01-20T14-30-00.db" "data\database\prod.db" -Force

# Linux/Mac
cp data/database/backups/backup-2026-01-20T14-30-00.db data/database/prod.db
```

### Step 4: Restart the Server
```bash
npm run dev
```

## Data Persistence Benefits

### ✅ Survives Code Updates
- Pull latest code with `git pull`
- Data remains intact in `data/` directory
- No risk of overwriting database

### ✅ Survives Server Restarts
- Restart server anytime
- Data persists on disk
- Users and auctions preserved

### ✅ Survives npm install
- Install/update dependencies safely
- Database not affected by node_modules changes

### ✅ Easy Backups
- Automated backup system
- 30-day retention
- Simple recovery process

### ✅ Development Safety
- Test changes without risk
- Easy rollback to previous state
- Separate data from code

## Directory Structure

```
dnksubastas/
├── data/                           # ← Persistent data (NEVER delete!)
│   ├── README.md                   # Documentation
│   └── database/
│       ├── prod.db                 # ← Main database file
│       ├── prod.db-journal         # SQLite journal
│       ├── prod.db-wal            # Write-ahead log
│       ├── prod.db-shm            # Shared memory
│       └── backups/
│           ├── backup-2026-01-20T10-00-00.db
│           ├── backup-2026-01-20T11-00-00.db
│           └── ...                # Last 30 backups
├── prisma/
│   ├── schema.prisma
│   └── dev.db                     # ← Old location (deprecated)
└── ...
```

## Troubleshooting

### Database Not Found Error

**Error**: `Error: PrismaClient failed to initialize`

**Solution**:
```bash
# Run setup script
node scripts/setup-data-dir.js

# Push schema
npx prisma db push
```

### Permission Denied Error

**Error**: `EACCES: permission denied`

**Solution (Linux/Mac)**:
```bash
chmod -R 755 data/
```

**Solution (Windows)**:
```powershell
icacls data /grant Everyone:F /t
```

### Schema Out of Sync

**Error**: `Prisma schema is out of sync with database`

**Solution**:
```bash
npx prisma db push
```

### Lost Database After Update

**Recovery**:
1. Check if `data/database/backups/` has recent backups
2. Find latest backup file
3. Copy to `data/database/prod.db`
4. Restart server

## Testing the Migration

### Step 1: Check Current User Count
```bash
# Before migration
node -e "const {prisma} = require('./src/lib/prisma'); prisma.user.count().then(console.log).finally(() => prisma.$disconnect())"
```

### Step 2: Run Migration
```bash
node scripts/setup-data-dir.js
```

### Step 3: Update .env
```bash
# Update DATABASE_URL to point to new location
```

### Step 4: Verify User Count
```bash
# After migration (should be same number)
node -e "const {prisma} = require('./src/lib/prisma'); prisma.user.count().then(console.log).finally(() => prisma.$disconnect())"
```

### Step 5: Test Backup
```bash
npm run db:backup
```

## Best Practices

### ✅ DO
- Run `npm run db:backup` before major changes
- Keep `data/` directory in `.gitignore`
- Set up automated daily backups
- Test recovery process periodically
- Monitor disk space for backups

### ❌ DON'T
- Delete `data/` directory
- Commit database files to git
- Store sensitive data unencrypted
- Skip backups before schema migrations
- Edit database files directly

## External Backup (Recommended)

For production, also backup to external storage:

### Cloud Sync (Windows)
```powershell
# OneDrive
Copy-Item data\database\prod.db $env:OneDrive\Backups\dnksubastas\

# Google Drive
Copy-Item data\database\prod.db "C:\Users\$env:USERNAME\Google Drive\Backups\dnksubastas\"
```

### Cloud Sync (Linux/Mac)
```bash
# Dropbox
cp data/database/prod.db ~/Dropbox/Backups/dnksubastas/

# AWS S3
aws s3 cp data/database/prod.db s3://my-backup-bucket/dnksubastas/
```

## Automated Daily Backups

### Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
5. Program: `node`
6. Arguments: `scripts/backup-db.js`
7. Start in: `C:\Users\D\Desktop\dnksubastas`

### Linux/Mac Cron
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/dnksubastas && node scripts/backup-db.js
```

## Migration Checklist

- [ ] Run `node scripts/setup-data-dir.js`
- [ ] Update `.env` with new DATABASE_URL
- [ ] Run `npx prisma db push`
- [ ] Restart development server
- [ ] Test login functionality
- [ ] Test auction viewing
- [ ] Test profile editing
- [ ] Test password reset
- [ ] Create manual backup: `npm run db:backup`
- [ ] Verify backup exists in `data/database/backups/`
- [ ] Test backup recovery process
- [ ] Set up automated daily backups
- [ ] Document backup location for team

## Support

If you encounter issues during migration:

1. **Check the logs**: Server output will show database connection errors
2. **Verify file paths**: Ensure `DATABASE_URL` in `.env` is correct
3. **Check permissions**: Ensure `data/` directory is writable
4. **Review backups**: List files in `data/database/backups/`
5. **Test connection**: Run `npx prisma studio` to verify database access

---

**Last Updated**: 2026-01-20
**Migration Version**: 1.0.0
**Status**: ✅ Tested and Production Ready
