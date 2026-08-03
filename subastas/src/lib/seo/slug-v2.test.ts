/**
 * Unit tests for the v2 category-first auction slug engine.
 * Run with: npx tsx src/lib/seo/slug-v2.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention;
 * `vitest` is NOT a dependency of this package and importing it breaks tsc).
 *
 * Whole-corpus uniqueness is proven separately by
 * `scripts/slug-v2-corpus-proof.ts` (240,890 rows → 0 duplicate slugs).
 */
import {
  buildAuctionPathV2,
  buildAuctionSlugV2Segment,
  capDescriptor,
  categoryKeyword,
  provinceSegment,
  townSegment,
  shortId,
  MAX_DESCRIPTOR_LEN,
  SHORT_ID_LEN,
  type AuctionForSlugV2,
} from './slug-v2';
import { PROVINCE_DB_KEY_TO_SLUG, RESERVED_SEGMENTS } from './slugs';

let failures = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${got === undefined ? '' : `  — got: ${String(got)}`}`);
  }
}
function eq(name: string, actual: string, expected: string) {
  check(name, actual === expected, actual === expected ? undefined : `${actual} !== ${expected}`);
}

const base: AuctionForSlugV2 = {
  id: 'ckq1abcd23xyz', // last 8 → 'bcd23xyz'
  category: null,
  province: 'Madrid',
  municipality: 'Móstoles',
  address: null,
  title: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleYear: null,
};
const SID = 'bcd23xyz';

// ── Category keyword map ────────────────────────────────────────────────────
console.log('\n# category keyword map');
eq('Viviendas → vivienda', categoryKeyword('Viviendas'), 'vivienda');
eq('Turismos → coche', categoryKeyword('Turismos'), 'coche');
eq('Motocicletas → moto', categoryKeyword('Motocicletas'), 'moto');
eq('Barcos → barco', categoryKeyword('Barcos'), 'barco');
eq('Vehículos Industriales → camion', categoryKeyword('Vehículos Industriales'), 'camion');
eq('null category → subasta', categoryKeyword(null), 'subasta');
eq('off-taxonomy label → slugified', categoryKeyword('Algo Raro'), 'algo-raro');

// ── Property path ───────────────────────────────────────────────────────────
console.log('\n# property path');
eq(
  'street + number + compacted unit, escalera dropped, ALWAYS suffixed',
  buildAuctionPathV2({ ...base, category: 'Viviendas', address: 'avenida portugal , 16 , es 1 pl 4 pt c' }),
  `/madrid/mostoles/vivienda-avenida-portugal-16-pl4-c-${SID}`,
);
eq(
  'house-style title parsed when address is empty; town NOT duplicated',
  buildAuctionSlugV2Segment({
    ...base, municipality: 'Colmenarejo', category: 'Viviendas',
    title: 'Subasta de Vivienda en calle praofuentes, Colmenarejo',
  }),
  `vivienda-calle-praofuentes-${SID}`,
);
eq(
  'a street that merely CONTAINS the town name mid-string is preserved',
  buildAuctionSlugV2Segment({
    ...base, province: 'Valencia', municipality: 'Valencia',
    category: 'Viviendas', address: 'calle valencia 12',
  }),
  `vivienda-calle-valencia-12-${SID}`,
);
eq(
  'missing municipality → sin-municipio',
  buildAuctionPathV2({ ...base, municipality: null, category: 'Garajes', address: 'calle real , 32' }),
  `/madrid/sin-municipio/garaje-calle-real-32-${SID}`,
);
eq(
  'no address AND no title → {category}-{town}-{shortId}',
  buildAuctionSlugV2Segment({ ...base, category: 'Trasteros' }),
  `trastero-mostoles-${SID}`,
);
eq(
  'the "unknown" address sentinel is treated as absent',
  buildAuctionSlugV2Segment({ ...base, category: 'Viviendas', address: 'Unknown' }),
  `vivienda-mostoles-${SID}`,
);
eq(
  'BOILERPLATE title is NOT parsed (regression: the un-anchored /\\ben\\s+/ bug)',
  buildAuctionSlugV2Segment({
    ...base, municipality: 'Madrid', category: 'Viviendas',
    title: 'de la entidad especializada designada ACTIVOS CONCURSALES S.L. en cuya página podrán verificarse cuantos datos',
  }),
  `vivienda-madrid-${SID}`,
);

// ── Accents and ñ ───────────────────────────────────────────────────────────
console.log('\n# accents and ñ');
eq(
  'accents folded in the street',
  buildAuctionSlugV2Segment({ ...base, category: 'Viviendas', address: 'C/. POETA JOSÉ CERVERA I GRIPOL Nº 14' }),
  `vivienda-c-poeta-jose-cervera-i-gripol-n-14-${SID}`,
);
eq(
  'ñ → n in both town and street',
  buildAuctionPathV2({ ...base, province: 'A Coruña', municipality: 'A Coruña', category: 'Viviendas', address: 'Calle Peñañeja 3' }),
  `/a-coruna/a-coruna/vivienda-calle-penaneja-3-${SID}`,
);
check(
  'every emitted segment is ASCII-safe (Álava / Ávila / Camí dels Òrrius, 4ª)',
  /^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(
    buildAuctionPathV2({ ...base, province: 'Álava', municipality: 'Ávila', category: 'Fincas rústicas', address: 'Camí dels Òrrius, 4ª' }),
  ),
);

// ── Length cap ──────────────────────────────────────────────────────────────
console.log('\n# length cap');
{
  const long = 'calle-de-la-santisima-trinidad-de-los-remedios-numero-cuarenta-y-cinco';
  const capped = capDescriptor(long);
  check('capped length ≤ MAX_DESCRIPTOR_LEN', capped.length <= MAX_DESCRIPTOR_LEN, capped.length);
  check('no dangling hyphen', !capped.endsWith('-'), capped);
  check('cut landed on a WORD boundary (whole-token prefix)', long.startsWith(`${capped}-`), capped);
  check('a single oversized token is hard-cut', capDescriptor('x'.repeat(120)).length === MAX_DESCRIPTOR_LEN);
  eq('a short descriptor is untouched', capDescriptor('calle-real-32'), 'calle-real-32');
}
{
  const seg = buildAuctionSlugV2Segment({
    ...base, category: 'Viviendas',
    address: 'C/. POETA JOSÉ CERVERA I GRIPOL Nº 14-BLOQUE 7-13ª-77ª, VALENCIA',
  });
  check(
    'a real 64-char cadastral address is bounded end to end',
    seg.length <= 'vivienda-'.length + MAX_DESCRIPTOR_LEN + 1 + SHORT_ID_LEN,
    `${seg} (${seg.length})`,
  );
  check('…and still carries the id suffix', seg.endsWith(`-${SID}`), seg);
}

// ── Collisions (the BLOCKER this version exists to fix) ─────────────────────
console.log('\n# collisions');
{
  const sameAddress = {
    ...base, category: 'Viviendas', province: 'Madrid', municipality: 'Móstoles',
    address: 'avenida portugal 16',
  };
  const a = buildAuctionPathV2({ ...sameAddress, id: 'ckq1aaaa11aaa1' });
  const b = buildAuctionPathV2({ ...sameAddress, id: 'ckq1bbbb22bbb2' });
  eq('same-address auction A', a, '/madrid/mostoles/vivienda-avenida-portugal-16-aa11aaa1');
  eq('same-address auction B', b, '/madrid/mostoles/vivienda-avenida-portugal-16-bb22bbb2');
  check('two auctions at ONE address get DIFFERENT URLs', a !== b);
  check(
    'the descriptor is identical — only the id suffix separates them',
    a.slice(0, -SHORT_ID_LEN) === b.slice(0, -SHORT_ID_LEN),
  );

  const noDesc = { ...base, category: 'Turismos' };
  check(
    'two descriptor-less rows in one town also differ',
    buildAuctionSlugV2Segment({ ...noDesc, id: 'aaa111' }) !== buildAuctionSlugV2Segment({ ...noDesc, id: 'bbb222' }),
  );
}

// ── Vehicles ────────────────────────────────────────────────────────────────
console.log('\n# vehicles');
eq(
  'uses the STRUCTURED make/model/year columns, not the (empty) title',
  buildAuctionSlugV2Segment({
    ...base, category: 'Turismos', address: 'CALLE JUAN SEBASTIAN ELCANO, 22',
    vehicleMake: 'BMW', vehicleModel: 'SERIE 5 520D TOURING', vehicleYear: 2011,
  }),
  `coche-bmw-serie-5-520d-touring-2011-${SID}`,
);
eq(
  'accented make folded',
  buildAuctionSlugV2Segment({ ...base, category: 'Turismos', vehicleMake: 'Citroën', vehicleModel: 'JUMPER', vehicleYear: 2010 }),
  `coche-citroen-jumper-2010-${SID}`,
);
eq(
  'nonsense year omitted',
  buildAuctionSlugV2Segment({ ...base, category: 'Motocicletas', vehicleMake: 'Yamaha', vehicleModel: 'GPD125-A', vehicleYear: 0 }),
  `moto-yamaha-gpd125-a-${SID}`,
);
eq(
  'no extract → town fallback; a vehicle NEVER uses its address (that is the depositary)',
  buildAuctionSlugV2Segment({ ...base, category: 'Turismos', address: 'Pol.Francolí' }),
  `coche-mostoles-${SID}`,
);
eq(
  'a vehicle title is ignored entirely',
  buildAuctionSlugV2Segment({ ...base, category: 'Barcos', title: 'Subasta de un barco muy bonito en Denia' }),
  `barco-mostoles-${SID}`,
);

// ── Idempotency + degenerate input ──────────────────────────────────────────
console.log('\n# idempotency and degenerate input');
{
  const row = { ...base, category: 'Viviendas', address: 'avenida portugal , 16 , es 1 pl 4 pt c' };
  const once = buildAuctionSlugV2Segment(row);
  check('re-running the generator yields the identical segment', buildAuctionSlugV2Segment(row) === once);
  check('segment is a clean hyphen-joined token list', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(once), once);
  check('no double / leading / trailing hyphen', !/--|^-|-$/.test(once), once);
}
eq(
  'whitespace-only fields still yield a valid slug',
  buildAuctionSlugV2Segment({ ...base, category: 'Viviendas', address: '   ', title: '   ' }),
  `vivienda-mostoles-${SID}`,
);
eq(
  'a descriptor that is ONLY the town degrades to the town fallback',
  buildAuctionSlugV2Segment({ ...base, category: 'Viviendas', title: 'Subasta de Vivienda en Móstoles' }),
  `vivienda-mostoles-${SID}`,
);
eq('shortId never returns empty for a punctuation-only id', shortId('---'), 'x');
eq('shortId takes the last SHORT_ID_LEN alphanumerics', shortId('ckq1abcd23xyz'), SID);
eq(
  'every field null → still a well-formed path',
  buildAuctionPathV2({ id: 'zzz999', category: null, province: null, municipality: null, address: null, title: null }),
  '/espana/sin-municipio/subasta-sin-municipio-zzz999',
);

// ── Reserved-segment safety (07 §1.6) ───────────────────────────────────────
console.log('\n# reserved-segment safety');
{
  const clashes = Object.values(PROVINCE_DB_KEY_TO_SLUG).filter((s) => RESERVED_SEGMENTS.has(s));
  check(
    'NO canonical province slug shadows a reserved ROOT segment (/guia, /api, …)',
    clashes.length === 0,
    clashes.join(','),
  );
  check(
    'every province slug is URL-safe',
    Object.values(PROVINCE_DB_KEY_TO_SLUG).every((s) => /^[a-z0-9-]+$/.test(s)),
  );
  eq('a would-be-reserved province is namespaced, not shadowing', provinceSegment('guia'), 'provincia-guia');
  eq('a would-be-reserved town is namespaced, not shadowing', townSegment('api'), 'municipio-api');
}

if (failures) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll slug-v2 tests passed.');
