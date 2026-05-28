/**
 * Data Repair Utility
 * Run this to repair corrupted trend data and create historical snapshots
 */

import { trendStore } from './trendStore.js';

async function main() {
  console.log('='.repeat(60));
  console.log('TREND DATA REPAIR UTILITY');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    // Step 1: Repair corrupted data
    console.log('[Step 1/3] Repairing corrupted data...');
    const repairResult = trendStore.repairData();
    console.log(`✅ Repaired ${repairResult.fixed} trends`);
    console.log(`❌ Removed ${repairResult.removed} invalid trends`);
    console.log('');
    
    // Step 2: Create historical snapshots from current data
    console.log('[Step 2/3] Creating historical snapshots...');
    const snapshotCount = trendStore.createHistoricalSnapshot();
    console.log(`✅ Created ${snapshotCount} historical snapshots`);
    console.log('');
    
    // Step 3: Display statistics
    console.log('[Step 3/3] Trend Store Statistics:');
    const stats = trendStore.getStats();
    console.log(`  Total Trends: ${stats.totalTrends}`);
    console.log(`  Exploding: ${stats.explodingCount}`);
    console.log(`  Emerging: ${stats.emergingCount}`);
    console.log(`  Peaked: ${stats.peakedCount}`);
    console.log(`  Multi-Source: ${stats.multiSourceCount}`);
    console.log('');
    console.log('  Sources:');
    Object.entries(stats.sourceCounts).forEach(([source, count]) => {
      console.log(`    ${source}: ${count} trends`);
    });
    console.log('');
    console.log('  Categories:');
    Object.entries(stats.categoryCounts).forEach(([category, count]) => {
      console.log(`    ${category}: ${count} trends`);
    });
    console.log('');
    
    console.log('='.repeat(60));
    console.log('✅ DATA REPAIR COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error during repair:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { main as repairData };

