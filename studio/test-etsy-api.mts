/**
 * Live verification for the Etsy v3 API ingestion path (DNK Trends).
 * Usage:  ETSY_API_KEY=<x-api-key value> npx tsx test-etsy-api.mts [keyword]
 * Never hardcode the key. Prints budget counters before/after one niche pull.
 */
import { etsyBudget } from './server/trends/etsyBudget.js';
import { etsyScraper } from './server/trends/etsyScraper.js';

const keyword = process.argv[2] || 'coloring book';

if (!process.env.ETSY_API_KEY) {
  console.error('ETSY_API_KEY not set — aborting (fail soft, nothing called).');
  process.exit(1);
}

console.log('[verify] budget BEFORE:', JSON.stringify(etsyBudget.getStatus(), null, 2));

const snapshot = await etsyScraper.pullNicheSnapshot({ keyword });

if (!snapshot) {
  console.error('[verify] pull FAILED (no snapshot)');
  process.exit(1);
}

console.log(`[verify] niche="${snapshot.niche}" totalCount=${snapshot.totalCount} listings=${snapshot.listings.length}`);
console.log('[verify] sample listing:', JSON.stringify(snapshot.listings[0], null, 2));
console.log('[verify] lastSnapshotAt:', etsyScraper.getLastSnapshotAt());
console.log('[verify] budget AFTER:', JSON.stringify(etsyBudget.getStatus(), null, 2));
process.exit(0);
