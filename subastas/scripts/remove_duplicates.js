const Database = require('better-sqlite3');
const db = new Database('data/database/prod.db');

console.log('Checking for and removing duplicate auctions...\n');

// Find duplicates by title and boeId (keeping the oldest one)
const findDuplicates = db.prepare(`
  WITH RankedAuctions AS (
    SELECT 
      id,
      title,
      boeId,
      createdAt,
      ROW_NUMBER() OVER (
        PARTITION BY title, boeId 
        ORDER BY createdAt ASC
      ) as rn
    FROM Auction
    WHERE title IS NOT NULL
  )
  SELECT id, title, createdAt
  FROM RankedAuctions
  WHERE rn > 1
`);

const duplicates = findDuplicates.all();

if (duplicates.length === 0) {
  console.log('No duplicates found!');
  db.close();
  process.exit(0);
}

console.log(`Found ${duplicates.length} duplicate auctions to remove\n`);

// Show sample of duplicates to be removed
console.log('Sample duplicates to be removed:');
duplicates.slice(0, 5).forEach((dup, i) => {
  const titlePreview = dup.title.substring(0, 60);
  console.log(`  ${i + 1}. "${titlePreview}..." (ID: ${dup.id})`);
});

console.log('\nRemoving duplicates...');

// Delete duplicates
const deleteStmt = db.prepare('DELETE FROM Auction WHERE id = ?');
const deleteMany = db.transaction((duplicates) => {
  for (const dup of duplicates) {
    deleteStmt.run(dup.id);
  }
});

try {
  deleteMany(duplicates);
  console.log(`\nSuccessfully removed ${duplicates.length} duplicate auctions`);
  
  // Show final counts
  const finalCount = db.prepare('SELECT COUNT(*) as count FROM Auction').get();
  console.log(`Total auctions remaining: ${finalCount.count}`);
  
  // Check if any duplicates remain
  const remainingDups = db.prepare(`
    SELECT title, COUNT(*) as count 
    FROM Auction 
    GROUP BY title 
    HAVING count > 1
  `).all();
  
  if (remainingDups.length > 0) {
    console.log(`\nWarning: ${remainingDups.length} titles still have duplicates (different boeIds)`);
  } else {
    console.log('\nNo duplicates remaining!');
  }
  
} catch (error) {
  console.error('Error removing duplicates:', error);
}

db.close();
