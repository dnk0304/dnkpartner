# Data Persistence Directory

This directory stores all persistent application data that should NEVER be lost during updates, deployments, or server restarts.

## Contents

### `/database`
- Production database files (SQLite)
- Database backups (timestamped)
- Migration history

### `/uploads` (future)
- User uploaded files
- Auction images
- Documents

### `/logs` (future)
- Application logs
- Error logs
- Audit logs

## Backup Strategy

### Automatic Backups
- Daily automated backups at 2 AM
- Retention: 30 days
- Location: `/data/database/backups/`

### Manual Backups
```bash
npm run db:backup
```

## Migration Guide

### Moving Existing Database
1. Stop the application server
2. Copy `prisma/dev.db` to `data/database/prod.db`
3. Update `.env` to point to new location
4. Restart the application

### Recovery from Backup
1. Stop the application
2. Copy backup file from `data/database/backups/`
3. Rename to `prod.db`
4. Restart the application

## Security

- This directory is excluded from git (`.gitignore`)
- Ensure proper file permissions (read/write for application only)
- Regular backups to external storage recommended
- Consider encryption for sensitive data

## DO NOT DELETE

⚠️ **WARNING**: Deleting this directory will result in permanent data loss!

Always backup before:
- Major updates
- Schema migrations
- Server migrations
- Testing dangerous operations
