/**
 * Tests for the v3 descriptor pipeline — with the 200-char ceiling asserted as
 * a STRUCTURAL INVARIANT, not an observed property of today's corpus.
 *
 * Run: npx tsx src/lib/seo/descriptor-v3.test.ts
 */
import {
  buildAuctionPathV3, buildDescriptorV3, capDescriptorV3, refTail,
  losesIdentifyingDetail, stripTrailingLocality, compactUnit,
  MAX_DESCRIPTOR_LEN_V3, MAX_URL_LEN_V3,
} from './descriptor-v3';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const section = (t: string) => console.log(`\n# ${t}`);

section('⭐ 200-char ceiling is STRUCTURAL — adversarial inputs cannot breach it');
{
  // A town slug far longer than anything in the corpus (corpus max was 70 raw).
  const monsterTown = 'a'.repeat(140);
  const monsterRef = 'sub-jv-' + '9'.repeat(80);
  const monsterDesc = 'calle-' + 'x'.repeat(400);

  const cases: Array<[string, Parameters<typeof buildAuctionPathV3>[0]]> = [
    ['long descriptor', { provinceSlug: 'madrid', townSlug: 'madrid', category: 'Viviendas', descriptor: monsterDesc, ref: 'sub-ja-2020-1' }],
    ['long town', { provinceSlug: 'madrid', townSlug: monsterTown, category: 'Viviendas', descriptor: 'calle-mayor-1', ref: 'sub-ja-2020-1' }],
    ['long ref', { provinceSlug: 'madrid', townSlug: 'madrid', category: 'Viviendas', descriptor: 'calle-mayor-1', ref: monsterRef }],
    ['long everything', { provinceSlug: 'x'.repeat(40), townSlug: monsterTown, category: 'Viviendas', descriptor: monsterDesc, ref: monsterRef }],
    ['empty descriptor', { provinceSlug: 'madrid', townSlug: 'madrid', category: 'Viviendas', descriptor: '', ref: 'sub-ja-2020-1' }],
  ];

  for (const [label, args] of cases) {
    const r = buildAuctionPathV3(args);
    const within = r.url.length <= MAX_URL_LEN_V3 || r.structuralOverflow;
    ok(`${label}: url <= ${MAX_URL_LEN_V3} (or flagged overflow)`, within, `len=${r.url.length} overflow=${r.structuralOverflow}`);
    // The ref is inviolable in EVERY case.
    ok(`${label}: ref survives intact`, r.url.endsWith(`-${args.ref}`), r.url.slice(-60));
    // The location is inviolable in EVERY case.
    ok(`${label}: location survives intact`,
      r.url.startsWith(`/subastas/${args.provinceSlug}/${args.townSlug}/`), r.url.slice(0, 60));
  }
}
{
  // Randomised property sweep — the invariant must hold for arbitrary sizes.
  let worst = 0;
  let breaches = 0;
  for (let i = 0; i < 3000; i += 1) {
    const t = 'b'.repeat(1 + (i % 90));
    const ref = 'sub-' + '7'.repeat(1 + (i % 60));
    const d = 'calle-' + 'y'.repeat(i % 300);
    const r = buildAuctionPathV3({ provinceSlug: 'valencia', townSlug: t, category: 'Garajes', descriptor: d, ref });
    if (!r.structuralOverflow && r.url.length > MAX_URL_LEN_V3) breaches += 1;
    worst = Math.max(worst, r.structuralOverflow ? 0 : r.url.length);
  }
  ok('3000 randomised shapes: zero non-overflow breaches', breaches === 0, `breaches=${breaches}`);
  ok('worst non-overflow length is within the ceiling', worst <= MAX_URL_LEN_V3, `worst=${worst}`);
}
{
  // When location+ref alone blow the budget, we must REFUSE, not emit a long url.
  const r = buildAuctionPathV3({
    provinceSlug: 'p'.repeat(100), townSlug: 't'.repeat(100),
    category: 'Viviendas', descriptor: 'calle-mayor', ref: 'r'.repeat(60),
  });
  ok('location+ref over budget sets structuralOverflow', r.structuralOverflow === true);
  ok('overflow still keeps ref + location intact (nothing silently cut)',
    r.url.includes('p'.repeat(100)) && r.url.endsWith('r'.repeat(60)));
}

section('ceiling trim never eats the descriptor when there is room');
{
  const r = buildAuctionPathV3({
    provinceSlug: 'madrid', townSlug: 'madrid', category: 'Viviendas',
    descriptor: 'calle-mayor-12-pl3-b', ref: 'sub-ja-2020-1',
  });
  ok('short url is untouched', r.url === '/subastas/madrid/madrid/vivienda-calle-mayor-12-pl3-b-sub-ja-2020-1', r.url);
  ok('no ceiling trim flagged', r.ceilingTrimmed === false);
}

