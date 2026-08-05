/**
 * Tests for the SHARED url-v3 mint (`mint-url-v3.ts`) — the function that both
 * the one-shot batch and the ingest sweep now call.
 *
 * The tests that matter most here are not the pretty-url ones. They are:
 *   1. PARITY — the shared function reproduces the batch pipeline BYTE FOR BYTE.
 *      This is the whole point of the refactor: if it ever drifts, an auction
 *      minted at ingest gets a different permanent url than the same auction
 *      would have got from the batch, and permanent means permanent.
 *   2. REFUSAL — every gate THROWS rather than truncating to fit. A url minted
 *      short is wrong forever; a url not minted is merely legacy, and legacy
 *      serves 200.
 *   3. INVARIANTS — everything the DB's CHECK constraints enforce is also
 *      asserted here, so a violation is a red test rather than a 23514 in prod.
 *
 * Run: npx tsx src/lib/seo/mint-url-v3.test.ts
 */
import {
  mintAuctionUrlV3, MintGateError, RESERVED_UNDER_PROVINCE, type MintRowInput,
} from './mint-url-v3';
import {
  buildDescriptorV3, buildAuctionPathV3, refTail, losesIdentifyingDetail, MAX_URL_LEN_V3,
} from './descriptor-v3';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from './slugs';
import { resolveTown } from '../geo/resolve-town';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const section = (t: string) => console.log(`\n# ${t}`);

function row(over: Partial<MintRowInput> = {}): MintRowInput {
  return {
    id: 'ckabcdefghijklmnopqrstuvw',
    boeId: 'SUB-JA-2024-12345',
    category: 'Viviendas',
    province: 'Madrid',
    municipality: 'Madrid',
    postalCode: '28001',
    address: 'CALLE DE ALCALA 45, 3 B',
    ...over,
  };
}

/** Recompute the url the way the ORIGINAL batch loop did, independently. */
function batchUrl(r: MintRowInput): string | null {
  const town = resolveTown({
    postalCode: r.postalCode ?? '', storedMunicipality: r.municipality ?? '', province: r.province ?? '',
  });
  if (town.status !== 'resolved') return null;
  const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[r.province ?? ''];
  if (!provinceSlug) return null;
  const townSlug = slugify(town.municipality);
  if (!townSlug) return null;
  const d = buildDescriptorV3({
    address: r.address, townSlug, provinceSlug, postalCode: r.postalCode,
  });
  return buildAuctionPathV3({
    provinceSlug, townSlug, category: r.category, descriptor: d.descriptor, ref: refTail(r.boeId),
  }).url;
}

// ── 1. Baseline ─────────────────────────────────────────────────────────────
section('mints a normal row');
{
  const out = mintAuctionUrlV3(row());
  ok('status is minted', out.status === 'minted', JSON.stringify(out));
  if (out.status !== 'degraded') {
    console.log(`       url = ${out.row.url}`);
    ok('url has the /subastas/ prefix (DB CHECK auction_url_v3_shape)',
      out.row.url.startsWith('/subastas/'));
    ok('url within the 200 ceiling (DB CHECK auction_url_v3_ceiling)',
      out.row.url.length <= MAX_URL_LEN_V3);
    ok('town_source is an accepted enum value (DB CHECK)',
      out.row.townSource === 'cp-muni' || out.row.townSource === 'stored-gazetteer',
      out.row.townSource);
    ok('the official ref is at the END, untruncated',
      out.row.url.endsWith(`-${refTail('SUB-JA-2024-12345')}`), out.row.url);
    ok('type comes FIRST in the last segment',
      /\/vivienda-/.test(out.row.url), out.row.url);
    ok('two-segment location', out.row.url.split('/').length === 5, out.row.url);
  }
}

// ── 2. PARITY with the batch pipeline ───────────────────────────────────────
section('PARITY — shared mint == original batch pipeline, byte for byte');
{
  const cases: MintRowInput[] = [
    row(),
    row({ category: 'Garajes', address: 'AVDA DE LA CONSTITUCION 12 ES 1 PL 3 PT D' }),
    row({ category: 'Fincas rústicas', address: 'POLIGONO 5 PARCELA 118' }),
    row({ category: null, address: null }),
    row({ address: 'CALLE MAYOR 1, 28001, MADRID' }), // postcode + town mid-string
    row({ boeId: 'SUB-JA-2024-99999-L7' }),           // lote expansion
    row({ category: 'Turismos', address: 'PLAZA DE ESPANA 3' }),
  ];
  for (const c of cases) {
    const mine = mintAuctionUrlV3(c);
    const theirs = batchUrl(c);
    const got = mine.status === 'degraded' ? null : mine.row.url;
    ok(`parity ${c.category ?? 'null'} / ${(c.address ?? 'null').slice(0, 28)}`,
      got === theirs, `shared=${got}\n       batch =${theirs}`);
  }
}

