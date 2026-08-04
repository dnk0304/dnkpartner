/**
 * URL-v3 MINT PAYLOAD GENERATOR.
 *
 * Runs the full mint pipeline over a fresh corpus export and emits a TSV of the
 * rows to be minted. Writes NOTHING to any database — the TSV is loaded into a
 * staging table and promoted transactionally by the mint runbook.
 *
 * Re-asserts every gate AT MINT TIME (Ken's condition), not just at proof time:
 *   - 0 duplicate urls
 *   - 0 urls over the 200-char ceiling, 0 structural overflow
 *   - PII/CSV/URL guard live on every row, every category
 *   - no quarantined row (excluded by the export query)
 *   - no hex-legacy row (excluded by the export query)
 *   - held rows separated out, never minted
 *   - no province/town slug shadows a reserved route segment
 *
 * Exits non-zero on ANY gate failure, so the runbook cannot proceed on a bad set.
 *
 * Usage: npx tsx scripts/url-v3-mint-payload.ts <fresh.csv> <out-mint.tsv> <out-held.tsv>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveTown } from '@/lib/geo/resolve-town';
import {
  buildDescriptorV3, buildAuctionPathV3, refTail, losesIdentifyingDetail, MAX_URL_LEN_V3,
} from '@/lib/seo/descriptor-v3';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';

/**
 * Route segments that already exist under /subastas. A province slug equal to
 * one of these would shadow a real route; a town slug equal to a second-level
 * one would shadow the town-hub's own children. Derived from the live app
 * router (src/app/subastas/*) plus the verified live sitemap.
 */
const RESERVED_UNDER_SUBASTAS = new Set(['subasta', 'tipo', 'pagina', 'page', 'api']);
const RESERVED_UNDER_PROVINCE = new Set(['pagina', 'page']);

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

const tsv = (...f: (string | number | boolean)[]) =>
  f.map((v) => String(v).replace(/[\t\r\n\\]/g, ' ')).join('\t');

function main() {
  const [src, outMint, outHeld] = process.argv.slice(2);
  if (!src || !outMint || !outHeld) {
    console.error('usage: url-v3-mint-payload.ts <fresh.csv> <out-mint.tsv> <out-held.tsv>');
    process.exit(2);
  }
  const rows = parseCsv(readFileSync(src, 'utf8'));
  const problems: string[] = [];

  const mint: string[] = [];
  const held: string[] = [];
  const seen = new Map<string, string>(); // url -> boeId
  let dupes = 0, overCeiling = 0, overflow = 0, guarded = 0, degraded = 0, maxLen = 0;
  const reservedHits = new Set<string>();

  for (const r of rows) {
    const town = resolveTown({
      postalCode: r.postalCode, storedMunicipality: r.municipality, province: r.province,
    });
    if (town.status !== 'resolved') { degraded += 1; continue; }
    const provinceSlug = PROVINCE_DB_KEY_TO_SLUG[r.province];
    if (!provinceSlug) { degraded += 1; continue; }
    const townSlug = slugify(town.municipality);
    if (!townSlug) { degraded += 1; continue; }

    // Reserved-segment guard, asserted against REAL slugs rather than assumed.
    if (RESERVED_UNDER_SUBASTAS.has(provinceSlug)) reservedHits.add(`province:${provinceSlug}`);
    if (RESERVED_UNDER_PROVINCE.has(townSlug)) reservedHits.add(`town:${townSlug}`);

    const d = buildDescriptorV3({ address: r.address, townSlug, provinceSlug });
    if (d.signals.length) guarded += 1;

    const p = buildAuctionPathV3({
      provinceSlug, townSlug, category: r.category, descriptor: d.descriptor, ref: refTail(r.boeId),
    });
    if (p.structuralOverflow) { overflow += 1; problems.push(`overflow ${r.boeId}`); continue; }
    if (p.url.length > MAX_URL_LEN_V3) { overCeiling += 1; problems.push(`over-ceiling ${r.boeId} ${p.url.length}`); }
    maxLen = Math.max(maxLen, p.url.length);

    const prev = seen.get(p.url);
    if (prev) { dupes += 1; problems.push(`DUPLICATE ${p.url} <- ${prev} + ${r.boeId}`); }
    seen.set(p.url, r.boeId);

    const isHeld = losesIdentifyingDetail(d.full, d.descriptor) || p.ceilingTrimmed;
    const line = tsv(
      r.id, r.boeId, p.url, provinceSlug, townSlug, town.source, town.ine ?? '',
      refTail(r.boeId), d.descriptor, d.full, d.truncated,
      d.signals.length ? JSON.stringify(d.signals) : '',
    );
    (isHeld ? held : mint).push(line);
  }

  // ── GATES ────────────────────────────────────────────────────────────────
  if (dupes) problems.push(`${dupes} duplicate urls`);
  if (overCeiling) problems.push(`${overCeiling} urls over ${MAX_URL_LEN_V3}`);
  if (overflow) problems.push(`${overflow} structural overflow`);
  if (reservedHits.size) problems.push(`reserved-segment shadowing: ${[...reservedHits].join(', ')}`);

  writeFileSync(outMint, mint.join('\n') + (mint.length ? '\n' : ''), 'utf8');
  writeFileSync(outHeld, held.join('\n') + (held.length ? '\n' : ''), 'utf8');

  console.log('='.repeat(70));
  console.log('URL-v3 MINT PAYLOAD');
  console.log('='.repeat(70));
  console.log(`  source rows (in scope, non-quarantined) ${rows.length}`);
  console.log(`  degraded -> province page               ${degraded}`);
  console.log(`  HELD (identifying detail lost)          ${held.length}`);
  console.log(`  MINT                                    ${mint.length}`);
  console.log(`  distinct urls (mint+held)               ${seen.size}`);
  console.log(`  guard fired on                          ${guarded} rows`);
  console.log(`  max url length                          ${maxLen}`);
  console.log(`  reserved-segment shadowing              ${reservedHits.size}`);
  console.log(`\n  GATES: dupes=${dupes} overCeiling=${overCeiling} overflow=${overflow}`);
  if (problems.length) {
    console.log('\nGATE FAIL:');
    for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log('\nGATE PASS — payload written.');
}

main();
