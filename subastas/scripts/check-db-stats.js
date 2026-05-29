const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database', 'prod.db');
const db = new Database(dbPath);

console.log('\n=== Database Statistics ===\n');

// Total count
const total = db.prepare('SELECT COUNT(*) as count FROM Auction').get();
console.log(`Total Auctions: ${total.count}`);

// By status
console.log('\n--- By Status ---');
const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM Auction GROUP BY status ORDER BY count DESC').all();
byStatus.forEach(row => {
  console.log(`${row.status}: ${row.count}`);
});

// By auction type
console.log('\n--- By Auction Type ---');
const byType = db.prepare('SELECT auctionType, COUNT(*) as count FROM Auction GROUP BY auctionType ORDER BY count DESC').all();
byType.forEach(row => {
  console.log(`${row.auctionType || 'NULL'}: ${row.count}`);
});

// Active auctions by province
console.log('\n--- Active Auctions by Province (Top 10) ---');
const activeByProvince = db.prepare(`
  SELECT province, COUNT(*) as count 
  FROM Auction 
  WHERE status IN ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'PRE_AUCTION')
  GROUP BY province 
  ORDER BY count DESC 
  LIMIT 10
`).all();
activeByProvince.forEach(row => {
  console.log(`${row.province}: ${row.count}`);
});

// Check for coordinates
console.log('\n--- Coordinates Status ---');
const withCoords = db.prepare('SELECT COUNT(*) as count FROM Auction WHERE latitude IS NOT NULL AND longitude IS NOT NULL').get();
const withoutCoords = db.prepare('SELECT COUNT(*) as count FROM Auction WHERE latitude IS NULL OR longitude IS NULL').get();
console.log(`With coordinates: ${withCoords.count}`);
console.log(`Without coordinates: ${withoutCoords.count}`);

// Recent auctions
console.log('\n--- Recent Auctions (last 7 days) ---');
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const recent = db.prepare('SELECT COUNT(*) as count FROM Auction WHERE createdAt >= ?').get(sevenDaysAgo);
console.log(`Created in last 7 days: ${recent.count}`);

db.close();
