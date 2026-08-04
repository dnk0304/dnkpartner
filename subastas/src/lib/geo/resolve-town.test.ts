/**
 * Tests for the town precedence ladder (Ken ruling 2026-08-04).
 * Run: npx tsx src/lib/geo/resolve-town.test.ts
 *
 * The load-bearing assertion is the CONTRADICTION rule: lenient means fall back
 * when CP-MUNI is SILENT, never override when it DISAGREES.
 */
import { resolveTown } from './resolve-town';
import { lookupMunicipality, gazetteerSize } from './municipality-gazetteer';
import { resolveCpMunicipality } from './cp-municipality';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n# ${t}`);

section('gazetteer is loaded and sane');
ok('gazetteer has thousands of entries', gazetteerSize() > 7000, `size=${gazetteerSize()}`);
ok('Sevilla resolves to the real INE 41091 (tiering works)', lookupMunicipality('Sevilla')?.ine === '41091',
  JSON.stringify(lookupMunicipality('Sevilla')));
ok('co-official Elx resolves', lookupMunicipality('Elx') !== null);
ok('Castilian Elche resolves to the same code as Elx',
  lookupMunicipality('Elche')?.ine === lookupMunicipality('Elx')?.ine);
ok('bilingual compound Vitoria-Gasteiz resolves', lookupMunicipality('Vitoria-Gasteiz') !== null);
ok('a typo does NOT resolve (no fuzzy matching)', lookupMunicipality('Vitoria-Gaseiz') === null);
ok('an address fragment does NOT resolve',
  lookupMunicipality('Cala de Bou, San Agustin, Termino Municipal de Sant Josep de Sa Talaia') === null);

section('rung 1 — CP-MUNI deterministic');
{
  // 07839 is the breach row's postcode; CP-MUNI maps it to Sant Josep de sa Talaia.
  const cp = resolveCpMunicipality('07839');
  ok('fixture postcode 07839 is mapped in the table', cp.status === 'mapped');
  const r = resolveTown({
    postalCode: '07839',
    storedMunicipality: 'Cala de Bou, San Agustin, Termino Municipal de Sant Josep de Sa Talaia',
    province: 'Illes Balears',
  });
  ok('CP-MUNI wins over an unvalidated stored string',
    r.status === 'resolved' && r.source === 'cp-muni', JSON.stringify(r));
  ok('emits the INE canonical name',
    r.status === 'resolved' && r.municipality === 'Sant Josep de sa Talaia', JSON.stringify(r));
  ok('junk stored value is NOT treated as a conflict', r.status === 'resolved');
}

section('⭐ contradictions DEGRADE — never choose');
{
  const r = resolveTown({
    postalCode: '07839', // -> Sant Josep de sa Talaia
    storedMunicipality: 'Sevilla', // a REAL municipality that disagrees
    province: 'Illes Balears',
  });
  ok('CP-MUNI vs validated stored disagreement degrades to province',
    r.status === 'degraded' && r.reason === 'conflict-cp-vs-stored', JSON.stringify(r));
  ok('it picks NEITHER side', r.status === 'degraded');
  ok('the conflict records both claims for the signal',
    r.status === 'degraded' && r.cpMunicipality === 'Sant Josep de sa Talaia' && r.storedMunicipality === 'Sevilla');
}
{
  // Agreement across a spelling/case difference must NOT be counted a conflict.
  const r = resolveTown({
    postalCode: '07839',
    storedMunicipality: 'SANT JOSEP DE SA TALAIA',
    province: 'Illes Balears',
  });
  ok('case/spelling agreement is agreement, not conflict',
    r.status === 'resolved' && r.source === 'cp-muni', JSON.stringify(r));
}

section('rung 2 — stored municipality, gazetteer-validated');
{
  const r = resolveTown({ postalCode: null, storedMunicipality: 'Elx', province: 'Alicante' });
  ok('CP silent + gazetteer hit resolves via stored',
    r.status === 'resolved' && r.source === 'stored-gazetteer', JSON.stringify(r));
  ok('emits the INE official denomination, not the corpus spelling',
    r.status === 'resolved' && r.ine === lookupMunicipality('Elx')?.ine);
}
{
  const r = resolveTown({ postalCode: '00000', storedMunicipality: 'Sevilla', province: 'Sevilla' });
  ok('an unmapped postcode falls through to rung 2',
    r.status === 'resolved' && r.source === 'stored-gazetteer', JSON.stringify(r));
}

section('⭐ rung 2 province cross-check (the 630-url mint defect)');
{
  // "Oropesa" is a real municipality in TOLEDO; the Castellon rows mean
  // "Oropesa del Mar". Gazetteer validation alone would happily place a
  // Castellon auction in Toledo.
  const a = resolveTown({ postalCode: null, storedMunicipality: 'Oropesa', province: 'Castellón' });
  ok('a real municipality in the WRONG province degrades',
    a.status === 'degraded' && a.reason === 'province-mismatch-stored', JSON.stringify(a));

  const b = resolveTown({ postalCode: null, storedMunicipality: 'Madrid', province: 'A Coruña' });
  ok('plainly wrong province/town pair degrades',
    b.status === 'degraded' && b.reason === 'province-mismatch-stored', JSON.stringify(b));

  const c = resolveTown({ postalCode: null, storedMunicipality: 'Oropesa', province: 'Toledo' });
  ok('the SAME name resolves when the province agrees',
    c.status === 'resolved' && c.source === 'stored-gazetteer', JSON.stringify(c));

  const d = resolveTown({ postalCode: null, storedMunicipality: 'Palma', province: 'Illes Balears' });
  ok('province name variants compare equal (Illes Balears/Baleares)',
    d.status === 'resolved', JSON.stringify(d));
}

section('rung 3 — degrade to the province page');
{
  const a = resolveTown({ postalCode: null, storedMunicipality: 'Vitoria-Gaseiz', province: 'Álava' });
  ok('a typo degrades (never snapped to the nearest name)',
    a.status === 'degraded' && a.reason === 'stored-not-in-gazetteer', JSON.stringify(a));

  const b = resolveTown({ postalCode: null, storedMunicipality: null, province: 'Madrid' });
  ok('no municipality at all degrades',
    b.status === 'degraded' && b.reason === 'no-municipality', JSON.stringify(b));

  const c = resolveTown({ postalCode: '28001', storedMunicipality: 'Madrid', province: null });
  ok('no province degrades even when the town is known',
    c.status === 'degraded' && c.reason === 'no-province', JSON.stringify(c));

  const d = resolveTown({ postalCode: null, storedMunicipality: '   ', province: 'Madrid' });
  ok('whitespace-only stored value degrades',
    d.status === 'degraded' && d.reason === 'no-municipality', JSON.stringify(d));
}

section('determinism');
{
  const input = { postalCode: '07839', storedMunicipality: 'Sevilla', province: 'Illes Balears' };
  ok('same input -> same resolution',
    JSON.stringify(resolveTown(input)) === JSON.stringify(resolveTown(input)));
  ok('every resolution records its source',
    (['cp-muni', 'stored-gazetteer', 'province'] as const).includes(resolveTown(input).source));
}

console.log(
  failures === 0
    ? `\nAll resolve-town tests passed (${checks} checks).`
    : `\n${failures} FAILURE(S) of ${checks} checks.`,
);
process.exit(failures === 0 ? 0 : 1);
