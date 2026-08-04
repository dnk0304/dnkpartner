/**
 * URL-v3 DESCRIPTOR-CAP FUNCTIONAL TEST (Ken, 2026-08-04).
 *
 * ONE question: when a descriptor is truncated at the cap, does the truncated
 * form still DISTINGUISH THIS DOOR FROM ITS NEIGHBOURS?
 *   - truncation drops IDENTIFYING detail (floor / door / building) -> raise to ~100
 *   - truncation drops trailing NOISE                               -> keep 80
 * Uniqueness is unaffected either way (the ref tail carries it).
 *
 * ⚠️ This runs the REAL descriptor pipeline, which the earlier pre-mint proof
 * did NOT: that script slugified the guarded address directly and so left the
 * postcode + town + province ON THE END of every descriptor. Those three are
 * already in the path segments, are pure duplication, and slug-v2's own
 * `propertyDescriptor` strips them. Judging truncation without stripping them
 * first would measure the loss of noise we should never have carried.
 *
 * Usage: npx tsx scripts/url-v3-cap-functional-test.ts <mintset.csv> [sampleN]
 */
import { readFileSync } from 'node:fs';
import { resolveTown } from '@/lib/geo/resolve-town';
import { guardDescriptor } from '@/lib/seo/descriptor-guard';
import { categoryKeyword, capDescriptor } from '@/lib/seo/slug-v2';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';

type Row = { id: string; boeId: string; category: string; province: string;
             municipality: string; postalCode: string; address: string };

function parseCsv(text: string): Row[] {
  const rows: string[][] = []; let field = ''; let record: string[] = []; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n') { record.push(field); rows.push(record); record = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || record.length) { record.push(field); rows.push(record); }
  const h = rows.shift()!; const ix = (n: string) => h.indexOf(n);
  const [I, B, C, P, M, Z, A] = ['id','boeId','category','province','municipality','postalCode','address'].map(ix);
  return rows.filter((r) => r.length >= h.length && r[I]).map((r) => ({
    id: r[I], boeId: r[B], category: r[C], province: r[P], municipality: r[M], postalCode: r[Z], address: r[A] }));
}

