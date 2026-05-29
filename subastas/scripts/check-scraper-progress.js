const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database', 'prod.db');
const db = new Database(dbPath);

console.log('\n=== Scraper Progress Check ===\n');

// Check recently updated auctions
const recentUpdates = db.prepare(`
  SELECT id, boeId, province, municipality, status, updatedAt
  FROM Auction
  WHERE updatedAt > datetime('now', '-2 hours')
    AND province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio')
  ORDER BY updatedAt DESC
  LIMIT 20
`).all();

console.log(`Recently Updated Auctions (last 2 hours): ${recentUpdates.length}`);
console.log('\nSample of recent updates:');
recentUpdates.slice(0, 10).forEach(auction => {
  console.log(`  ${auction.boeId}`);
  console.log(`    Province: ${auction.province}`);
  console.log(`    Municipality: ${auction.municipality || 'N/A'}`);
  console.log(`    Status: ${auction.status}`);
  console.log(`    Updated: ${auction.updatedAt}`);
  console.log('');
});

// Check valid auctions with good provinces
const validCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM Auction
  WHERE province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
`).get();

const activeValidCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM Auction
  WHERE status IN ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'PRE_AUCTION', 'SUSPENDIDA', 'SUSPENDED')
    AND province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
`).get();

console.log('=== Overall Statistics ===');
console.log(`Total auctions with valid provinces: ${validCount.count}`);
console.log(`Active/Pre-Auction with valid provinces: ${activeValidCount.count}`);

// Check province distribution
const provinceBreakdown = db.prepare(`
  SELECT province, COUNT(*) as count
  FROM Auction
  WHERE status IN ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'PRE_AUCTION')
    AND province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
  GROUP BY province
  ORDER BY count DESC
  LIMIT 15
`).all();

console.log('\n=== Top 15 Provinces (Active/Pre-Auction) ===');
provinceBreakdown.forEach(row => {
  console.log(`  ${row.province}: ${row.count} auctions`);
});

// Check auctions still needing updates
const needingUpdate = db.prepare(`
  SELECT COUNT(*) as count
  FROM Auction
  WHERE (
    province IS NULL 
    OR LOWER(province) IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    OR LENGTH(TRIM(province)) <= 1
  )
`).get();

console.log(`\n⏳ Auctions still needing province updates: ${needingUpdate.count}`);

db.close();
