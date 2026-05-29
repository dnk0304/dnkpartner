const fs = require('fs');
const path = require('path');

// Create data directory structure
const dataDir = path.join(__dirname, '..', 'data');
const databaseDir = path.join(dataDir, 'database');
const backupsDir = path.join(databaseDir, 'backups');

console.log('📁 Creating persistent data directories...\n');

// Create directories
[dataDir, databaseDir, backupsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created: ${dir}`);
  } else {
    console.log(`✓ Exists: ${dir}`);
  }
});

// Check if old database exists and needs migration
const oldDbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
const newDbPath = path.join(databaseDir, 'prod.db');

if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
  console.log('\n📦 Migrating existing database...');
  fs.copyFileSync(oldDbPath, newDbPath);
  console.log(`✅ Database migrated from ${oldDbPath} to ${newDbPath}`);
  
  // Also copy the journal files if they exist
  const oldJournalPath = oldDbPath + '-journal';
  const newJournalPath = newDbPath + '-journal';
  if (fs.existsSync(oldJournalPath)) {
    fs.copyFileSync(oldJournalPath, newJournalPath);
    console.log(`✅ Journal file migrated`);
  }
  
  const oldWalPath = oldDbPath + '-wal';
  const newWalPath = newDbPath + '-wal';
  if (fs.existsSync(oldWalPath)) {
    fs.copyFileSync(oldWalPath, newWalPath);
    console.log(`✅ WAL file migrated`);
  }
  
  const oldShmPath = oldDbPath + '-shm';
  const newShmPath = newDbPath + '-shm';
  if (fs.existsSync(oldShmPath)) {
    fs.copyFileSync(oldShmPath, newShmPath);
    console.log(`✅ SHM file migrated`);
  }
}

console.log('\n✅ Data directory setup complete!\n');
console.log('📍 Database location: ' + newDbPath);
console.log('📍 Backups location: ' + backupsDir);
console.log('\n💡 Remember to update your .env file with:');
console.log('   DATABASE_URL="file:../data/database/prod.db"\n');
