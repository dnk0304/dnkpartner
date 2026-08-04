/**
 * NEGATIVE TESTS for the structural descriptor guard (Ken condition, 2026-08-04):
 * prove it strips a KNOWN plate, a KNOWN CSV token and a KNOWN URL — using the
 * verbatim strings measured in the live corpus, not invented fixtures.
 *
 * Equally important: prove it does NOT strip the look-alikes that dominate the
 * corpus (road codes, cadastral refs, street numbers). A guard that eats real
 * addresses would be worse than no guard.
 *
 * Run: npx tsx src/lib/seo/descriptor-guard.test.ts
 */
import { guardDescriptor, hasSensitiveContent } from './descriptor-guard';

let failures = 0;
let checks = 0;

function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function section(t: string) {
  console.log(`\n# ${t}`);
}

// ───────────────────────────────────────────────────────────────────────────
section('STRIPS — verbatim corpus rows that carry a real identifier');

// SUB-JA-2020-145159 / SUB-JA-2021-174578 [Turismos]
{
  const raw =
    'LICENCIA DE AUTOTAXI Nº 12.767 INSCRIPCION: BIEN Nº 20150040488, MATRICULA 5751GTS, 28032, MADRID, Madrid';
  const r = guardDescriptor(raw);
  ok('plate 5751GTS is gone', !/5751\s?GTS/i.test(r.text), r.text);
  ok('the word MATRICULA is gone', !/matricula/i.test(r.text), r.text);
  ok('a strip signal was raised', r.signals.length > 0);
  ok('street/locality context survives', /AUTOTAXI/i.test(r.text) && /MADRID/i.test(r.text), r.text);
}

// SUB-JA-2018-89759 [Otros inmuebles] — PROPERTY category carrying a plate.
// This is the row a category-based rule would have missed.
{
  const raw =
    'BIEN Nº 20150017885, LICENCIA DE TAXI Nº 6558 DEL AYUNTAMIENTO DE MADRID, MATRICULA E6037HTP, 28917, MADRID, Madrid';
  const r = guardDescriptor(raw);
  ok('plate E6037HTP is gone (property category)', !/E6037HTP/i.test(r.text), r.text);
  ok('signal raised for a NON-vehicle row', r.signals.some((s) => s.kind.startsWith('plate')));
}

// SUB-JA-2024-227468 [Otros inmuebles] — old-format plate WITH vehicle context.
{
  const raw = 'CR-8348-X Marca: Citroen';
  const r = guardDescriptor(raw);
  ok('old-format plate CR-8348-X is gone', !/CR-8348-X/i.test(r.text), r.text);
}

// SUB-JA-2025-242513 [Garajes] — justice-system CSV token + gob.es URL.
{
  const raw =
    'Forma parte del edificio en las calles Antonio Castillo, Doctor Creus, Aurelio Serrano y Enrique Código Seguro de Verificación E04799402-MI:uWgK-k7aw-KBzD-EVVR-D Puede verificar este documento en https://www.administraciondejusticia.gob.es Fernánde, 13600, ALCAZAR DE SAN JUAN, Ciudad Real';
  const r = guardDescriptor(raw);
  ok('CSV token value is gone', !/E04799402/i.test(r.text), r.text);
  ok('"Código Seguro de Verificación" is gone', !/c[óo]digo\s+seguro/i.test(r.text), r.text);
  ok('the gob.es URL is gone', !/administraciondejusticia|https?:\/\//i.test(r.text), r.text);
  ok('real street names survive', /Antonio Castillo/i.test(r.text) && /ALCAZAR DE SAN JUAN/i.test(r.text), r.text);
  ok('both a csv-token and a url signal were raised',
    r.signals.some((s) => s.kind === 'csv-token') && r.signals.some((s) => s.kind === 'url'));
}

// SUB-RC-2022-1400100122038 [Locales] — the address IS a URL.
{
  const raw = 'https://www.haciendalocal.es/anunciossobreenajenaciondetalle, Montilla';
  const r = guardDescriptor(raw);
  ok('bare URL address is stripped', !/https?:\/\/|haciendalocal/i.test(r.text), r.text);
  ok('the locality survives the strip', /Montilla/i.test(r.text), r.text);
}

// ───────────────────────────────────────────────────────────────────────────
section('PRESERVES — corpus look-alikes that must NOT be touched');

// 17 of 18 raw old-plate regex hits were these. Stripping them would gut real
// addresses, so each must survive intact.
const mustSurvive: Array<[string, string]> = [
  ['road code HV 4116', 'CARRETERA HV 4116 DE LEPE A LA ANTILLA, 21440, LEPE, Huelva'],
  ['road code BV-1123', 'CR BV-1123 KM 7,5 0, 08298, MARGANELL, Barcelona'],
  ['road code D-3311', 'CARRETERA COMARCAL D-3311 S/N, 03827, BENIMARFULL, Alicante'],
  ['cadastral PG A 2492 F', 'TN PARRITA-BREZALES-PG A 2492 F, 41880, EL RONQUILLO, Sevilla'],
  ['cadastral PG 1 PA 1292', 'PG 1 PA 1292 PJ PEñA RUBIA 0, 46392, SIETE AGUAS, Valencia'],
  ['cadastral DS 8712-SA', "DS 8712-SA CASA BLANCA(S ORL 1 Pl: BJ, 07198, PALMA, Illes Balears"],
  ['ordinary street + number', 'CALLE MENORCA 13, 7º C, 28970, HUMANES DE MADRID, Madrid'],
  ['floor/door prose', 'PASEO ZONA FRANCA 142-146, 4º 3ª, 08038, BARCELONA, Barcelona'],
  ['toponym DON BENITO', 'C/ BARRIAL Nº 15 - 17, 06400, DON BENITO, Badajoz'],
];

for (const [label, raw] of mustSurvive) {
  const r = guardDescriptor(raw);
  ok(`${label} — untouched`, r.text === raw && r.signals.length === 0, `got: ${r.text}`);
}

// ───────────────────────────────────────────────────────────────────────────
section('behaviour and determinism');
{
  ok('null/empty is safe', guardDescriptor(null).text === '' && guardDescriptor('').signals.length === 0);
  const raw = 'MATRICULA 5751GTS, 28032, MADRID';
  ok('idempotent — guarding twice equals guarding once',
    guardDescriptor(guardDescriptor(raw).text).text === guardDescriptor(raw).text);
  ok('deterministic — same input, same output',
    guardDescriptor(raw).text === guardDescriptor(raw).text);
  ok('hasSensitiveContent agrees with signals', hasSensitiveContent(raw) === true);
  ok('hasSensitiveContent false on a clean address',
    hasSensitiveContent('CALLE SEMINARIO, 1, 02006, Albacete, Albacete') === false);
  ok('no leading/trailing separator left behind',
    !/^[\s,.;:-]|[\s,.;:-]$/.test(guardDescriptor('https://x.test/a, Montilla').text));
}

console.log(
  failures === 0
    ? `\nAll descriptor-guard tests passed (${checks} checks).`
    : `\n${failures} FAILURE(S) of ${checks} checks.`,
);
process.exit(failures === 0 ? 0 : 1);
