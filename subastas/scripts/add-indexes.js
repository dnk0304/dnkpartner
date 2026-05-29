/**
 * Script to add performance indexes to SQLite database
 * Run this once to optimize auction queries
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database', 'prod.db');
const db = new Database(dbPath);

console.log('🔧 Adding database indexes for performance...\n');

try {
  // Start transaction for atomic updates
  db.prepare('BEGIN').run();

  const indexes = [
    {
      name: 'idx_auction_status',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_status ON Auction(status)',
      description: 'Index on status for filtering active/finished auctions'
    },
    {
      name: 'idx_auction_published',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_published ON Auction(publishedAt DESC)',
      description: 'Index on publishedAt for sorting by date'
    },
    {
      name: 'idx_auction_province',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_province ON Auction(province)',
      description: 'Index on province for location filtering'
    },
    {
      name: 'idx_auction_category',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_category ON Auction(category)',
      description: 'Index on category for category filtering'
    },
    {
      name: 'idx_auction_status_published',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_status_published ON Auction(status, publishedAt DESC)',
      description: 'Composite index for status + date queries'
    },
    {
      name: 'idx_auction_province_status',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_province_status ON Auction(province, status)',
      description: 'Composite index for province + status queries'
    },
    {
      name: 'idx_auction_category_status',
      sql: 'CREATE INDEX IF NOT EXISTS idx_auction_category_status ON Auction(category, status)',
      description: 'Composite index for category + status queries'
    }
  ];

  indexes.forEach((index, i) => {
    console.log(`[${i + 1}/${indexes.length}] Creating ${index.name}...`);
    console.log(`    ${index.description}`);
    db.prepare(index.sql).run();
    console.log(`    ✓ Done\n`);
  });

  // Commit transaction
  db.prepare('COMMIT').run();

  console.log('✅ All indexes created successfully!\n');
  
  // Analyze the database for query optimization
  console.log('📊 Running ANALYZE to update query planner statistics...');
  db.prepare('ANALYZE').run();
  console.log('✓ Done\n');

  // Show index info
  console.log('📋 Current indexes on Auction table:');
  const indexList = db.prepare(`
    SELECT name, sql 
    FROM sqlite_master 
    WHERE type = 'index' 
      AND tbl_name = 'Auction' 
      AND sql IS NOT NULL
    ORDER BY name
  `).all();
  
  indexList.forEach(idx => {
    console.log(`  - ${idx.name}`);
  });
  
  console.log('\n🚀 Database optimized! Query performance should be significantly faster.');

} catch (error) {
  console.error('❌ Error creating indexes:', error);
  db.prepare('ROLLBACK').run();
  process.exit(1);
} finally {
  db.close();
}
