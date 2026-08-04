/**
 * URL-v3 PRE-MINT PROOF — runs the FULL mint pipeline over the real corpus
 * WITHOUT writing anything, and reports the numbers Ken gates on.
 *
 * Pipeline exercised, in mint order:
 *   1. resolveTown()      — Ken's precedence ladder (CP-MUNI → gazetteer-validated
 *                           stored → province page; contradictions DEGRADE).
 *   2. guardDescriptor()  — structural PII/CSV/URL strip, AT MINT TIME, every row.
 *   3. slug assembly      — /subastas/{province}/{town}/{tipo}-{descriptor}-{ref}
 *
 * Input: a CSV export of the in-scope, NON-QUARANTINED corpus (quarantined rows
 * are excluded by the export query — isolation is respected at the source).
 *
 * Usage: npx tsx scripts/url-v3-premint-proof.ts <mintset.csv>
 */
import { readFileSync } from 'node:fs';
import { resolveTown, type TownResolution } from '@/lib/geo/resolve-town';
import { guardDescriptor, type StripKind } from '@/lib/seo/descriptor-guard';
import { categoryKeyword, capDescriptor } from '@/lib/seo/slug-v2';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';

const DESCRIPTOR_CAP = 80;
const TOTAL_URL_CEILING = 200;

type Row = {
  id: string;
  boeId: string;
  category: string;
  province: string;
  municipality: string;
  postalCode: string;
  address: string;
};

/** Minimal RFC4180 CSV reader — the export may contain commas and quotes. */
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n') { record.push(field); rows.push(record); record = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || record.length) { record.push(field); rows.push(record); }
  const header = rows.shift()!;
  const idx = (n: string) => header.indexOf(n);
  const [I, B, C, P, M, Z, A] = ['id', 'boeId', 'category', 'province', 'municipality', 'postalCode', 'address'].map(idx);
  return rows
    .filter((r) => r.length >= header.length && r[I])
    .map((r) => ({
      id: r[I], boeId: r[B], category: r[C], province: r[P],
      municipality: r[M], postalCode: r[Z], address: r[A],
    }));
}

