/**
 * Verify fixture for v4 P2 — the legacy→v4 archive redirect map (Forge, 2026-08-13).
 *
 * NOT part of the app. Seeds an ISOLATED loopback dev DB with the shapes the P2
 * gates actually need, which the P1 pagination fixture does not carry:
 *
 *   • a province that OVERFLOWS its 10-page cap and therefore SPLITS on the
 *     municipio rung — without one, `/resultados/{prov}/pagina/{n>10}` never
 *     reaches the partition-descent path and the hardest case goes untested;
 *   • a TOWN that overflows and splits on tipo, for the 3-segment equivalent;
 *   • outcome facets in FIVE provinces, for the outcome-parity proof;
 *   • a province with ZERO rows for one outcome, so the "301 must not land on a
 *     404" fallback is exercised rather than argued;
 *   • a >60-town province (2 municipality-index pages, the `/municipios/pagina/2`
 *     source) and a ≤60-town province (whose bare index 307s to the hub — the
 *     301→307 chain the redirect target has to avoid).
 *
 * Province keys come from the app's own slug tables so the fixture cannot drift
 * from what the routes resolve.
 *
 *   createdb subastas_v4_p2_forge && npx prisma db push
 *   npx tsx scripts/forge-v4-p2-fixture.ts
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

const MADRID = PROVINCE_SLUG_TO_DB_KEY['madrid'];
const BARCELONA = PROVINCE_SLUG_TO_DB_KEY['barcelona'];
const VALENCIA = PROVINCE_SLUG_TO_DB_KEY['valencia'];
const SEVILLA = PROVINCE_SLUG_TO_DB_KEY['sevilla'];
const MALAGA = PROVINCE_SLUG_TO_DB_KEY['malaga'];

type Row = Record<string, unknown>;
const rows: Row[] = [];
let seq = 0;

/**
 * Outcome bucket → the (saleResult, status) pair that puts a row in it.
 *
 * ⚠️ `AuctionStatus.FINALIZADA` DOES NOT EXIST — the enum has
 * `CONCLUIDA_PORTAL` / `FINALIZADA_AUTORIDAD`. The P1 pagination fixture uses
 * the non-existent member, which under `tsx` (no typecheck) evaluates to
 * `undefined`, so Prisma silently applies the column DEFAULT — every "concluded"
 * fixture row was seeded as `CELEBRANDOSE`. It cost this dispatch a full
 * verification round: the parity comparison reported empty lists on four of five
 * provinces and looked exactly like a filtering bug in the new code. Flagged to
 * Ken; `scripts/forge-pagination-fixture.ts` carries the same defect.
 */
function outcomeFields(bucket: 'VENDIDA' | 'DESIERTA' | 'CANCELADA' | 'FSR') {
  switch (bucket) {
    case 'VENDIDA':
      return { saleResult: SaleResult.ADJUDICADA, status: AuctionStatus.CONCLUIDA_PORTAL };
    case 'DESIERTA':
      return { saleResult: SaleResult.DESIERTA, status: AuctionStatus.CONCLUIDA_PORTAL };
    case 'CANCELADA':
      return { saleResult: null, status: AuctionStatus.CANCELADA };
    case 'FSR':
      return { saleResult: null, status: AuctionStatus.FINALIZADA_AUTORIDAD };
  }
}

function add(opts: {
  province: string;
  municipality: string;
  bucket: 'VENDIDA' | 'DESIERTA' | 'CANCELADA' | 'FSR';
  tipo: string;
  /** Day offset inside 2025, so the `año`/`trimestre` rungs have real spread. */
  day: number;
}) {
  seq++;
  const o = outcomeFields(opts.bucket);
  const d = new Date(Date.UTC(2025, 0, 1 + (opts.day % 360)));
  rows.push({
    boeId: `P2FIX-${seq}`,
    title: `Vivienda en ${opts.municipality} n${seq}`,
    category: 'Vivienda',
    province: opts.province,
    municipality: opts.municipality,
    status: o.status,
    inScope: true,
    saleResult: o.saleResult,
    soldPrice: o.saleResult === SaleResult.ADJUDICADA ? BigInt(100_000_00 + seq) : null,
    appraisalValue: 150_000,
    soldDate: d,
    endsAt: d,
    publishedAt: new Date(Date.UTC(2024, 10, 1)),
    auctionType: opts.tipo,
  });
}

