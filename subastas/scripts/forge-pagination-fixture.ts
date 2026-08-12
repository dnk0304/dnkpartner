/**
 * Verify fixture for the /resultados archive pagination (Forge, 2026-08-12).
 *
 * NOT part of the app. Seeds an ISOLATED loopback dev DB with a concluded
 * corpus large enough to exercise real pagination (multi-page town, multi-page
 * province, a single-page town, and an empty-but-resolvable town), then the
 * verify script asserts status codes / canonicals / rel links against a real
 * `next start`. Province keys come from the app's own slug tables so the fixture
 * cannot drift from what the routes resolve.
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import { PROVINCE_SLUG_TO_DB_KEY } from '../src/lib/seo/slugs';
import { PrismaClient, SaleResult, AuctionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const MADRID = PROVINCE_SLUG_TO_DB_KEY['madrid'];
const VALENCIA = PROVINCE_SLUG_TO_DB_KEY['valencia'];
const BARCELONA = PROVINCE_SLUG_TO_DB_KEY['barcelona'];
const TARRAGONA = PROVINCE_SLUG_TO_DB_KEY['tarragona'];

/** (municipality, province, rows) — sized to straddle ARCHIVE_PAGE_SIZE = 24. */
const TOWNS: Array<[string, string, number]> = [
  ['MADRID', MADRID, 61], // 3 pages
  ['ALCOBENDAS', MADRID, 24], // exactly 1 page — pagina/2 must 404
  ['GETAFE', MADRID, 25], // 2 pages, second page holds 1 row
  ['VALENCIA', VALENCIA, 30], // 2 pages, different province
];

/**
 * Municipality-INDEX fixture (Forge 2026-08-12) — sized to straddle
 * HUB_MUNI_PREVIEW = 60 and MUNI_INDEX_PAGE_SIZE = 200, the two constants that
 * decide whether a town archive has an inbound internal link at all.
 *
 *   madrid    →   3 munis  — at/below the 60 preview: hub shows them ALL, so
 *                            the index affordance must NOT render.
 *   tarragona →  70 munis  — above 60, ONE index page: link renders, page-number
 *                            row must not (nothing to jump to).
 *   barcelona → 205 munis  — above 60, TWO index pages: exercises the slice
 *                            boundary (200 + 5) and the out-of-range 404.
 *
 * These carry ONE auction each — the point under test is the LINK GRAPH, not the
 * archive body, and 275 single-row towns keep the seed fast.
 */
const INDEX_PROVINCES: Array<[string, number]> = [
  [TARRAGONA, 70],
  [BARCELONA, 205],
];

async function run() {
  if (!/@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('refusing to seed a non-loopback DATABASE_URL');
  }
  await prisma.auctionOutcomeStats.deleteMany({});
  await prisma.auction.deleteMany({});

  let i = 0;
  const stats = new Map<string, number>();

  for (const [municipality, province, count] of TOWNS) {
    for (let k = 0; k < count; k++) {
      i++;
      // Alternate VENDIDA / DESIERTA so both registry buckets are populated.
      const sold = k % 2 === 0;
      await prisma.auction.create({
        data: {
          boeId: `FIXTURE-${i}`,
          title: `Vivienda en ${municipality} n${k + 1}`,
          category: 'Vivienda',
          province,
          municipality,
          status: AuctionStatus.FINALIZADA,
          inScope: true,
          saleResult: sold ? SaleResult.ADJUDICADA : SaleResult.DESIERTA,
          soldPrice: sold ? BigInt(100_000_00 + k * 1000) : null,
          appraisalValue: 150_000,
          soldDate: new Date(Date.UTC(2025, 0, 1 + (k % 27))),
          endsAt: new Date(Date.UTC(2025, 0, 1 + (k % 27))),
          publishedAt: new Date(Date.UTC(2024, 10, 1)),
          auctionType: 'JUDICIAL',
        },
      });
      const outcome = sold ? 'VENDIDA' : 'DESIERTA';
      for (const key of [
        `${province}||${municipality}||${outcome}`,
        `${province}||||${outcome}`,
      ]) {
        stats.set(key, (stats.get(key) ?? 0) + 1);
      }
    }
  }

  // ---- municipality-index corpus -----------------------------------------
  // Counts are strictly descending (n, n-1, … 1) because
  // `concludedMunicipioRegions` sorts by total DESC: distinct totals make the
  // page-1 / page-2 split deterministic, so the verify script can assert
  // EXACTLY which town lands on which index page instead of just counting.
  for (const [province, n] of INDEX_PROVINCES) {
    const auctions: Array<Record<string, unknown>> = [];
    for (let t = 1; t <= n; t++) {
      i++;
      const municipality = `${province.slice(0, 3).toUpperCase()}TOWN${String(t).padStart(3, '0')}`;
      auctions.push({
        boeId: `FIXTURE-${i}`,
        title: `Vivienda en ${municipality}`,
        category: 'Vivienda',
        province,
        municipality,
        status: AuctionStatus.FINALIZADA,
        inScope: true,
        saleResult: SaleResult.ADJUDICADA,
        soldPrice: BigInt(100_000_00),
        appraisalValue: 150_000,
        soldDate: new Date(Date.UTC(2025, 0, 15)),
        endsAt: new Date(Date.UTC(2025, 0, 15)),
        publishedAt: new Date(Date.UTC(2024, 10, 1)),
        auctionType: 'JUDICIAL',
      });
      const total = n - t + 1; // strictly descending → deterministic rank
      stats.set(`${province}||${municipality}||VENDIDA`, total);
      stats.set(
        `${province}||||VENDIDA`,
        (stats.get(`${province}||||VENDIDA`) ?? 0) + total,
      );
    }
    await prisma.auction.createMany({ data: auctions as never });
  }

  for (const [key, count] of stats) {
    const [province, municipality, outcome] = key.split('||');
    await prisma.auctionOutcomeStats.create({
      data: {
        period: 'ALL',
        periodBasis: 'CONCLUDED',
        province,
        municipality,
        category: '',
        outcome,
        count,
      },
    });
  }

  console.log(`seeded ${i} auctions, ${stats.size} rollup rows`);
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
