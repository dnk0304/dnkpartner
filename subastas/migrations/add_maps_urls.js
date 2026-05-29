const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('data/database/prod.db');

console.log('Adding Google Maps URL columns to Auction table...\n');

try {
  // Add mapUrl column
  db.prepare('ALTER TABLE Auction ADD COLUMN mapUrl TEXT').run();
  console.log('✓ Added mapUrl column');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('⚠ mapUrl column already exists');
  } else {
    throw e;
  }
}

try {
  // Add streetViewUrl column
  db.prepare('ALTER TABLE Auction ADD COLUMN streetViewUrl TEXT').run();
  console.log('✓ Added streetViewUrl column');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('⚠ streetViewUrl column already exists');
  } else {
    throw e;
  }
}

try {
  // Add placeUrl column
  db.prepare('ALTER TABLE Auction ADD COLUMN placeUrl TEXT').run();
  console.log('✓ Added placeUrl column');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('⚠ placeUrl column already exists');
  } else {
    throw e;
  }
}

try {
  // Add directionsUrl column
  db.prepare('ALTER TABLE Auction ADD COLUMN directionsUrl TEXT').run();
  console.log('✓ Added directionsUrl column');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('⚠ directionsUrl column already exists');
  } else {
    throw e;
  }
}

// Create indexes
try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_auction_mapurl ON Auction(mapUrl) WHERE mapUrl IS NOT NULL').run();
  console.log('✓ Created index on mapUrl');
} catch (e) {
  console.log('⚠ Error creating mapUrl index:', e.message);
}

try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_auction_streetviewurl ON Auction(streetViewUrl) WHERE streetViewUrl IS NOT NULL').run();
  console.log('✓ Created index on streetViewUrl');
} catch (e) {
  console.log('⚠ Error creating streetViewUrl index:', e.message);
}

console.log('\n✅ Database migration complete!');

// Show sample of data structure
console.log('\nTable structure:');
const tableInfo = db.prepare("PRAGMA table_info(Auction)").all();
const mapColumns = tableInfo.filter(col => col.name.includes('Url') || col.name.includes('url'));
console.table(mapColumns);

db.close();