async function run() {
  if (!/@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('refusing to seed a non-loopback DATABASE_URL');
  }
  await prisma.auctionOutcomeStats.deleteMany({});
  await prisma.auction.deleteMany({});

  // ---- MADRID: an overflowing province that splits on municipio -----------
  // 755 rows > 480 (dense capacity) so the province ladders; three towns keep
  // the municipio rung non-degenerate. MADRID town itself is 700 rows — also
  // over 480 — so IT ladders too, on tipo, giving a two-level descent to test.
  const buckets = ['VENDIDA', 'DESIERTA', 'CANCELADA', 'FSR'] as const;
  for (let k = 0; k < 700; k++) {
    add({
      province: MADRID,
      municipality: 'MADRID',
      bucket: buckets[k % 4],
      tipo: k < 500 ? 'JUDICIAL' : 'NOTARIAL',
      day: k,
    });
  }
  for (let k = 0; k < 30; k++)
    add({ province: MADRID, municipality: 'ALCOBENDAS', bucket: buckets[k % 4], tipo: 'JUDICIAL', day: k });
  for (let k = 0; k < 25; k++)
    add({ province: MADRID, municipality: 'GETAFE', bucket: buckets[k % 4], tipo: 'JUDICIAL', day: k });

  // ---- outcome-parity provinces ------------------------------------------
  // VALENCIA and MALAGA carry all four buckets. SEVILLA deliberately carries NO
  // cancelada: `/resultados/canceladas/sevilla` is an empty noindex 200 today,
  // and its v4 facet would be a 404 — the exact case the parent-fallback exists
  // for, and the one an "all provinces look alike" fixture would never catch.
  for (let k = 0; k < 40; k++)
    add({ province: VALENCIA, municipality: 'VALENCIA', bucket: buckets[k % 4], tipo: 'JUDICIAL', day: k });
  for (let k = 0; k < 40; k++)
    add({ province: MALAGA, municipality: 'MALAGA', bucket: buckets[k % 4], tipo: 'NOTARIAL', day: k });
  for (let k = 0; k < 40; k++)
    add({ province: SEVILLA, municipality: 'SEVILLA', bucket: k % 2 === 0 ? 'VENDIDA' : 'DESIERTA', tipo: 'JUDICIAL', day: k });

  // ---- BARCELONA: 205 towns → 2 municipality-index pages ------------------
  // The `/municipios/pagina/2` source. One row each: the link graph is what is
  // under test, not the archive body.
  for (let t = 1; t <= 205; t++) {
    add({
      province: BARCELONA,
      municipality: `BCNTOWN${String(t).padStart(3, '0')}`,
      bucket: t % 2 === 0 ? 'VENDIDA' : 'DESIERTA',
      tipo: 'JUDICIAL',
      day: t,
    });
  }

  assertNoUndefinedFields(rows, 'forge-v4-p2-fixture');
  await prisma.auction.createMany({ data: rows as never });

  // Read the states back out — see scripts/_fixture-guard.ts for why.
  const dist = await prisma.auction.groupBy({ by: ['status'], _count: { _all: true } });
  const want: Record<string, number> = {};
  for (const r of rows) want[r.status as string] = (want[r.status as string] ?? 0) + 1;
  assertDistribution(dist.map((d) => ({ value: d.status as string, count: d._count._all })), want, 'status');

  // Rollup rows: `readSummary`/`concludedMunicipioRegions` read these, and a
  // province whose rollup disagrees with its auctions renders a hub that links
  // towns it then 404s. Derived from the SAME array that was just inserted, so
  // they cannot drift from it.
  const tally = new Map<string, number>();
  for (const r of rows) {
    const outcome =
      r.saleResult === SaleResult.ADJUDICADA
        ? 'VENDIDA'
        : r.saleResult === SaleResult.DESIERTA
          ? 'DESIERTA'
          : r.status === AuctionStatus.CANCELADA
            ? 'CANCELADA'
            : 'FINALIZADA_SIN_RESULTADO';
    for (const key of [
      `${r.province}||${r.municipality}||${outcome}`,
      `${r.province}||||${outcome}`,
    ]) {
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of tally) {
    const [province, municipality, outcome] = key.split('||');
    await prisma.auctionOutcomeStats.create({
      data: { period: 'ALL', periodBasis: 'CONCLUDED', province, municipality, category: '', outcome, count },
    });
  }

  console.log(`seeded ${rows.length} auctions, ${tally.size} rollup rows`);
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
