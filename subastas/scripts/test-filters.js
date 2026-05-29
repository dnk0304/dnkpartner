const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database', 'prod.db');
const db = new Database(dbPath);

console.log('\n=== Testing Data Quality Filters ===\n');

// Query WITH filters (what the API will show now)
const withFilters = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM Auction
  WHERE province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
  GROUP BY status
  ORDER BY count DESC
`).all();

console.log('--- With Filters (API will show) ---');
let totalWithFilters = 0;
withFilters.forEach(row => {
  console.log(`${row.status}: ${row.count}`);
  totalWithFilters += row.count;
});
console.log(`Total: ${totalWithFilters}`);

// Active/Pre-Auction counts with filters
const activeCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM Auction
  WHERE status IN ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'PRE_AUCTION', 'SUSPENDIDA', 'SUSPENDED')
    AND province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
`).get();

console.log(`\n✅ Valid Active/Pre-Auction Count: ${activeCount.count}`);

// Province breakdown
const topProvinces = db.prepare(`
  SELECT province, COUNT(*) as count
  FROM Auction
  WHERE status IN ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'PRE_AUCTION')
    AND province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
  GROUP BY province
  ORDER BY count DESC
  LIMIT 10
`).all();

console.log('\n--- Top 10 Provinces (Active/Pre-Auction) ---');
topProvinces.forEach(row => {
  console.log(`${row.province}: ${row.count}`);
});

db.close();
