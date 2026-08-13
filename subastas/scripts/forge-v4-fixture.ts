/**
 * THE v4 archive fixture (Forge, 2026-08-13, dispatch P2c).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE REPLACES TWO OTHERS
 *
 * P1 shipped a suite that asserted year 2026 against a fixture that seeded 2025,
 * with no province-less rows and no `canceladas`. It reported 48/48 — against an
 * uncommitted corpus that no longer exists. Ken voided that evidence on
 * 2026-08-13 with the rule this file exists to satisfy:
 *
 *     A test that cannot be re-run from the repo is indistinguishable from no
 *     test. Green output is not the artefact; the reproducible corpus is.
 *
 * So there is now exactly ONE v4 fixture, it is committed, and every number the
 * suite asserts is DERIVED from the constants below rather than typed twice.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THE YEAR IS RELATIVE, AND THAT IS THE WHOLE POINT
 *
 * The 2025/2026 mismatch was not a typo — it was a hardcoded year rotting past
 * its seed date. `ARCHIVE_YEAR` is therefore derived at seed time as **last
 * complete calendar year**, and `scripts/verify-v4-archive.sh` derives the same
 * number the same way (`date -u +%Y` minus one). Two derivations of one rule
 * cannot drift the way two literals did.
 *
 * Last complete year, not the current one: on 2 January a "current year" fixture
 * has no Q2/Q3/Q4 rows, the trimestre rung goes degenerate, and the
 * ladder-descent assertions silently stop testing the ladder. Last year is
 * always four full quarters and always inside the resolver's [2000, now+1]
 * window (`resolve-child.ts`), so this fixture is correct on any date it runs.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS SEEDED, AND WHICH ASSERTION EACH SHAPE EXISTS FOR
 *
 *  MADRID / MADRID / judicial / {Y} / t1  = 840 rows
 *      The structurally terminal leaf. 840 is not arbitrary: every rung is spent
 *      (muni, tipo, año, trimestre) so `archivePageSizeForNode` grows the page to
 *      ceil(840/10) = 84 = ARCHIVE_PAGE_SIZE_MAX, giving EXACTLY 10 pages. That
 *      is simultaneously the adaptive-page-size case, the 10-page cap, and the
 *      only way `/pagina/11` is an honest 404 rather than an overflow 308.
 *  MADRID / MADRID / judicial / {Y} / t2..t4 = 120 each
 *      Without them the trimestre rung has ONE child, the planner's thin guard
 *      skips it as degenerate, and the leaf above never gets the adaptive size —
 *      i.e. the 84 assertion would be testing nothing.
 *  MADRID / MADRID / judicial / {Y-1} = 300 rows
 *      The dense (48/page) node: over the 240 sparse capacity, under the 480
 *      dense one, so it renders 48 and does NOT split.
 *  MADRID / MADRID / notarial / {Y-1} = 200 rows
 *      Gives the town's tipo rung a second child, so the TOWN overflow
 *      (`/resultados/madrid/madrid/pagina/20`) descends instead of capping.
 *  MADRID / ALCOBENDAS (30) + GETAFE (25)
 *      Gives the PROVINCE a non-degenerate municipio rung, so
 *      `/resultados/madrid/pagina/11` descends. GETAFE's rows carry a NULL
 *      `endsAt` on purpose — 17,848 prod rows do, and they are placed by
 *      `COALESCE(endsAt, publishedAt)`. Untested until now.
 *  MADRID has 3 towns (<= HUB_MUNI_PREVIEW)
 *      so `/resultados/madrid/municipios` 307s to the hub and the lit redirect
 *      for `/municipios/pagina/2` must target the HUB, not a 307.
 *  BARCELONA / BARCELONA = 24 rows + 205 one-row towns
 *      24 is the sparse page size exactly (the "small node" assertion); 206 towns
 *      is over HUB_MUNI_PREVIEW and over one MUNI_INDEX_PAGE_SIZE page, so
 *      `/municipios/pagina/2` exists to be retired.
 *  VALENCIA / MALAGA = all four outcome buckets; SEVILLA = no CANCELADA
 *      The outcome-parity corpus. Sevilla's emptiness is a requirement, not an
 *      oversight: it is the "an empty facet must not 301 onto a 404" case.
 *  PROVINCE-LESS SHELF (province = '')
 *      judicial {Y-1} 30 + judicial {Y} 12 + notarial {Y-1} 10, plus 2 rows with
 *      no tipo at all. The location-free shelf is where province-less rows live
 *      and it has NO other parent, so `/resultados` linking every shelf root is a
 *      release gate — and until this fixture there was not one row to gate on.
 *      The 2 tipo-less rows are the `readUnplaceableCount` case: reported, never
 *      placed, never invented a province for.
 *
 * ---------------------------------------------------------------------------
 *   bash scripts/verify-v4-suite.sh          # seeds this, builds, runs both states
 * Do not run this file by hand against a DB you care about: it TRUNCATES.
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import { PROVINCE_SLUG_TO_DB_KEY } from '../src/lib/seo/slugs';
import { PrismaClient, SaleResult, AuctionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertNoUndefinedFields, assertDistribution } from './_fixture-guard';
import { auctionOutcome, STALE_SUSPENDED_DAYS } from '../src/lib/seo/auction-outcome';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Last COMPLETE calendar year. `verify-v4-archive.sh` computes the identical
 * number from `date -u +%Y`; if you change the rule here, change it there.
 */
