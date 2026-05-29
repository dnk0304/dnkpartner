const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database', 'prod.db');
const db = new Database(dbPath);

console.log('\n=== Cleaning up invalid auction data ===\n');

// Get count before cleanup
const beforeTotal = db.prepare('SELECT COUNT(*) as count FROM Auction').get();
console.log(`Total auctions before cleanup: ${beforeTotal.count}`);

const invalidProvinces = db.prepare(`
  SELECT COUNT(*) as count FROM Auction 
  WHERE province IS NULL 
    OR LOWER(province) IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    OR LENGTH(TRIM(province)) <= 1
`).get();
console.log(`Auctions with invalid provinces: ${invalidProvinces.count}`);

// Option 1: Delete invalid records (commented out for safety)
// const deleteResult = db.prepare(`
//   DELETE FROM Auction 
//   WHERE province IS NULL 
//     OR LOWER(province) IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
//     OR LENGTH(TRIM(province)) <= 1
// `).run();
// console.log(`\nDeleted ${deleteResult.changes} invalid auction records`);

// Option 2: Set invalid provinces to NULL so they're filtered out (safer)
const updateResult = db.prepare(`
  UPDATE Auction 
  SET province = NULL
  WHERE province IS NOT NULL
    AND (
      LOWER(province) IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
      OR LENGTH(TRIM(province)) <= 1
    )
`).run();
console.log(`\nUpdated ${updateResult.changes} auction records (set province to NULL)`);

// Statistics after cleanup
const stats = db.prepare(`
  SELECT 
    status,
    COUNT(*) as count,
    SUM(CASE WHEN province IS NOT NULL THEN 1 ELSE 0 END) as with_province,
    SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) as with_coords
  FROM Auction
  GROUP BY status
  ORDER BY count DESC
`).all();

console.log('\n--- Statistics After Cleanup ---');
stats.forEach(row => {
  console.log(`${row.status}: ${row.count} total, ${row.with_province} with valid province, ${row.with_coords} with coords`);
});

const validActive = db.prepare(`
  SELECT COUNT(*) as count FROM Auction
  WHERE status IN ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'PRE_AUCTION')
    AND province IS NOT NULL
    AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
    AND LENGTH(TRIM(province)) > 1
`).get();

console.log(`\n✅ Valid active/pre-auction auctions: ${validActive.count}`);

db.close();
console.log('\nCleanup complete!');