section('descriptor cap + word boundary');
{
  ok('cap default is 100', MAX_DESCRIPTOR_LEN_V3 === 100);
  const s = 'calle-de-la-constitucion-numero-catorce-planta-tercera-puerta-b-edificio-las-palmeras-bloque-dos';
  const c = capDescriptorV3(s, 40);
  ok('never cuts mid-word', !c.endsWith('-') && s.startsWith(c) && (s[c.length] === '-' || s.length === c.length), c);
  ok('respects the max', c.length <= 40, `${c.length}`);
  ok('short strings pass through', capDescriptorV3('calle-mayor', 100) === 'calle-mayor');
}

section('ref tail');
{
  ok('plain ref lowercased', refTail('SUB-JA-2020-145159') === 'sub-ja-2020-145159');
  ok('lote expanded', refTail('SUB-GA-2026-2801400126E01-L10') === 'sub-ga-2026-2801400126e01-lote-10');
  ok('a bare id ending in a digit is not mistaken for a lote',
    refTail('SUB-JA-2016-39551') === 'sub-ja-2016-39551');
}

section('locality stripping');
{
  ok('trailing town removed',
    stripTrailingLocality('calle-mayor-12-madrid', 'madrid', 'madrid') === 'calle-mayor-12');
  ok('trailing postcode removed',
    stripTrailingLocality('calle-mayor-12-28001', 'madrid', 'madrid') === 'calle-mayor-12');
  ok('stacked town+province+postcode removed',
    stripTrailingLocality('calle-agropecuaria-n-6-03312-desamparados-alicante', 'desamparados', 'alicante')
      === 'calle-agropecuaria-n-6');
  ok('a street named after its town keeps its name',
    stripTrailingLocality('calle-valencia-12', 'valencia', 'valencia') === 'calle-valencia-12');
  ok('descriptor that is ONLY the town returns empty',
    stripTrailingLocality('madrid', 'madrid', 'madrid') === '');
  ok('compactUnit folds cadastral tokens',
    compactUnit('calle-mayor-es-1-pl-3-pt-d') === 'calle-mayor-pl3-d', compactUnit('calle-mayor-es-1-pl-3-pt-d'));
}

section('identifying-detail probe (drives the HOLD list)');
{
  ok('dropped street marker counts as identifying',
    losesIdentifyingDetail('urbana-n-15-piso-duplex-calle-cesar-augusto-n-14', 'urbana-n-15-piso-duplex'));
  ok('dropped unit designator counts as identifying',
    losesIdentifyingDetail('finca-num-29-vivienda-1111-planta-1-bloque-xi', 'finca-num-29-vivienda-1111-planta-1'));
  ok('dropped locality noise does NOT count',
    !losesIdentifyingDetail('calle-mayor-12-alacant', 'calle-mayor-12-alacant'));
  ok('no truncation -> never identifying loss',
    !losesIdentifyingDetail('calle-mayor-12', 'calle-mayor-12'));
}

section('full pipeline');
{
  const d = buildDescriptorV3({
    address: 'CALLE LIBRA , 79-BLOQUE 1- 4º D, 41006, SEVILLA, Sevilla',
    townSlug: 'sevilla', provinceSlug: 'sevilla',
  });
  ok('postcode + town + province stripped from the tail',
    !/41006|sevilla/.test(d.descriptor), d.descriptor);
  ok('street + number + block + door retained',
    /libra/.test(d.descriptor) && /79/.test(d.descriptor) && /bloque/.test(d.descriptor), d.descriptor);
  ok('not truncated at 100', d.truncated === false);
  ok('guard signals empty on a clean address', d.signals.length === 0);
}
{
  const d = buildDescriptorV3({
    address: 'LICENCIA DE AUTOTAXI Nº 12.767, MATRICULA 5751GTS, 28032, MADRID, Madrid',
    townSlug: 'madrid', provinceSlug: 'madrid',
  });
  ok('guard runs inside the pipeline', d.signals.length > 0);
  ok('plate never reaches the descriptor', !/5751/.test(d.descriptor), d.descriptor);
}

console.log(
  failures === 0
    ? `\nAll descriptor-v3 tests passed (${checks} checks).`
    : `\n${failures} FAILURE(S) of ${checks} checks.`,
);
process.exit(failures === 0 ? 0 : 1);
