#!/usr/bin/env node

/**
 * Map Synchronization Diagnostic
 * Checks for discrepancies between map, counts, and auctions
 */

const diagnose = async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  MAP SYNCHRONIZATION DIAGNOSTIC');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // 1. Get total counts from counts API
    console.log('📊 Step 1: Checking province counts API...\n');
    const countsResponse = await fetch('http://localhost:3005/api/auctions/counts?groupBy=province');
    const countsData = await countsResponse.json();
    
    if (countsData.success && countsData.totals) {
      console.log('Total Auctions by Status (from counts API):');
      console.log('├─ Active:', countsData.totals.active);
      console.log('├─ Pre-Auction:', countsData.totals.preAuction);
      console.log('├─ Finished:', countsData.totals.finished);
      console.log('└─ TOTAL:', countsData.totals.total, '\n');
    }
    
    // 2. Get map auctions (all with coordinates)
    console.log('🗺️  Step 2: Checking map API...\n');
    const mapResponse = await fetch('http://localhost:3005/api/auctions/map');
    const mapData = await mapResponse.json();
    
    console.log('Auctions on Map (with coordinates):');
    console.log('└─ Count:', mapData.count, '\n');
    
    // 3. Get regular auctions (paginated)
    console.log('📋 Step 3: Checking regular auctions API...\n');
    const auctionsResponse = await fetch('http://localhost:3005/api/auctions?limit=1000');
    const auctionsData = await auctionsResponse.json();
    
    console.log('Regular Auctions API:');
    console.log('├─ Returned:', auctionsData.data?.length || 0);
    console.log('└─ Total in DB:', auctionsData.pagination?.total || 0, '\n');
    
    // 4. Analyze the discrepancy
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ANALYSIS');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const totalInDB = auctionsData.pagination?.total || countsData.totals?.total || 0;
    const onMap = mapData.count || 0;
    const missing = totalInDB - onMap;
    const percentage = totalInDB > 0 ? ((onMap / totalInDB) * 100).toFixed(1) : 0;
    
    console.log('Summary:');
    console.log('├─ Total auctions in database:', totalInDB);
    console.log('├─ Auctions showing on map:', onMap);
    console.log('├─ Missing from map:', missing);
    console.log('└─ Map coverage:', percentage + '%\n');
    
    if (missing > 0) {
      console.log('⚠️  PROBLEM IDENTIFIED:\n');
      console.log(`${missing} auctions are NOT showing on the map!`);
      console.log('\nPossible reasons:');
      console.log('1. Auctions missing GPS coordinates (latitude/longitude)');
      console.log('2. Map API filtering out some auctions');
      console.log('3. Scraper hasn\'t geocoded addresses yet\n');
      
      // Check a few auctions without coordinates
      console.log('📍 Checking sample auctions for coordinates...\n');
      const sampleAuctions = auctionsData.data?.slice(0, 10) || [];
      let withCoords = 0;
      let withoutCoords = 0;
      
      sampleAuctions.forEach(auction => {
        if (auction.latitude && auction.longitude) {
          withCoords++;
        } else {
          withoutCoords++;
          console.log(`❌ Missing coords: ${auction.title.substring(0, 50)}...`);
        }
      });
      
      console.log(`\nSample (first 10 auctions):`);
      console.log(`├─ With coordinates: ${withCoords}/10`);
      console.log(`└─ Without coordinates: ${withoutCoords}/10\n`);
      
      console.log('🔧 SOLUTION:\n');
      console.log('The map API is working correctly, but auctions need coordinates.');
      console.log('Options:');
      console.log('1. Run geocoding scraper to add coordinates to existing auctions');
      console.log('2. Update map to show all auctions (use approximate province centers)');
      console.log('3. Wait for scraper to geocode new auctions\n');
    } else {
      console.log('✅ All auctions are showing on the map!\n');
    }
    
    // 5. Check province counts consistency
    console.log('═══════════════════════════════════════════════════════');
    console.log('  PROVINCE COUNTS CHECK');
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (countsData.success && countsData.counts) {
      const provinces = Object.keys(countsData.counts.total || {});
      console.log(`Found ${provinces.length} provinces with auctions:\n`);
      
      provinces.slice(0, 10).forEach(province => {
        const total = countsData.counts.total[province] || 0;
        const active = countsData.counts.active[province] || 0;
        console.log(`├─ ${province}: ${total} total (${active} active)`);
      });
      
      if (provinces.length > 10) {
        console.log(`└─ ... and ${provinces.length - 10} more provinces\n`);
      }
    }
    
  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ ERROR');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Error:', error.message);
    console.log('\n💡 Make sure dev server is running: npm run dev\n');
  }
};

diagnose();
