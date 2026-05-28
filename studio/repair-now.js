// Quick repair script - repairs data directly without API
import { trendStore } from './server/trends/trendStore.js';

console.log('🔧 Repairing trend data...\n');

// Repair corrupted data
const repairResult = trendStore.repairData();
console.log(`✅ Fixed ${repairResult.fixed} trends`);
console.log(`❌ Removed ${repairResult.removed} invalid trends\n`);

// Create historical snapshots
const snapshotCount = trendStore.createHistoricalSnapshot();
console.log(`📸 Created ${snapshotCount} historical snapshots\n`);

// Show stats
const stats = trendStore.getStats();
console.log('📊 Current Statistics:');
console.log(`  Total: ${stats.totalTrends} trends`);
console.log(`  Multi-Source: ${stats.multiSourceCount} trends`);
console.log(`  Sources: ${Object.keys(stats.sourceCounts).join(', ')}`);
console.log('\n✅ Repair complete!');