/** The official BOE/portal ref tail, with lotes expanded. Never truncated. */
function refTail(boeId: string): string {
  const m = boeId.match(/^(.*)-L(\d+)$/);
  if (m) return `${m[1].toLowerCase()}-lote-${m[2]}`;
  return boeId.toLowerCase();
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: url-v3-premint-proof.ts <mintset.csv>'); process.exit(2); }
  const rows = parseCsv(readFileSync(file, 'utf8'));

  const bySource = { 'cp-muni': 0, 'stored-gazetteer': 0, province: 0 } as Record<string, number>;
  const byReason: Record<string, number> = {};
  const guardCounts: Record<StripKind, number> = {
    'plate-explicit': 0, 'plate-modern': 0, 'plate-old': 0, 'csv-token': 0, url: 0,
  };
  const guardedRows: Array<{ boeId: string; category: string; kinds: string[]; matched: string[] }> = [];
  const conflicts: Array<{ boeId: string; cp: string; stored: string }> = [];
  const urls = new Map<string, string[]>(); // url -> boeIds
  let noProvinceSlug = 0;
  let atCap = 0;
  let overCeiling = 0;
  let maxLen = 0;

  for (const r of rows) {
    const town: TownResolution = resolveTown({
      postalCode: r.postalCode,
      storedMunicipality: r.municipality,
      province: r.province,
    });
    bySource[town.source] += 1;

    if (town.status === 'degraded') {
      byReason[town.reason] = (byReason[town.reason] ?? 0) + 1;
      if (town.reason === 'conflict-cp-vs-stored') {
        conflicts.push({ boeId: r.boeId, cp: town.cpMunicipality ?? '', stored: town.storedMunicipality ?? '' });
      }
      continue; // degrades to the province page — no auction URL minted
    }

    const provSlug = PROVINCE_DB_KEY_TO_SLUG[r.province];
    if (!provSlug) { noProvinceSlug += 1; continue; }

    // ── GUARD AT MINT TIME, every row, every category ──────────────────────
    const guarded = guardDescriptor(r.address);
    if (guarded.signals.length) {
      for (const s of guarded.signals) guardCounts[s.kind] += 1;
      guardedRows.push({
        boeId: r.boeId, category: r.category,
        kinds: [...new Set(guarded.signals.map((s) => s.kind))],
        matched: guarded.signals.map((s) => s.matched),
      });
    }

    const townSlug = slugify(town.municipality);
    const kw = categoryKeyword(r.category);
    const descriptorFull = slugify(guarded.text);
    const descriptor = capDescriptor(descriptorFull, DESCRIPTOR_CAP);
    if (descriptorFull.length > DESCRIPTOR_CAP) atCap += 1;

    const ref = refTail(r.boeId);
    const url = descriptor
      ? `/subastas/${provSlug}/${townSlug}/${kw}-${descriptor}-${ref}`
      : `/subastas/${provSlug}/${townSlug}/${kw}-${townSlug}-${ref}`;

    maxLen = Math.max(maxLen, url.length);
    if (url.length > TOTAL_URL_CEILING) overCeiling += 1;

    if (!urls.has(url)) urls.set(url, []);
    urls.get(url)!.push(r.boeId);
  }

  const dupGroups = [...urls.entries()].filter(([, v]) => v.length > 1);
  const minted = [...urls.values()].reduce((a, v) => a + v.length, 0);

  const pct = (n: number) => `${((100 * n) / rows.length).toFixed(2)}%`;
  console.log('='.repeat(72));
  console.log('URL-v3 PRE-MINT PROOF — ladder + guard over the real corpus');
  console.log('='.repeat(72));
  console.log(`rows in scope (non-quarantined)      ${rows.length}`);
  console.log('\n-- TOWN SOURCE LADDER --');
  console.log(`  rung 1  cp-muni                    ${bySource['cp-muni']}  ${pct(bySource['cp-muni'])}`);
  console.log(`  rung 2  stored-gazetteer           ${bySource['stored-gazetteer']}  ${pct(bySource['stored-gazetteer'])}`);
  console.log(`  rung 3  province (degraded)        ${bySource.province}  ${pct(bySource.province)}`);
  console.log('\n-- DEGRADE REASONS --');
  for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(32)} ${v}`);
  }
  console.log(`  (unmappable province slug)       ${noProvinceSlug}`);
  console.log('\n-- ⭐ CP-MUNI vs STORED CONFLICTS (data-quality signal) --');
  console.log(`  conflicts                          ${conflicts.length}`);
  for (const c of conflicts.slice(0, 15)) {
    console.log(`    ${c.boeId}  cp="${c.cp}"  stored="${c.stored}"`);
  }
  if (conflicts.length > 15) console.log(`    … and ${conflicts.length - 15} more`);
  console.log('\n-- DESCRIPTOR GUARD (mint-time, all categories) --');
  for (const [k, v] of Object.entries(guardCounts)) console.log(`  ${k.padEnd(32)} ${v}`);
  console.log(`  rows with >=1 strip                ${guardedRows.length}`);
  for (const g of guardedRows) {
    console.log(`    ${g.boeId} [${g.category}] ${g.kinds.join(',')} :: ${g.matched.join(' | ').slice(0, 90)}`);
  }
  console.log('\n-- MINTED SET --');
  console.log(`  minted rows                        ${minted}`);
  console.log(`  distinct urls                      ${urls.size}`);
  console.log(`  DUPLICATE GROUPS                   ${dupGroups.length}`);
  for (const [u, ids] of dupGroups.slice(0, 10)) console.log(`    ${u} <- ${ids.join(', ')}`);
  console.log(`  descriptors hitting the 80 cap     ${atCap}  (logged as a signal, not an error)`);
  console.log(`  max url length                     ${maxLen}`);
  console.log(`  urls over the ${TOTAL_URL_CEILING}-char ceiling      ${overCeiling}`);

  const pass = dupGroups.length === 0 && overCeiling === 0;
  console.log('\n' + '='.repeat(72));
  console.log(pass ? 'GATE PASS — 0 duplicates, 0 over ceiling' : 'GATE FAIL');
  process.exit(pass ? 0 : 1);
}

main();
