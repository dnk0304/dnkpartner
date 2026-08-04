/**
 * SANITIZE-DISPLAY negative + positive tests (2026-08-04, Ken ruling).
 *
 * Run with: npx tsx src/lib/sanitize-display.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention;
 * `vitest` is NOT a dependency of this package and importing it breaks tsc).
 *
 * BOTH-DIRECTION proof, per the brief:
 *   Direction 1 — the filter CATCHES. Every "must strip" case below is a
 *                 VERBATIM string read out of the production corpus (row id
 *                 quoted), not a hand-written specimen. A filter never seen to
 *                 catch anything is not a filter.
 *   Direction 2 — the filter does NOT over-reach. Legitimate addresses, road
 *                 codes, cadastral references, postal codes, IDUFIR and the
 *                 `matrícula SE-62` social-housing registry code survive
 *                 unchanged. (SE-62 is the case Ghost's extractor gets right
 *                 and the mint-time slug guard got wrong.)
 *
 * Surfaces exercised: the shared redactor, the detail-body choke
 * (`sanitizeExtractedText`), the JSON-LD emitter and the title/H1 helper.
 */
import {
  redactSensitiveText,
  redactForDisplay,
  sanitizeExtractedText,
} from './sanitize-extracted-text';
import { auctionDisplayTitle, auctionMetaTitle } from './seo/display-title';
import { buildAuctionJsonLd } from './seo/json-ld';

let failures = 0;
let checks = 0;