export const ARCHIVE_YEAR = new Date().getUTCFullYear() - 1;
/** The second year, so the `año` rung has two children and the shelf has depth. */
export const ARCHIVE_YEAR_PREV = ARCHIVE_YEAR - 1;

const MADRID = PROVINCE_SLUG_TO_DB_KEY['madrid'];
const BARCELONA = PROVINCE_SLUG_TO_DB_KEY['barcelona'];
const VALENCIA = PROVINCE_SLUG_TO_DB_KEY['valencia'];
const SEVILLA = PROVINCE_SLUG_TO_DB_KEY['sevilla'];
const MALAGA = PROVINCE_SLUG_TO_DB_KEY['malaga'];
const ZARAGOZA = PROVINCE_SLUG_TO_DB_KEY['zaragoza'];

/** Zaragoza's two suspended towns — split by which side of the staleness window they sit on. */
const STALE_TOWN = 'ZARAGOZA';
const FRESH_TOWN = 'CALATAYUD';

/** The location-free shelf's province sentinel — '' , never NULL. See archive-node-read.ts. */
const NO_PROVINCE = '';

type Bucket = 'VENDIDA' | 'DESIERTA' | 'CANCELADA' | 'FSR' | 'SUSPENDED';
const ALL_BUCKETS: readonly Bucket[] = ['VENDIDA', 'DESIERTA', 'CANCELADA', 'FSR'];
/** Sevilla's set — deliberately missing CANCELADA. */
const SOLD_ONLY: readonly Bucket[] = ['VENDIDA', 'DESIERTA'];

/**
 * Outcome bucket → the (saleResult, status) pair that lands a row in it.
 *
 * ⚠️ `AuctionStatus.FINALIZADA` DOES NOT EXIST — the enum has
 * `CONCLUIDA_PORTAL` / `FINALIZADA_AUTORIDAD`. Under `tsx` (which does not
 * typecheck) the bad member evaluated to `undefined`, Prisma applied the column
 * DEFAULT, and every "concluded" row seeded as `CELEBRANDOSE`. That is now
 * caught three ways: `tsconfig.scripts.json` + `npm run typecheck:scripts`
 * typechecks this file, `assertNoUndefinedFields` refuses to insert an undefined,
 * and `assertDistribution` reads the states back out of Postgres afterwards.
 */
function outcomeFields(bucket: Bucket): { saleResult: SaleResult | null; status: AuctionStatus } {
  switch (bucket) {
    case 'VENDIDA':
      return { saleResult: SaleResult.ADJUDICADA, status: AuctionStatus.CONCLUIDA_PORTAL };
    case 'DESIERTA':
      return { saleResult: SaleResult.DESIERTA, status: AuctionStatus.CONCLUIDA_PORTAL };
    case 'CANCELADA':
      return { saleResult: null, status: AuctionStatus.CANCELADA };
    case 'FSR':
      return { saleResult: null, status: AuctionStatus.FINALIZADA_AUTORIDAD };
    // Seeded only in Zaragoza, and the row's `updatedAt` is what decides whether
    // it reads as CANCELADA or INDETERMINADO — see the backdate below.
    case 'SUSPENDED':
      return { saleResult: null, status: AuctionStatus.SUSPENDIDA };
  }
}

