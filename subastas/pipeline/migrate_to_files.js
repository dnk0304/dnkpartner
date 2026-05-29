/**
 * Migration Script: Export existing database auctions to file-based system
 * 
 * This script reads all auctions from the SQLite database and creates
 * individual JSON files in the 3_processed stage (since they're already in DB)
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('data/database/prod.db', { readonly: true });
const processedDir = path.join(process.cwd(), 'data', 'auctions', '3_processed');

console.log('🔄 Starting migration: Database → Files\n');

try {
  // Get all auctions from database
  const auctions = db.prepare(`
    SELECT * FROM Auction 
    ORDER BY publishedAt DESC
  `).all();
  
  console.log(`📊 Found ${auctions.length} auctions in database\n`);
  
  let migrated = 0;
  let skipped = 0;
  
  for (const auction of auctions) {
    const filename = `${auction.source}-${auction.boeId}.json`;
    const filepath = path.join(processedDir, filename);
    
    // Skip if file already exists
    if (fs.existsSync(filepath)) {
      skipped++;
      continue;
    }
    
    // Create auction file
    const auctionFile = {
      id: auction.boeId,
      source: auction.source,
      stage: 'processed',
      scraped_at: auction.createdAt || new Date().toISOString(),
      updated_at: auction.updatedAt || new Date().toISOString(),
      processed_at: new Date().toISOString(),
      version: 1,
      data: {
        // Core info
        boeId: auction.boeId,
        title: auction.title,
        description: auction.description,
        
        // Location
        province: auction.province,
        municipality: auction.municipality,
        address: auction.address,
        postalCode: auction.postalCode,
        latitude: auction.latitude,
        longitude: auction.longitude,
        
        // Property details
        category: auction.category,
        propertyType: auction.propertyType,
        
        // Auction details
        status: auction.status,
        auctionValue: auction.auctionValue,
        appraisalValue: auction.appraisalValue,
        minimumBid: auction.minimumBid,
        deposit: auction.deposit,
        
        // Dates
        publishedAt: auction.publishedAt,
        auctionDate: auction.auctionDate,
        endDate: auction.endDate,
        
        // Additional
        court: auction.court,
        caseNumber: auction.caseNumber,
        lotNumber: auction.lotNumber,
        detailsUrl: auction.detailsUrl,
        imageUrl: auction.imageUrl,
        mapImageUrl: auction.mapImageUrl,
        
        // Source tracking
        source: auction.source,
        sourceUrl: auction.sourceUrl
      },
      metadata: {
        in_database: true,
        geocoded: !!(auction.latitude && auction.longitude),
        has_image: !!auction.imageUrl,
        has_map: !!auction.mapImageUrl,
        migrated: true
      }
    };
    
    // Write file
    fs.writeFileSync(filepath, JSON.stringify(auctionFile, null, 2), 'utf8');
    migrated++;
    
    // Progress update every 100 auctions
    if (migrated % 100 === 0) {
      console.log(`  ✓ Migrated ${migrated} auctions...`);
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   📝 Migrated: ${migrated} auctions`);
  console.log(`   ⏭️  Skipped: ${skipped} (already existed)`);
  console.log(`   📁 Location: ${processedDir}\n`);
  
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
