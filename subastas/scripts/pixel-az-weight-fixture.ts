/**
 * pixel-az-weight-fixture — page-weight measurement seed for the v4 archive
 * surfaces (Pixel, P4, 2026-08-13).
 *
 * NOT part of the app, and deliberately a SEPARATE file from Forge's
 * `forge-pagination-fixture.ts`: that one is sized to straddle the pagination
 * CONSTANTS (60 / 200 / 24) and its job is asserting the link graph. This one is
 * sized to straddle the page-weight CEILING, which is a different question and
 * wants a different corpus — the A–Z index only gets expensive at a town count
 * no province-boundary test has any reason to seed.
 *
 * WHAT IT SEEDS
 *   • barcelona → 900 municipios, 1 row each. 900 is above prod's worst real
 *     province (839, measured), so the A–Z number this produces is a CEILING
 *     rather than a typical case. This is the corpus P1's "329 KB / 374 B per
 *     link" note was measured on, so branch numbers are comparable to it.
 *   • madrid/madrid/judicial/2025 → 840 rows, which is what makes the deepest
 *     ladder leaf exhaust its rungs and page at the adaptive size — the worst
 *     LEAF page, as opposed to the worst INDEX page.
 *
 * Refuses to run against anything but loopback (same guard as Forge's), because
 * the first statement it executes is a deleteMany.
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import { PROVINCE_SLUG_TO_DB_KEY } from '../src/lib/seo/slugs';
import { PrismaClient, SaleResult, AuctionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertNoUndefinedFields, assertDistribution } from './_fixture-guard';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BARCELONA = PROVINCE_SLUG_TO_DB_KEY['barcelona'];
const MADRID = PROVINCE_SLUG_TO_DB_KEY['madrid'];

/** Town count for the A–Z index. Above prod's worst province (839). */
const AZ_TOWNS = 900;
/** Rows in the deep leaf, above the ladder's exhaustion point. */
const LEAF_ROWS = 840;

/**
 * Realistic municipality names. Length matters — the per-link cost is dominated
 * by the href, which contains the slug, so uniformly short synthetic names
 * ("T1", "T2"…) would understate the page by a wide margin. These are built from
 * real Catalan/Spanish town-name morphology at a mean of ~14 characters, which
 * is what `concludedMunicipioRegions` returns on the real Barcelona row set.
 */
const HEADS = [
  'Sant', 'Santa', 'Vila', 'Castell', 'Torre', 'Puig', 'Roca', 'Font', 'Pla', 'Mont',
  'Vall', 'Riu', 'Camp', 'Corb', 'Olesa', 'Palau', 'Prat', 'Masquefa', 'Gelida', 'Abrera',
];
const TAILS = [
  'de Llobregat', 'del Valles', 'de Mar', 'de Montseny', 'de la Plana', 'del Penedes',
  'de Segarra', 'de Ter', 'del Bages', 'de Anoia', '', '', 'Nou', 'Vell', 'Alta', 'Baixa',
];

function townName(i: number): string {
  const head = HEADS[i % HEADS.length];
  const tail = TAILS[Math.floor(i / HEADS.length) % TAILS.length];
  // The numeric suffix guarantees uniqueness across 900 without collapsing the
  // A–Z distribution: the INITIAL still comes from the head word, so the letter
  // groups stay realistically uneven rather than 900/26 flat.
  const n = Math.floor(i / (HEADS.length * TAILS.length)) + 1;
  return `${head}${tail ? ` ${tail}` : ''}${n > 1 ? ` ${n}` : ''}`.toUpperCase();
}