/** slug-v2's cadastral-unit compaction: "es 1 pl 3 pt d" -> "pl3-d". */
function compactUnit(folded: string): string {
  return folded
    .replace(/\bes-\d+\b/g, '')
    .replace(/\bpl-(-?\d+)\b/g, 'pl$1')
    .replace(/\bpt-([a-z0-9]+)\b/g, '$1')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Drop trailing postcode / town / province — all already in the path. */
function stripTrailingLocality(seg: string, ...localities: string[]): string {
  let out = seg;
  // A trailing 5-digit postcode carries nothing the path lacks.
  for (let pass = 0; pass < 4; pass += 1) {
    for (const loc of localities) {
      if (!loc || loc === 'sin-municipio') continue;
      if (out === loc) return '';
      if (out.endsWith(`-${loc}`)) out = out.slice(0, -(loc.length + 1));
    }
    out = out.replace(/-\d{5}$/, '');
  }
  return out.replace(/-+$/, '');
}

function main() {
  const file = process.argv[2];
  const sampleN = Number(process.argv[3] ?? 25);
  const rows = parseCsv(readFileSync(file, 'utf8'));

  type Hit = { boeId: string; category: string; full: string; kept: string; dropped: string };
  const hits: Hit[] = [];
  let minted = 0;
  let overRaw = 0; // cap hits WITHOUT locality stripping (the old, inflated measure)

  for (const r of rows) {
    const town = resolveTown({ postalCode: r.postalCode, storedMunicipality: r.municipality, province: r.province });
    if (town.status !== 'resolved') continue;
    const provSlug = PROVINCE_DB_KEY_TO_SLUG[r.province];
    if (!provSlug) continue;
    minted += 1;

    const guarded = guardDescriptor(r.address);
    const raw = slugify(guarded.text);
    if (raw.length > 80) overRaw += 1;

    const townSlug = slugify(town.municipality);
    const full = stripTrailingLocality(compactUnit(raw), townSlug, provSlug);
    if (full.length <= 80) continue;

    const kept = capDescriptor(full, 80);
    hits.push({ boeId: r.boeId, category: r.category, full, kept, dropped: full.slice(kept.length).replace(/^-/, '') });
  }

  // ── IDENTIFYING-DETAIL PROBE on the DROPPED tail ──────────────────────────
  // Two ways a tail can distinguish this door from its neighbours:
  //   (a) UNIT detail — floor / door / building / block / unit designator.
  //   (b) STREET detail — a street-type marker or house number. On rows whose
  //       `address` is registry legalese ("urbana numero quince, piso duplex…"),
  //       the ACTUAL STREET often sits at the END and is exactly what a naive
  //       cap removes. Missing this was an undercount in the first pass — it
  //       scored `…-local-a4` and `…-calle-cesar-augusto-n-14` as noise.
  const UNIT_IDENT =
    /(^|-)(pl\d+|planta|piso|puerta|pta|escalera|esc|bloque|blq|portal|edificio|edif|atico|izda|izq|dcha|dcho|local|nave|parcela|duplex|letra)(-|$)/;
  const STREET_IDENT =
    /(^|-)(calle|c|avda|avenida|plaza|pza|paseo|camino|carrer|ronda|travesia|urbanizacion|urb|poligono|partida)(-|$)/;
  const HOUSE_NUM = /(^|-)n?-?\d{1,4}(-|$)/;

  const isIdentifying = (tail: string) =>
    UNIT_IDENT.test(tail) || STREET_IDENT.test(tail) || HOUSE_NUM.test(tail);

  const withIdent = hits.filter((h) => isIdentifying(h.dropped));

  // What would raising the cap to 100 actually buy?
  const at100 = hits.filter((h) => h.full.length > 100);
  const savedBy100 = hits.length - at100.length;
  const identSavedBy100 = withIdent.filter((h) => h.full.length <= 100).length;

  console.log('='.repeat(78));
  console.log('DESCRIPTOR-CAP FUNCTIONAL TEST — does truncation drop identifying detail?');
  console.log('='.repeat(78));
  console.log(`minted rows                                   ${minted}`);
  console.log(`cap hits WITHOUT locality strip (old measure) ${overRaw}`);
  console.log(`cap hits WITH the real pipeline               ${hits.length}`);
  console.log(`  of which the DROPPED tail carries`);
  console.log(`  IDENTIFYING detail (unit OR street)          ${withIdent.length}` +
              (hits.length ? `  (${((100 * withIdent.length) / hits.length).toFixed(1)}% of cap hits)` : ''));
  console.log(`  => identifying loss as %% of ALL minted       ${((100 * withIdent.length) / minted).toFixed(2)}%`);
  console.log(`\n-- WHAT RAISING THE CAP TO 100 WOULD BUY --`);
  console.log(`  cap hits that disappear at 100               ${savedBy100}  (${((100 * savedBy100) / Math.max(1, hits.length)).toFixed(1)}% of hits)`);
  console.log(`  IDENTIFYING losses recovered at 100          ${identSavedBy100}  (${((100 * identSavedBy100) / Math.max(1, withIdent.length)).toFixed(1)}% of ident losses)`);
  console.log(`  still truncated at 100                       ${at100.length}`);
  console.log(`\n--- sample of ${sampleN} truncations (deterministic stride) ---`);

  const stride = Math.max(1, Math.floor(hits.length / sampleN));
  const sample = hits.filter((_, i) => i % stride === 0).slice(0, sampleN);
  for (const h of sample) {
    const flag = isIdentifying(h.dropped) ? 'IDENTIFYING' : 'noise';
    console.log(`\n[${flag}] ${h.boeId} (${h.category})  full=${h.full.length}`);
    console.log(`  kept   : ${h.kept}`);
    console.log(`  DROPPED: ${h.dropped}`);
  }

  console.log('\n' + '='.repeat(78));
  console.log(hits.length === 0
    ? 'No descriptor exceeds 80 under the real pipeline — cap is not binding.'
    : `VERDICT INPUT: ${withIdent.length}/${hits.length} truncations lose identifying detail.`);
}

main();
