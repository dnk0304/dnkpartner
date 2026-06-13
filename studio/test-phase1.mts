/**
 * Phase 1 local verification (NOT committed to runtime paths — dev harness).
 * Run: ETSY_API_KEY=... npx tsx test-phase1.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { etsyScraper } from './server/trends/etsyScraper.js';
import { snapshotStore } from './server/trends/snapshotStore.js';
import { scraperHealth } from './server/trends/scraperHealth.js';
import { isTrendSignal, type TrendSignal } from './server/trends/signalSchema.js';

const KW = 'coloring book';

async function main() {
  console.log('=== 1. LIVE ETSY PULL -> persistent snapshot store ===');
  const snap = await etsyScraper.pullNicheSnapshot({ keyword: KW });
  console.log('pull result:', snap ? `${snap.listings.length} listings, totalCount=${snap.totalCount}` : 'NULL');

  console.log('snapshot root:', snapshotStore.rootDir);
  const days = snapshotStore.listDays('etsy');
  console.log('etsy snapshot days on disk:', days);
  const today = days[days.length - 1]!;
  const rows = snapshotStore.readDay('etsy', today);
  const last = rows[rows.length - 1]!;
  console.log('rows in today file:', rows.length, '| all conform to TrendSignal:', rows.every(isTrendSignal));
  const { raw, ...lastSlim } = last as TrendSignal & { raw?: unknown };
  console.log('last signal (raw stripped):', JSON.stringify(lastSlim, null, 2));
  const fileOnDisk = path.join(snapshotStore.rootDir, 'etsy', `${today}.json`);
  console.log('file exists at expected path:', fs.existsSync(fileOnDisk), fileOnDisk);

  console.log('\n=== 2. TRUTHFUL HEALTH ===');
  // Simulate: etsy real success, reddit mock fallback, pinterest repeated failures
  scraperHealth.recordSuccess('etsy', 42, 1200, 'live');
  scraperHealth.recordSuccess('reddit', 30, 5, 'mock');
  scraperHealth.recordFailure('pinterest', 'blocked', 900);
  scraperHealth.recordFailure('pinterest', 'blocked', 900);

  for (const src of ['etsy', 'reddit', 'pinterest', 'amazonKeywords']) {
    const h = scraperHealth.getHealth(src)!;
    console.log(
      `${src.padEnd(15)} status=${h.status.padEnd(13)} freshness=${h.dataFreshness.padEnd(5)} ` +
      `successRate=${h.successRate24h.toFixed(0)}% trends24h=${h.trendsCollected24h} ` +
      `mockTrends24h=${h.mockTrendsCollected24h} lastRealDataAt=${h.lastRealDataAt}`
    );
  }
  const summary = scraperHealth.getSummary();
  console.log('summary:', JSON.stringify(summary));

  console.log('\n=== 3. SIGNAL AGGREGATION (zero mock leakage) ===');
  // Plant a MOCK signal for the same keyword — it must NEVER surface.
  snapshotStore.appendSignals('etsy', [{
    keyword: KW,
    platform: 'etsy',
    metrics: { resultCount: 999999999 },
    capturedAt: new Date().toISOString(),
    source: 'mockDataGenerator:test-plant',
    isMock: true,
  }]);

  const byPlatform = snapshotStore.getSignalsForKeyword(KW, { maxDays: 30, includeMock: false });
  const platforms: Record<string, { latest: unknown; series: unknown[] }> = {};
  for (const [platform, series] of Object.entries(byPlatform)) {
    const real = series.filter(s => s.isMock === false);
    const latest = real[real.length - 1];
    if (!latest) continue;
    const slim = real.map(({ raw: _raw, ...rest }) => rest);
    platforms[platform] = { latest: { ...latest, raw: '<raw kept, omitted for log>' }, series: slim };
  }
  const response = { keyword: KW, platforms, generatedAt: new Date().toISOString() };
  const json = JSON.stringify(response);
  console.log('platforms returned:', Object.keys(platforms));
  console.log('mock leak check (isMock true anywhere / planted marker):',
    json.includes('"isMock":true'), json.includes('mockDataGenerator'));
  const etsySeries = (platforms['etsy']?.series ?? []) as TrendSignal[];
  console.log('etsy series points:', etsySeries.length);
  console.log('sample response (series truncated):', JSON.stringify({
    ...response,
    platforms: { etsy: { latest: platforms['etsy']?.latest, series: etsySeries.slice(-2) } },
  }, null, 2).slice(0, 2500));

  console.log('\n=== 4. getLastSnapshotAt (health freshness, realOnly) ===');
  console.log('etsyScraper.getLastSnapshotAt():', etsyScraper.getLastSnapshotAt());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