async function run() {
  if (!/@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('refusing to seed a non-loopback DATABASE_URL');
  }
  await prisma.auctionOutcomeStats.deleteMany({});
  await prisma.auction.deleteMany({});

  const rows: Array<Record<string, unknown>> = [];
  let i = 0;

  // --- A–Z index corpus: 900 distinct Barcelona municipios, 1 row each -------
  for (let t = 0; t < AZ_TOWNS; t++) {
    i++;
    rows.push({
      boeId: `PXAZ-${i}`,
      title: `Vivienda ${i}`,
      category: 'Vivienda',
      province: BARCELONA,
      municipality: townName(t),
      status: AuctionStatus.CONCLUIDA_PORTAL, // ⚠️ was AuctionStatus.FINALIZADA — a member that does NOT exist; under tsx it was undefined, so every row seeded as the column DEFAULT (CELEBRANDOSE/active). See scripts/_fixture-guard.ts.
      inScope: true,
      saleResult: SaleResult.ADJUDICADA,
      soldPrice: BigInt(10_000_000),
      appraisalValue: 150_000,
      soldDate: new Date(Date.UTC(2025, 0, 1 + (t % 27))),
      endsAt: new Date(Date.UTC(2025, 0, 1 + (t % 27))),
      publishedAt: new Date(Date.UTC(2024, 10, 1)),
      auctionType: 'JUDICIAL',
    });
  }

  // --- deep-leaf corpus: one (muni, tipo, año) partition big enough to page ---
  for (let k = 0; k < LEAF_ROWS; k++) {
    i++;
    const sold = k % 2 === 0;
    rows.push({
      boeId: `PXLEAF-${i}`,
      title: `Vivienda unifamiliar en Madrid, referencia catastral ${k + 1}`,
      category: 'Vivienda',
      province: MADRID,
      municipality: 'MADRID',
      status: AuctionStatus.CONCLUIDA_PORTAL, // ⚠️ was AuctionStatus.FINALIZADA — a member that does NOT exist; under tsx it was undefined, so every row seeded as the column DEFAULT (CELEBRANDOSE/active). See scripts/_fixture-guard.ts.
      inScope: true,
      saleResult: sold ? SaleResult.ADJUDICADA : SaleResult.DESIERTA,
      soldPrice: sold ? BigInt(100_000_00 + k * 1000) : null,
      appraisalValue: 150_000,
      soldDate: new Date(Date.UTC(2025, k % 12, 1 + (k % 27))),
      endsAt: new Date(Date.UTC(2025, k % 12, 1 + (k % 27))),
      publishedAt: new Date(Date.UTC(2024, 10, 1)),
      auctionType: 'JUDICIAL',
    });
  }

  // Guard the silent path this fixture just fell into (see _fixture-guard.ts).
  assertNoUndefinedFields(rows, 'pixel-az-weight-fixture');
  await prisma.auction.createMany({ data: rows as never });

  // ---- rollup table --------------------------------------------------------
  // `concludedMunicipioRegions` (and therefore the A–Z index) reads
  // `auctionOutcomeStats`, NOT the auction rows — seeding auctions alone leaves
  // the index with zero municipios and a 307 back to the province hub, which is
  // the silent way this measurement returns a meaningless number. The rollup is
  // derived from `rows` rather than recomputed so the two cannot disagree.
  const stats = new Map<string, number>();
  const bump = (province: string, municipality: string, outcome: string) => {
    for (const key of [`${province}||${municipality}||${outcome}`, `${province}||||${outcome}`]) {
      stats.set(key, (stats.get(key) ?? 0) + 1);
    }
  };
  for (const r of rows) {
    bump(
      r.province as string,
      r.municipality as string,
      r.saleResult === SaleResult.ADJUDICADA ? 'VENDIDA' : 'DESIERTA',
    );
  }
  await prisma.auctionOutcomeStats.createMany({
    data: [...stats].map(([key, count]) => {
      const [province, municipality, outcome] = key.split('||');
      return {
        period: 'ALL',
        periodBasis: 'CONCLUDED',
        province,
        municipality,
        category: '',
        outcome,
        count,
      };
    }) as never,
  });

  console.log(
    `seeded ${rows.length} rows (${AZ_TOWNS} barcelona munis, ${LEAF_ROWS} madrid leaf), ${stats.size} rollup rows`,
  );
  // Read the seeded states back OUT: the whole point is that a wrong status
  // used to be invisible. AZ_TOWNS + LEAF_ROWS rows, all concluded.
  const dist = await prisma.auction.groupBy({ by: ['status'], _count: { _all: true } });
  assertDistribution(
    dist.map((d) => ({ value: d.status as string, count: d._count._all })),
    { CONCLUIDA_PORTAL: rows.length },
    'status',
  );

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
