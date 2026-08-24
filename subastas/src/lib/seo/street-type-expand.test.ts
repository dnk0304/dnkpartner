/**
 * Tests for Spanish via-type full-word expansion (url-street-fullword).
 * Run: npx tsx src/lib/seo/street-type-expand.test.ts
 *
 * Proves EVERY code in the map (unambiguous + the ambiguous skip-set), the
 * leading-token anchoring (never a substring replace), particle/co-official
 * pass-through, and idempotency.
 */
import {
  expandLeadingViaType,
  classifyLeadingViaType,
  VIA_TYPE_EXPANSION,
  AMBIGUOUS_VIA_CODES,
} from './street-type-expand';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const section = (t: string) => console.log(`\n# ${t}`);

section('every UNAMBIGUOUS code expands as a leading token');
for (const [code, full] of Object.entries(VIA_TYPE_EXPANSION)) {
  const out = expandLeadingViaType(`${code}-mayor-12`);
  ok(`${code} -> ${full}`, out === `${full}-mayor-12`, out);
  // As the ONLY token too.
  ok(`${code} alone -> ${full}`, expandLeadingViaType(code) === full, expandLeadingViaType(code));
  // Classification agrees.
  const cls = classifyLeadingViaType(`${code}-mayor-12`);
  ok(`${code} classified expanded`, cls.action === 'expanded' && cls.expandedTo === full);
}

section('the measured frequency codes map to the expected full words');
const EXPECTED: Record<string, string> = {
  c: 'calle', cl: 'calle', avda: 'avenida', av: 'avenida', avd: 'avenida',
  ur: 'urbanizacion', urb: 'urbanizacion', lg: 'lugar', cr: 'carretera',
  ctra: 'carretera', pz: 'plaza', pg: 'poligono', cm: 'camino', cami: 'camino',
  cno: 'camino', ps: 'paseo', ed: 'edificio', bo: 'barrio', tr: 'travesia',
  rd: 'ronda', rb: 'rambla', gl: 'glorieta',
};
for (const [code, full] of Object.entries(EXPECTED)) {
  ok(`measured ${code} -> ${full}`, VIA_TYPE_EXPANSION[code] === full, `got ${VIA_TYPE_EXPANSION[code]}`);
}

section('AMBIGUOUS codes are left UNEXPANDED and flagged');
for (const code of AMBIGUOUS_VIA_CODES) {
  const input = `${code}-del-rio-4`;
  ok(`${code} passes through unchanged`, expandLeadingViaType(input) === input, expandLeadingViaType(input));
  ok(`${code} not present in expansion map`, !(code in VIA_TYPE_EXPANSION));
  const cls = classifyLeadingViaType(input);
  ok(`${code} classified ambiguous-skipped`, cls.action === 'ambiguous-skipped' && cls.expandedTo === null);
}
// The dispatch's named ambiguous set, exactly.
ok('ambiguous set is exactly pj/pa/pd/ds/tn/no',
  [...AMBIGUOUS_VIA_CODES].sort().join(',') === 'ds,no,pa,pd,pj,tn');

section('NEVER a substring replace — leading token only, whole-token match');
{
  // A real street name that STARTS with code letters must not be touched.
  ok('clara (street named) untouched', expandLeadingViaType('clara-de-campoamor-3') === 'clara-de-campoamor-3');
  ok('avenida already full — idempotent', expandLeadingViaType('avenida-del-puerto-4') === 'avenida-del-puerto-4');
  ok('calle already full — idempotent', expandLeadingViaType('calle-mayor-1') === 'calle-mayor-1');
  // Code appearing NOT at the leading position is not expanded.
  ok('mid-string cl not expanded', expandLeadingViaType('plaza-cl-nonsense') === 'plaza-cl-nonsense');
  ok('mid-string c not expanded', expandLeadingViaType('mayor-c-2') === 'mayor-c-2');
}

section('name particles and co-official full words pass through');
for (const w of ['la', 'el', 'los', 'las', 'san', 'de', 'del', 'carrer', 'rua']) {
  ok(`${w} untouched`, expandLeadingViaType(`${w}-something-2`) === `${w}-something-2`);
}

section('edge cases');
{
  ok('empty string', expandLeadingViaType('') === '');
  ok('idempotent: expand twice == expand once',
    expandLeadingViaType(expandLeadingViaType('cl-mayor-1')) === 'calle-mayor-1');
  ok('unchanged classified as unchanged',
    classifyLeadingViaType('mayor-12').action === 'unchanged');
}

console.log(`\n${failures ? 'FAIL' : 'PASS'} — ${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);