// ── 3. REFUSAL — gates throw, they never truncate ───────────────────────────
section('gates REFUSE rather than silently truncating');
{
  // A pathological ref consumes the whole budget. The ref and the location are
  // inviolable, so there is no correct url — the mint must refuse.
  let threw: unknown = null;
  try { mintAuctionUrlV3(row({ boeId: `SUB-${'X'.repeat(240)}` })); } catch (e) { threw = e; }
  ok('structural overflow throws MintGateError', threw instanceof MintGateError,
    String(threw));
  ok('and the code says structural-overflow',
    threw instanceof MintGateError && threw.code === 'structural-overflow',
    threw instanceof MintGateError ? threw.code : '');

  // Reserved-segment shadowing must never be minted — it would shadow a route.
  ok('RESERVED_UNDER_PROVINCE still contains the paging segments',
    RESERVED_UNDER_PROVINCE.has('pagina') && RESERVED_UNDER_PROVINCE.has('page'));

  // The refusal contract itself: nothing in the module returns a >200 url.
  let over = 0;
  for (let i = 0; i < 400; i += 1) {
    const r = row({
      boeId: `SUB-JA-2024-${i}`,
      address: `CALLE ${'MUY LARGA '.repeat(i % 25)} NUMERO ${i} PISO ${i % 9} PUERTA D`,
    });
    try {
      const out = mintAuctionUrlV3(r);
      if (out.status !== 'degraded' && out.row.url.length > MAX_URL_LEN_V3) over += 1;
    } catch (e) {
      if (!(e instanceof MintGateError)) throw e;
    }
  }
  ok('no minted url exceeds the ceiling across 400 adversarial addresses', over === 0, `${over} over`);
}

// ── 4. HELD — losing identifying detail withholds the mint ──────────────────
section('HELD rows are withheld, not minted poor');
{
  // Registry legalese: the real street sits at the END, so the cap eats it.
  const legalese = row({
    address: 'URBANA NUMERO QUINCE, VIVIENDA EN PLANTA PRIMERA DEL EDIFICIO SITO EN TERMINO '
      + 'MUNICIPAL, INSCRITA AL TOMO 1234 LIBRO 56 FOLIO 78, SIENDO LA DIRECCION EXACTA '
      + 'CALLE DE LA PALMA NUMERO 29 PISO 3 PUERTA B',
  });
  const out = mintAuctionUrlV3(legalese);
  ok('long legalese address is HELD', out.status === 'held', out.status);
  if (out.status === 'held') {
    const d = buildDescriptorV3({
      address: legalese.address, townSlug: 'madrid', provinceSlug: 'madrid',
      postalCode: legalese.postalCode,
    });
    ok('and it is held for the documented reason (identifying detail lost)',
      losesIdentifyingDetail(d.full, d.descriptor));
  }
}

// ── 5. DEGRADED — unresolvable town degrades, never guesses ─────────────────
section('DEGRADED rows produce no url at all');
{
  const noTown = mintAuctionUrlV3(row({ postalCode: null, municipality: null }));
  ok('no town -> degraded', noTown.status === 'degraded', JSON.stringify(noTown));

  const noProv = mintAuctionUrlV3(row({ province: 'Atlantis', postalCode: null, municipality: null }));
  ok('unknown province -> degraded', noProv.status === 'degraded', JSON.stringify(noProv));
}

// ── 6. ADVERSARIAL NAMES ────────────────────────────────────────────────────
section('adversarial address / name inputs');
{
  const nasty: Array<[string, string]> = [
    ['sql-ish', "CALLE O'DONNELL 5'); DROP TABLE \"Auction\";--"],
    ['unicode', 'CARRER DE L’ESGLÉSIA Ñ 12, CAÇADORS'],
    ['emoji', 'CALLE SOL 3 🏠🔥'],
    ['path traversal', 'CALLE ../../etc/passwd 4'],
    ['url in address', 'CALLE MAYOR 1 https://subastas.boe.es/detalle?id=9'],
    ['csv tokens', 'CALLE MAYOR 1;;;,,,\t\tCOL2'],
    ['pure punctuation', '---///...'],
    ['whitespace only', '     '],
    ['very long token', `CALLE ${'A'.repeat(300)}`],
    ['angle brackets', 'CALLE <script>alert(1)</script> 7'],
    ['percent encoding', 'CALLE %2E%2E%2F MAYOR 3'],
    ['newlines', 'CALLE MAYOR 1\nCALLE FALSA 2'],
  ];
  for (const [label, address] of nasty) {
    let out;
    try {
      out = mintAuctionUrlV3(row({ address, boeId: `SUB-JA-2024-${slugify(label)}` }));
    } catch (e) {
      ok(`${label}: refused loudly (acceptable)`, e instanceof MintGateError, String(e));
      continue;
    }
    if (out.status === 'degraded') { ok(`${label}: degraded (acceptable)`, true); continue; }
    const u = out.row.url;
    ok(`${label}: url is safe and in-shape`,
      u.startsWith('/subastas/')
      && u.length <= MAX_URL_LEN_V3
      && /^[a-z0-9/-]+$/.test(u)
      && !u.includes('//')
      && !u.includes('..'),
      u);
  }
}

// ── 7. DETERMINISM ──────────────────────────────────────────────────────────
section('determinism — the same row always mints the same url');
{
  const r = row({ address: 'CALLE DE LA LUNA 8, 1 IZDA' });
  const a = mintAuctionUrlV3(r);
  const b = mintAuctionUrlV3(r);
  ok('two calls agree',
    a.status !== 'degraded' && b.status !== 'degraded' && a.row.url === b.row.url,
    `${a.status !== 'degraded' ? a.row.url : a.status} vs ${b.status !== 'degraded' ? b.row.url : b.status}`);
}

// ── 8. LOCALITY / POSTCODE DUPLICATION ──────────────────────────────────────
section('the descriptor does not repeat what the path already says');
{
  const out = mintAuctionUrlV3(row({ address: 'CALLE MAYOR 1, 28001, MADRID, Madrid' }));
  if (out.status !== 'degraded') {
    const seg = out.row.url.split('/').pop() ?? '';
    ok('own postcode is gone from the descriptor', !seg.includes('28001'), seg);
    ok('trailing town repetition is gone', !/-madrid-madrid/.test(seg), seg);
  } else ok('own postcode is gone from the descriptor', false, 'degraded unexpectedly');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