type Row = Record<string, unknown>;
const rows: Row[] = [];
let seq = 0;

/** A UTC date inside `(year, quarter)`, spread over the quarter's ~90 days. */
function dateIn(year: number, quarter: number, k: number): Date {
  const month = (quarter - 1) * 3 + (k % 3);
  return new Date(Date.UTC(year, month, 1 + (k % 28)));
}

function add(opts: {
  province: string;
  municipality: string;
  bucket: Bucket;
  tipo: string | null;
  year: number;
  quarter: number;
  k: number;
  /**
   * When true the row carries NO `endsAt` and is placed by `publishedAt` — the
   * COALESCE branch of `archiveNodeWhere`. 17,848 prod rows are like this.
   */
  undated?: boolean;
}) {
  seq++;
  const o = outcomeFields(opts.bucket);
  const d = dateIn(opts.year, opts.quarter, opts.k);
  rows.push({
    boeId: `V4FIX-${seq}`,
    title: `Vivienda en ${opts.municipality || 'ubicacion no informada'} n${seq}`,
    // A real SEO_CONCLUDED_INDEXABLE_CATEGORIES label, so the corpus is
    // representative rather than merely non-empty.
    category: 'Viviendas',
    province: opts.province,
    municipality: opts.municipality,
    status: o.status,
    inScope: true,
    saleResult: o.saleResult,
    soldPrice: o.saleResult === SaleResult.ADJUDICADA ? BigInt(100_000_00 + seq) : null,
    appraisalValue: 150_000,
    soldDate: o.saleResult === SaleResult.ADJUDICADA ? d : null,
    resultCheckedAt: new Date(Date.UTC(opts.year, 11, 31)),
    // Explicit NULL, never omitted: `undefined` would take the column default and
    // `resumeAt` is half of the stale-suspended predicate.
    resumeAt: null,
    endsAt: opts.undated ? null : d,
    // Non-null for 100% of rows — the placement fallback only works because of
    // that, and an undated row with no publishedAt would be unplaceable.
    publishedAt: d,
    auctionType: opts.tipo,
  });
}

/** Seed `count` rows into one (province, town, tipo, year, quarter) cell. */
function fill(opts: {
  province: string;
  municipality: string;
  tipo: string | null;
  year: number;
  quarter: number;
  count: number;
  buckets?: readonly Bucket[];
  undated?: boolean;
}) {
  const buckets = opts.buckets ?? ALL_BUCKETS;
  for (let k = 0; k < opts.count; k++) {
    add({
      province: opts.province,
      municipality: opts.municipality,
      bucket: buckets[k % buckets.length],
      tipo: opts.tipo,
      year: opts.year,
      quarter: opts.quarter,
      k,
      undated: opts.undated,
    });
  }
}

