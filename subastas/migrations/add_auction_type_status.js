// Migration: Add auctionType column and update status values
// Date: 2026-01-29

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'database', 'prod.db');

console.log('Running migration: add_auction_type_status');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

try {
  db.exec('BEGIN TRANSACTION');

  // Check if auctionType column exists
  const tableInfo = db.prepare("PRAGMA table_info(Auction)").all();
  const hasAuctionType = tableInfo.some(col => col.name === 'auctionType');

  if (!hasAuctionType) {
    console.log('Adding auctionType column...');
    db.exec("ALTER TABLE Auction ADD COLUMN auctionType TEXT DEFAULT 'JUDICIAL'");
    console.log('✓ auctionType column added');
  } else {
    console.log('✓ auctionType column already exists');
  }

  // Check if index exists
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_auction_type'").all();
  if (indexes.length === 0) {
    console.log('Creating index on auctionType...');
    db.exec("CREATE INDEX idx_auction_type ON Auction(auctionType)");
    console.log('✓ Index created');
  } else {
    console.log('✓ Index already exists');
  }

  // Count current status values
  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM Auction 
    GROUP BY status
  `).all();
  
  console.log('\nCurrent status distribution:');
  statusCounts.forEach(row => {
    console.log(`  ${row.status}: ${row.count}`);
  });

  // Migrate ACTIVE -> CELEBRANDOSE
  const activeCount = db.prepare("SELECT COUNT(*) as count FROM Auction WHERE status = 'ACTIVE'").get();
  if (activeCount.count > 0) {
    console.log(`\nMigrating ${activeCount.count} ACTIVE -> CELEBRANDOSE...`);
    db.exec("UPDATE Auction SET status = 'CELEBRANDOSE' WHERE status = 'ACTIVE'");
    console.log('✓ Done');
  }

  // Migrate PRE_AUCTION -> PROXIMA_APERTURA
  const preAuctionCount = db.prepare("SELECT COUNT(*) as count FROM Auction WHERE status = 'PRE_AUCTION'").get();
  if (preAuctionCount.count > 0) {
    console.log(`Migrating ${preAuctionCount.count} PRE_AUCTION -> PROXIMA_APERTURA...`);
    db.exec("UPDATE Auction SET status = 'PROXIMA_APERTURA' WHERE status = 'PRE_AUCTION'");
    console.log('✓ Done');
  }

  // Migrate FINISHED -> CONCLUIDA_PORTAL
  const finishedCount = db.prepare("SELECT COUNT(*) as count FROM Auction WHERE status = 'FINISHED'").get();
  if (finishedCount.count > 0) {
    console.log(`Migrating ${finishedCount.count} FINISHED -> CONCLUIDA_PORTAL...`);
    db.exec("UPDATE Auction SET status = 'CONCLUIDA_PORTAL' WHERE status = 'FINISHED'");
    console.log('✓ Done');
  }

  // Migrate SUSPENDED -> SUSPENDIDA
  const suspendedCount = db.prepare("SELECT COUNT(*) as count FROM Auction WHERE status = 'SUSPENDED'").get();
  if (suspendedCount.count > 0) {
    console.log(`Migrating ${suspendedCount.count} SUSPENDED -> SUSPENDIDA...`);
    db.exec("UPDATE Auction SET status = 'SUSPENDIDA' WHERE status = 'SUSPENDED'");
    console.log('✓ Done');
  }

  // Migrate CANCELLED -> CANCELADA
  const cancelledCount = db.prepare("SELECT COUNT(*) as count FROM Auction WHERE status = 'CANCELLED'").get();
  if (cancelledCount.count > 0) {
    console.log(`Migrating ${cancelledCount.count} CANCELLED -> CANCELADA...`);
    db.exec("UPDATE Auction SET status = 'CANCELADA' WHERE status = 'CANCELLED'");
    console.log('✓ Done');
  }

  db.exec('COMMIT');

  // Show final status distribution
  const finalStatusCounts = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM Auction 
    GROUP BY status
  `).all();
  
  console.log('\nFinal status distribution:');
  finalStatusCounts.forEach(row => {
    console.log(`  ${row.status}: ${row.count}`);
  });

  console.log('\n✅ Migration completed successfully!');

} catch (error) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
