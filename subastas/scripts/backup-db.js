#!/usr/bin/env node

/**
 * Database Backup Script
 * Creates a timestamped backup of the SQLite database from persistent data directory
 */

const fs = require('fs');
const path = require('path');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const sourceDb = path.join(__dirname, '..', 'data', 'database', 'prod.db');
const backupDir = path.join(__dirname, '..', 'data', 'database', 'backups');
const backupFile = path.join(backupDir, `backup-${timestamp}.db`);

console.log('🔄 Starting database backup...\n');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log('✅ Created backup directory');
}

// Check if source database exists
if (fs.existsSync(sourceDb)) {
  // Get file size for info
  const stats = fs.statSync(sourceDb);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`📦 Source: ${sourceDb}`);
  console.log(`📊 Size: ${fileSizeMB} MB`);
  console.log(`📍 Destination: ${backupFile}\n`);
  
  // Copy database file
  fs.copyFileSync(sourceDb, backupFile);
  console.log('✅ Database backed up successfully!\n');
  
  // Keep only last 30 backups (daily backups for a month)
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
    .sort()
    .reverse();
  
  console.log(`📚 Total backups: ${backups.length}`);
  
  if (backups.length > 30) {
    console.log(`🧹 Cleaning up old backups (keeping last 30)...`);
    backups.slice(30).forEach(oldBackup => {
      fs.unlinkSync(path.join(backupDir, oldBackup));
      console.log(`   ✓ Removed: ${oldBackup}`);
    });
  }
  
  console.log('\n✅ Backup complete!');
} else {
  console.log('⚠️  No database file found at:', sourceDb);
  console.log('💡 Run setup-data-dir.js first to initialize the data directory');
  process.exit(1);
}