function check(label: string, cond: boolean, detail?: string): void {
  checks += 1;
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function mustStrip(label: string, corpusRow: string, input: string, needles: string[]): void {
  const out = redactForDisplay(input) ?? '';
  const survived = needles.filter((n) => out.includes(n));
  check(
    `${label} [row ${corpusRow}]`,
    survived.length === 0,
    survived.length ? `still present: ${JSON.stringify(survived)} in ${JSON.stringify(out)}` : undefined,
  );
}

function mustSurvive(label: string, corpusRow: string, input: string, needles: string[]): void {
  const out = redactForDisplay(input) ?? '';
  const lost = needles.filter((n) => !out.includes(n));
  check(
    `${label} [row ${corpusRow}]`,
    lost.length === 0,
    lost.length ? `wrongly removed: ${JSON.stringify(lost)} from ${JSON.stringify(out)}` : undefined,
  );
}

// ---------------------------------------------------------------------------
// DIRECTION 1 — verbatim production strings that MUST be stripped
// ---------------------------------------------------------------------------
console.log('\nDIRECTION 1 — must strip (verbatim corpus strings)');

// e-justice document stamp spliced mid-street. Ghost reproduced this shape
// against live BOE pages; 77 rows carry the label in prod.
const CSV_STAMP =
  'de la Manzana VII de la citada Urbanización. Dicha vivienda mide una ' +
  'Código Seguro de Verificación E04799402-MI:h6Rb-N8PK-enKg-acYm-S ' +
  'Puede verificar este documento en https://www.administraciondejusticia.gob.es ' +
  'superficie útil de ochenta';
mustStrip('CSV verification token + verification URL', '75e2e4e3-1b68-4d4f-94fc-84e0effd7f12', CSV_STAMP, [
  'E04799402',
  'Código Seguro de Verificación',
  'administraciondejusticia.gob.es',
  'http',
]);
// …and the surrounding real prose must survive the excision (Ghost's rule:
// excise the stamp, keep the street).
mustSurvive('…surrounding prose survives the excision', '75e2e4e3-1b68-4d4f-94fc-84e0effd7f12', CSV_STAMP, [
  'de la Manzana VII',
  'superficie útil de ochenta',
]);

// Signer name attached to the stamp.
mustStrip('Firmado por + signer name', '94d7acc8-7d2c-40be-906f-b218142477cd',
  '4, Zamora, de uso local principal residencial, con una superficie de ' +
  'Código Seguro de Verificación E04799402-MI:PrqU-9kUS-ZvZG-ZsZY-G ' +
  'Puede verificar este documento en https://www.administraciondejusticia.gob.es ' +
  'Firmado por: ANTONIO JARAMILLO',
  ['E04799402', 'Firmado por', 'ANTONIO JARAMILLO', 'http']);

// A private depositary's personal mobile, published under his name.
mustStrip('phone — labelled, private depositary', 'c72f9918-31c1-4463-a0e8-9c27f2d8d19f',
  'con el depositario Francisco R. M. en el teléfono 639649100, hay fotografías..',
  ['639649100']);
mustStrip('phone — labelled, uppercase variant', '59ade9e0-c0ca-4c80-ae0c-c5acb4c53ffe',
  'DEPOSITARIO:FRANCISCO CHAVES HERNANDEZ CON TELEFÓNO: 620546029',
  ['620546029']);
mustStrip('phone — bare 9-digit run, no label', 'synthetic-shape-of-e97609f7',
  'El vehículo se entregará previa cita en 639649100 según acuerdo.',
  ['639649100']);
mustStrip('phone — +34 and grouped forms', 'shape-check',
  'Contacto +34 610 22 33 44 y 954-123-456.',
  ['610 22 33 44', '954-123-456']);

// e-mail addresses — 25 rows in prod.
mustStrip('email — property manager', '69ef8522-c844-4ebf-bb95-f9f11ef39674',
  'habitual\tNo\nSituación posesoria\tSin ocupantes\nVisitable\tSí (portalinmobiliario@cofivacasa.com)',
  ['portalinmobiliario@cofivacasa.com']);
mustStrip('email — ministry mailbox', 'cf7ec492-b9bc-4e25-a27e-96beb77f5f45',
  ' funcionamiento, solicitando una cita al correo electrónico gestion.orga-algeciras@mjusticia.es)',
  ['gestion.orga-algeciras@mjusticia.es']);
mustStrip('email — private counterparty', 'c2a2zqvm5hrydnjr498idgnup',
  'te correo electrónico a la siguiente dirección electrónica: info@eugeniogorrindo.es',
  ['info@eugeniogorrindo.es']);

// Bare http/www fragments (brief item 4).
mustStrip('bare www fragment', 'shape-check',
  'Se puede consultar la WEB del Organismo en la siguiente dirección: www.haciendalocal.es/anuncios',
  ['www.haciendalocal.es']);
mustStrip('CSV abbreviated form + tramita URL', 'shape-of-ADDRFIELD-test',
  'CSV: M95DJ4BD https://www.tramita.gva.es/csv-front/index.faces?cadena=M95DJ4BD',
  ['M95DJ4BD', 'tramita.gva.es']);

// ---------------------------------------------------------------------------
// DIRECTION 2 — legitimate content that MUST survive
// ---------------------------------------------------------------------------
console.log('\nDIRECTION 2 — must survive (verbatim corpus strings)');

mustSurvive('road code CV-20 + postal code', '9f20ff8b-5e02-481b-9e14-d285d87fab34',
  'Carretera de Onda CV-20 Km 1, 12540 Vila-real (Castellón)',
  ['Carretera de Onda', 'CV-20', 'Km 1', '12540', 'Vila-real']);
mustSurvive('road code N-211', 'd01eda48-becf-48f6-9bd9-1bfa2d0e5d96',
  'CARRETERA N-211, MOLINA DE ARAGÓN, 19300, MOLINA DE ARAGON, Guadalajara',
  ['CARRETERA N-211', '19300', 'Guadalajara']);
mustSurvive('road code N-234 + km with decimal comma', '25355dfe-b7f7-4f2a-8e59-7feed93995d1',
  'CARRETERA N-234 KM 72,60. DISEMINADOS 99, 44477, ALBENTOSA, Teruel',
  ['N-234', 'KM 72,60', 'DISEMINADOS 99', '44477']);
mustSurvive('cadastral reference (20 chars)', 'e5aabaeb-bfd9-488f-ab61-1b364164c31d',
  'Referencia catastral: 4857110VG1745N0001DS. VALORADA A EFECTOS',
  ['4857110VG1745N0001DS']);
mustSurvive('cadastral reference (digit-heavy)', 'a125344c-a894-40b3-a19e-d05572259804',
  'Referencia catastral: 3383301YH253850014BK Tasación que sirve',
  ['3383301YH253850014BK']);
// THE case Ghost's extractor gets right and the mint-time slug guard got wrong.
mustSurvive('matrícula SE-62 (social-housing registry code, NOT a plate)', '5d89f0d7-1fd4-4e15-be4a-d7ecfd57af68',
  'de Viviendas denominado “General Merry” matrícula SE-62 y número de cuenta 326 de Sevilla.',
  ['matrícula SE-62', 'General Merry', 'cuenta 326']);
// Vehicle identity: the plate IS the goods on a vehicle lot, not third-party
// PII. Deliberately preserved (see module header); flagged to Ken.
mustSurvive('vehicle plate + VIN on a vehicle lot', '07ea3e79-ddca-453c-9de5-dc1df5fd5e5b',
  'matrícula 2275GZN, número de bastidor VF1FDA1D644366300. CÓDIGO REGISTRAL ÚNICO',
  ['2275GZN', 'VF1FDA1D644366300']);
mustSurvive('IDUFIR (14 digits) survives', 'shape-check',
  'IDUFIR: 28079000123456 Superficie construida: 75,40 m2',
  ['28079000123456', '75,40 m2']);
mustSurvive('large euro amount is not a phone number', 'shape-check',
  'Valor de tasación 1.234.567,89 euros.',
  ['1.234.567,89']);
mustSurvive('clean address is returned byte-identical', 'shape-check',
  'Calle León y Castillo 373 4º pta 4-1, Las Palmas de Gran Canaria',
  ['Calle León y Castillo 373 4º pta 4-1, Las Palmas de Gran Canaria']);

// ---------------------------------------------------------------------------
// SURFACE COVERAGE — the same contaminated blob, through every published path
// ---------------------------------------------------------------------------
console.log('\nSURFACE COVERAGE — every path that publishes this text');

const DIRTY_BLOB =
  'Vivienda en Sevilla. Contacto teléfono 639649100 y correo info@eugeniogorrindo.es. ' +
  'Código Seguro de Verificación E04799402-MI:h6Rb-N8PK-enKg-acYm-S ' +
  'Puede verificar este documento en https://www.administraciondejusticia.gob.es\n' +
  'Dirección\tCalle León y Castillo 373 teléfono 639649100\n' +
  'Referencia catastral\t4857110VG1745N0001DS';

const LEAKS = ['639649100', 'info@eugeniogorrindo.es', 'E04799402', 'administraciondejusticia'];

// Surface 1 — detail page body / API projections (both go through this choke).
{
  const out = sanitizeExtractedText(DIRTY_BLOB) ?? '';
  const survived = LEAKS.filter((n) => out.includes(n));
  check('surface: detail body + API projections (sanitizeExtractedText)',
    survived.length === 0, `leaked ${JSON.stringify(survived)}`);
}

// Surface 2 — JSON-LD structured data (machine-readable; search engines ingest
// this even when the rendered body is clean).
{
  const ld = buildAuctionJsonLd({
    id: 'test-id',
    boeId: 'SUB-TEST-1',
    title: 'Inmueble',
    category: 'Inmuebles',
    province: 'Sevilla',
    municipality: 'Sevilla',
    status: 'ACTIVE',
    auctionType: 'inmueble',
    propertyType: 'Vivienda',
    address: 'Calle León y Castillo 373',
    lotDescription: DIRTY_BLOB,
    propertyDescription: DIRTY_BLOB,
  } as Parameters<typeof buildAuctionJsonLd>[0]);
  const serialized = JSON.stringify(ld);
  const survived = LEAKS.filter((n) => serialized.includes(n));
  check('surface: JSON-LD structured data (buildAuctionJsonLd)',
    survived.length === 0, `leaked ${JSON.stringify(survived)}`);
}

// Surface 3 — H1 / <title> / OpenGraph title, via the lotDescription fallback
// AND via the 1b "surface the stored address verbatim" branch.
{
  const titleFromLot = auctionDisplayTitle({
    address: null,
    lotDescription: DIRTY_BLOB,
    propertyType: 'Vivienda',
    auctionType: 'inmueble',
    category: 'Inmuebles',
    municipality: 'Sevilla',
    province: 'Sevilla',
    title: 'SUB-TEST-1',
  });
  const survived = LEAKS.filter((n) => titleFromLot.includes(n));
  check('surface: H1/title via lotDescription fallback',
    survived.length === 0 && !titleFromLot.includes('639649100'),
    `title = ${JSON.stringify(titleFromLot)}`);

  // 1b branch: a dirty stored address that has no parseable via-type is
  // surfaced VERBATIM by the title helper — the allowlist does not apply there.
  const dirtyAddress = 'Sevilla capital, contacto 639649100, info@eugeniogorrindo.es';
  const titleFromAddress = auctionDisplayTitle({
    address: dirtyAddress,
    lotDescription: null,
    propertyType: 'Vivienda',
    auctionType: 'inmueble',
    category: 'Inmuebles',
    municipality: 'Sevilla',
    province: 'Sevilla',
    title: 'SUB-TEST-1',
  });
  const survived1b = LEAKS.filter((n) => titleFromAddress.includes(n));
  check('surface: H1/title via verbatim-address (1b) branch',
    survived1b.length === 0, `title = ${JSON.stringify(titleFromAddress)}`);

  // Meta <title> uses the same resolver.
  const meta = auctionMetaTitle({
    address: dirtyAddress,
    lotDescription: DIRTY_BLOB,
    propertyType: 'Vivienda',
    auctionType: 'inmueble',
    category: 'Inmuebles',
    municipality: 'Sevilla',
    province: 'Sevilla',
    title: 'SUB-TEST-1',
  });
  check('surface: <title> + OpenGraph (auctionMetaTitle)',
    LEAKS.every((n) => !meta.includes(n)), `meta = ${JSON.stringify(meta)}`);
}

// ---------------------------------------------------------------------------
// Idempotence + null-safety
// ---------------------------------------------------------------------------
console.log('\nINVARIANTS');
{
  const once = redactSensitiveText(DIRTY_BLOB).text;
  const twice = redactSensitiveText(once).text;
  check('redaction is idempotent', once === twice);
  check('null-safe', redactForDisplay(null) === null && redactForDisplay(undefined) === null);
  check('empty-after-redaction yields null', redactForDisplay('info@eugeniogorrindo.es') === null);
  check('clean text is untouched (no allocation-visible change)',
    redactForDisplay('Calle Mayor 3, Madrid') === 'Calle Mayor 3, Madrid');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}
console.log('RESULT: ALL PASS');
