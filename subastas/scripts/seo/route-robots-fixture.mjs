#!/usr/bin/env node
/**
 * route-robots-fixture.mjs — seed a THROWAWAY Postgres with the exact rows the
 * route-level robots gate asserts on, and emit the case file it consumes.
 *
 * ⚠️ NEVER point this at prod. It writes. It refuses to run unless
 * DATABASE_URL names a local host, and it only ever touches the six boeIds
 * listed below.
 *
 * The field values are COPIED FROM PROD (read-only SELECT, 2026-09-17) so the
 * gate exercises the real data shapes, including the two rows content bar v1
 * noindexed for having 17 and 3 words of prose. A fixture that cannot express
 * the prod shape proves nothing.
 *
 *   node scripts/seo/route-robots-fixture.mjs --out .seo-gate-cases.json
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const out = (() => {
  const i = process.argv.indexOf('--out');
  return i === -1 ? '.seo-gate-cases.json' : process.argv[i + 1];
})();

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error(`REFUSING: DATABASE_URL must be a local throwaway database, got: ${url.replace(/:[^:@]*@/, ':***@')}`);
  process.exit(2);
}

const d = (s) => new Date(s);
const ROWS = [
  {
    boeId: 'SUB-JV-2019-131164',
    category: 'Viviendas', province: 'Tarragona', municipality: 'Constantí',
    status: 'CONCLUIDA_PORTAL', saleResult: 'DESIERTA', soldPrice: null, valorSubasta: 60928,
    endsAt: d('2019-08-19T18:00:00Z'), soldDate: d('2019-08-19T18:00:00Z'),
    lotDescription: 'URBANA NÚMERO DOCE. VIVIENDA NÚMERO SEIS, de la Escalera número dos ' + 'palabra '.repeat(70),
    address: 'Carrer Major 12', expect: 'index,follow', note: '80 prose words — indexable under v1 too',
  },
  {
    boeId: 'SUB-AT-2021-21R0886001147',
    category: 'Viviendas', province: 'Lleida', municipality: 'Prats i Sansor',
    status: 'CONCLUIDA_PORTAL', saleResult: 'ADJUDICADA', soldPrice: 6000000n, valorSubasta: 116558.23,
    endsAt: d('2021-07-28T18:00:00Z'), soldDate: d('2021-07-28T18:00:00Z'),
    lotDescription: '1/2 INDIVISA-URBANA: ENTIDAD NÚMERO OCHO.-CASA SEÑALADA ' + 'palabra '.repeat(100),
    address: 'Carrer del Sol 3', expect: 'index,follow', note: '109 prose words — indexable under v1 too',
  },
  {
    boeId: 'SUB-JA-2023-221047',
    category: 'Viviendas', province: 'Badajoz', municipality: 'Olivenza',
    status: 'CONCLUIDA_PORTAL', saleResult: 'DESIERTA', soldPrice: null, valorSubasta: 88089.87,
    endsAt: d('2023-12-11T18:00:00Z'), soldDate: d('2023-12-11T18:00:00Z'),
    lotDescription: 'Urbana nº 5. Vivienda tipo A, planta segunda, del edificio en calle Real',
    address: 'Calle Real 5', expect: 'index,follow', note: '17 words — NOINDEX under v1, the regression this wave fixes',
  },
  {
    boeId: 'SUB-JA-2025-246541',
    category: 'Viviendas', province: 'Granada', municipality: 'Albuñuelas',
    status: 'CONCLUIDA_PORTAL', saleResult: 'DESIERTA', soldPrice: null, valorSubasta: 99301.46,
    endsAt: d('2025-06-11T18:00:00Z'), soldDate: d('2025-06-11T18:00:00Z'),
    lotDescription: 'CASA EN ALBUÑUELAS',
    address: 'Calle Iglesia 1', expect: 'index,follow', note: '3 words — NOINDEX under v1, the regression this wave fixes',
  },
  {
    boeId: 'SUB-AT-2018-18R0786001011',
    category: 'Terrenos', province: 'Illes Balears', municipality: 'Felanitx',
    status: 'CONCLUIDA_PORTAL', saleResult: 'ADJUDICADA', soldPrice: 600000n, valorSubasta: 23510.93,
    endsAt: d('2018-11-05T19:34:48Z'), soldDate: d('2018-11-05T19:34:48Z'),
    lotDescription: 'RUSTICA.- TIERRA SECANO SITA EN TERMINO DE FELANITX, LLAMADA ' + 'palabra '.repeat(50),
    address: 'Poligono 57 Parcela 99', expect: 'index,follow',
    note: 'the "v3-route inconsistency" row — asserted over BOTH routes',
    v3: '/subastas/illes-balears/felanitx/terreno-poligono-57-parcela-99-18r0786001011',
  },
  // Two ACTIVE rows so the town hubs have crawlable inventory: hub-ssr-check
  // asserts a hub server-renders >= 1 auction-detail anchor, which no concluded
  // row can satisfy (the hub list is the ACTIVE band). Without these the local
  // hub run is a false RED for a fixture reason. No case is emitted for them.
  {
    boeId: 'SUB-GATE-ACTIVE-0001', hubOnly: true,
    category: 'Viviendas', province: 'Badajoz', municipality: 'Olivenza',
    status: 'CELEBRANDOSE', saleResult: null, soldPrice: null, valorSubasta: 75000,
    endsAt: d('2026-12-01T18:00:00Z'), soldDate: null,
    lotDescription: 'Vivienda en calle Mayor, Olivenza', address: 'Calle Mayor 3',
  },
  {
    boeId: 'SUB-GATE-ACTIVE-0002', hubOnly: true,
    category: 'Viviendas', province: 'Granada', municipality: 'Albuñuelas',
    status: 'CELEBRANDOSE', saleResult: null, soldPrice: null, valorSubasta: 82000,
    endsAt: d('2026-12-05T18:00:00Z'), soldDate: null,
    lotDescription: 'Vivienda en calle Iglesia, Albuñuelas', address: 'Calle Iglesia 9',
  },
  {
    boeId: 'SUB-GATE-STUB-0001',
    category: 'Viviendas', province: 'Madrid', municipality: null,
    status: 'CONCLUIDA_PORTAL', saleResult: 'SIN_RESULTADO', soldPrice: null, valorSubasta: null,
    endsAt: d('2025-01-15T18:00:00Z'), soldDate: null,
    lotDescription: null, address: null,
    expect: 'noindex,follow', note: 'the STUB arm: no municipality AND no outcome — must stay noindex',
  },
];

// Prisma 7 requires a driver adapter — same PrismaPg the app uses.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const cases = [];
  for (const r of ROWS) {
    const { expect, note, v3, hubOnly, ...data } = r;
    const row = await prisma.auction.upsert({
      where: { boeId: r.boeId },
      update: data,
      create: {
        ...data,
        title: null,
        auctionType: 'JUDICIAL',
        inScope: true,
        publishedAt: data.endsAt ?? new Date('2020-01-01'),
        resultCheckedAt: r.saleResult === 'SIN_RESULTADO' ? null : new Date('2026-01-01'),
      },
      select: { id: true },
    });
    // The legacy route resolves a trailing >=20-char cuid, so the id alone is a
    // valid slug; it 301s to the canonical path, which is what we then assert.
    if (hubOnly) continue;
    cases.push({ boeId: r.boeId, path: `/subastas/subasta/${row.id}`, expect, note });
    if (v3) {
      // auction_url_v3 is @@ignore'd in the schema (owned by the minter), so it
      // is written raw — the same table the v3 route probes on its unique index.
      await prisma.$executeRaw`DELETE FROM auction_url_v3 WHERE auction_id = ${row.id} OR url = ${v3}`;
      await prisma.$executeRaw`
        INSERT INTO auction_url_v3 (auction_id, boe_id, url, province_slug, town_slug, town_source, ref_tail, truncated)
        VALUES (${row.id}, ${r.boeId}, ${v3}, 'illes-balears', 'felanitx', 'stored-gazetteer', '18r0786001011', false)`;
      cases.push({
        boeId: r.boeId, path: v3, expect,
        note: `${note} (v3 route — must match the legacy route's value exactly)`,
      });
    }
  }
  writeFileSync(out, JSON.stringify(cases, null, 2));
  console.log(`seeded ${ROWS.length} rows, wrote ${cases.length} cases to ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