async function run() {
  if (!/@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('refusing to seed a non-loopback DATABASE_URL');
  }
  await prisma.auctionOutcomeStats.deleteMany({});
  await prisma.auction.deleteMany({});

  const Y = ARCHIVE_YEAR;
  const YP = ARCHIVE_YEAR_PREV;

  // ---- MADRID / MADRID: the ladder-descent + adaptive-leaf town -------------
  // t1 = 840 → 84/page × 10 pages exactly. t2..t4 keep the trimestre rung
  // non-degenerate so the planner actually descends onto t1.
  fill({ province: MADRID, municipality: 'MADRID', tipo: 'JUDICIAL', year: Y, quarter: 1, count: 840 });
  for (const q of [2, 3, 4]) {
    fill({ province: MADRID, municipality: 'MADRID', tipo: 'JUDICIAL', year: Y, quarter: q, count: 120 });
  }
  // The dense node: 300 is > 240 (sparse capacity) and <= 480 (dense capacity),
  // so it pages at 48 and does not split. Spread over four quarters.
  for (const q of [1, 2, 3, 4]) {
    fill({ province: MADRID, municipality: 'MADRID', tipo: 'JUDICIAL', year: YP, quarter: q, count: 75 });
  }
  // Second tipo under the town → the town's tipo rung is non-degenerate.
  for (const q of [1, 2]) {
    fill({ province: MADRID, municipality: 'MADRID', tipo: 'NOTARIAL', year: YP, quarter: q, count: 100 });
  }

  // ---- MADRID's other towns: the province's municipio rung ------------------
  fill({ province: MADRID, municipality: 'ALCOBENDAS', tipo: 'JUDICIAL', year: Y, quarter: 3, count: 30 });
  // ⚠️ endsAt NULL — placed by publishedAt. The COALESCE branch, seeded for the
  // first time here.
  fill({
    province: MADRID, municipality: 'GETAFE', tipo: 'JUDICIAL',
    year: Y, quarter: 2, count: 25, undated: true,
  });

  // ---- BARCELONA: the municipality-index province ---------------------------
  // Exactly ARCHIVE_PAGE_SIZE rows so the "small node pages at 24" assertion is
  // an equality, not an inequality that a bigger number would also satisfy.
  fill({
    province: BARCELONA, municipality: 'BARCELONA', tipo: 'JUDICIAL',
    year: Y, quarter: 1, count: 24, buckets: SOLD_ONLY,
  });
  // 205 one-row towns → 206 total, over HUB_MUNI_PREVIEW (60) and over one
  // MUNI_INDEX_PAGE_SIZE (200) page. The link graph is what is under test.
  for (let t = 1; t <= 205; t++) {
    add({
      province: BARCELONA,
      municipality: `BCNTOWN${String(t).padStart(3, '0')}`,
      bucket: t % 2 === 0 ? 'VENDIDA' : 'DESIERTA',
      tipo: 'JUDICIAL',
      year: Y,
      quarter: 1,
      k: t,
    });
  }

  // ---- outcome-parity provinces --------------------------------------------
  fill({ province: VALENCIA, municipality: 'VALENCIA', tipo: 'JUDICIAL', year: Y, quarter: 2, count: 40 });
  fill({ province: MALAGA, municipality: 'MALAGA', tipo: 'NOTARIAL', year: Y, quarter: 2, count: 40 });
  // No CANCELADA anywhere in Sevilla — `/resultados/canceladas/sevilla` is an
  // empty 200 today and its v4 facet would 404, which is exactly the case the
  // parent fallback exists for.
  fill({
    province: SEVILLA, municipality: 'SEVILLA', tipo: 'JUDICIAL',
    year: Y, quarter: 2, count: 40, buckets: SOLD_ONLY,
  });

  // ---- ZARAGOZA: the SUSPENDED branch, both sides of the staleness window ---
  // `outcomeWhere('CANCELADA')` is not just "status = CANCELADA": it ORs in
  // `staleSuspendedWhere` — suspended, resumption absent/past, untouched for
  // STALE_SUSPENDED_DAYS. Every previous fixture seeded zero suspended rows, so
  // that branch of the registry predicate has never executed against data, and
  // the residual INDETERMINADO bucket (a FRESHLY suspended row, which must be
  // excluded from the registry entirely) has never been proven to be excluded.
  //
  // Zaragoza is used because no assertion in either verify script names it: this
  // block adds coverage without moving a single asserted number.
  fill({
    province: ZARAGOZA, municipality: STALE_TOWN, tipo: 'JUDICIAL',
    year: Y, quarter: 4, count: 6, buckets: ['SUSPENDED'],
  });
  fill({
    province: ZARAGOZA, municipality: FRESH_TOWN, tipo: 'JUDICIAL',
    year: Y, quarter: 4, count: 6, buckets: ['SUSPENDED'],
  });

  // ---- the location-free shelf ---------------------------------------------
  // Province '' (NOT null — `Auction.province` is a non-null String and '' is
  // the sentinel `archiveNodeWhere` matches). Municipality '' too: a shelf row
  // makes no geo claim at all.
  fill({ province: NO_PROVINCE, municipality: '', tipo: 'JUDICIAL', year: YP, quarter: 1, count: 30 });
  fill({ province: NO_PROVINCE, municipality: '', tipo: 'JUDICIAL', year: Y, quarter: 1, count: 12 });
  fill({ province: NO_PROVINCE, municipality: '', tipo: 'NOTARIAL', year: YP, quarter: 2, count: 10 });
  // No province AND no tipo → nothing to place them by. Ken's ruling: reported
  // by `readUnplaceableCount`, never placed, never given an invented province.
  fill({ province: NO_PROVINCE, municipality: '', tipo: null, year: YP, quarter: 3, count: 2 });

  assertNoUndefinedFields(rows, 'forge-v4-fixture');
  await prisma.auction.createMany({ data: rows as never });

  // `Auction.updatedAt` is `@updatedAt`, so Prisma stamps it `now()` on insert
  // and a fixture CANNOT seed a stale row through the client. Backdating it in
  // SQL afterwards is the only way to put a row on the far side of the
  // STALE_SUSPENDED_DAYS window — and without that, `staleSuspendedWhere` is
  // dead code in every test we have. Parameterised, and scoped to the one town.
  const staleDays = STALE_SUSPENDED_DAYS + 5;
  await prisma.$executeRaw`
    UPDATE "Auction"
       SET "updatedAt" = now() - (${staleDays} || ' days')::interval
     WHERE province = ${ZARAGOZA} AND municipality = ${STALE_TOWN}`;

  // Read the states back OUT of Postgres — an in-memory check cannot see a
  // silently-defaulted column, which is the failure this fixture was born from.
  const dist = await prisma.auction.groupBy({ by: ['status'], _count: { _all: true } });
  const want: Record<string, number> = {};
  for (const r of rows) want[r.status as string] = (want[r.status as string] ?? 0) + 1;
  assertDistribution(
    dist.map((d) => ({ value: d.status as string, count: d._count._all })),
    want,
    'status',
  );

  // ---- rollups --------------------------------------------------------------
  // `readSummary` / `concludedMunicipioRegions` read these, and they are what
  // makes a town slug RESOLVE at all. Derived from the same array that was just
  // inserted, so they cannot drift from it.
  //
  // ⭐ T2 (Ken, 2026-08-13): the bucket is decided by the APP's classifier, not
  // by a ternary chain written here. This file used to carry a hand-rolled
  // "adjudicada means…" — a third definition alongside `auctionOutcome()` and
  // the rollup CSV's SQL CASE — and a fixture that disagrees with the app about
  // what a row IS produces a hub that links towns it then 404s. It also silently
  // mis-bucketed every SUSPENDIDA row before Zaragoza existed to expose it.
  const now = new Date();
  const tally = new Map<string, number>();
  for (const r of rows) {
    const outcome = auctionOutcome(
      {
        status: r.status as string,
        saleResult: r.saleResult as SaleResult | null,
        resumeAt: r.resumeAt as Date | null,
        // The backdated rows are stale by construction; everything else was just
        // inserted, so `now` is the honest `updatedAt` for them.
        updatedAt:
          r.province === ZARAGOZA && r.municipality === STALE_TOWN
            ? new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000)
            : now,
      },
      now,
    );
    // INDETERMINADO is the residual — it is not a registry bucket and must never
    // reach the rollup, or a freshly-suspended row starts counting as archive.
    if (outcome === 'INDETERMINADO') continue;
    const province = r.province as string;
    const municipality = r.municipality as string;
    // ⛔ NO ROLLUP FOR THE SHELF. In `AuctionOutcomeStats`, province '' does not
    // mean "no province" — it is the NATIONAL rollup sentinel (see the schema
    // comment). Emitting province-less auctions there would silently overwrite
    // the national totals with the shelf's 54 rows. The shelf reads live counts
    // via `archiveNodeWhere({})`, so it needs no rollup at all.
    if (!province) continue;
    for (const key of [`${province}||${municipality}||${outcome}`, `${province}||||${outcome}`]) {
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  await prisma.auctionOutcomeStats.createMany({
    data: [...tally].map(([key, count]) => {
      const [province, municipality, outcome] = key.split('||');
      return { period: 'ALL', periodBasis: 'CONCLUDED', province, municipality, category: '', outcome, count };
    }) as never,
  });

  console.log(
    `seeded ${rows.length} auctions, ${tally.size} rollup rows ` +
      `(ARCHIVE_YEAR=${Y}, ARCHIVE_YEAR_PREV=${YP})`,
  );
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
