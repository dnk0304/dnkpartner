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
import { mintAuctionUrlV3, MintGateError } from '@/lib/seo/mint-url-v3';
/**
 * T1 (Ken, 2026-08-13): this script referenced `MAX_URL_LEN_V3` without importing
 * it. Worth being precise about what that was and was not:
 *
 *   • It was NOT an unenforced ceiling. The gate lives in `mintAuctionUrlV3`
 *     (`mint-url-v3.ts` — `if (p.url.length > MAX_URL_LEN_V3) throw`), and it is
 *     backstopped a second time by the DB's own `CHECK (length(url) <= 200)`.
 *     Both were live for every one of the 192,870 minted rows.
 *   • It WAS a latent `ReferenceError` on line 115 — the summary string built
 *     only when `overCeiling > 0`. So the failure it would cause is: a run that
 *     correctly detected over-ceiling rows crashes while REPORTING them, instead
 *     of printing the gate table and exiting 1. Never reached, because
 *     overCeiling has always been 0.
 *
 * Imported from the same module the gate reads it from, so the number in the
 * message and the number in the check cannot differ.
 */
import { MAX_URL_LEN_V3 } from '@/lib/seo/descriptor-v3';

/**
 * ⭐ THE PER-ROW RULES NOW LIVE IN `@/lib/seo/mint-url-v3`, NOT HERE.
 *
 * They were lifted out on 2026-08-05 so that MINT-ON-INGEST could reuse them
 * verbatim instead of re-deriving them. This script is now one of two callers of
 * `mintAuctionUrlV3`; the sweep behind `POST /api/mint/url-v3/run` is the other.
 * Keeping a private copy here would have re-created the exact defect that
 * dispatch was raised to prevent: a batch slug and an ingest slug for the same
 * row, both permanent, silently disagreeing.
 *
 * What stays here is what is genuinely BATCH-only: CSV parsing, TSV emission,
 * and the CORPUS-WIDE gates (cross-row duplicate detection) that a single-row
 * caller cannot perform and delegates to the DB's UNIQUE index instead.
 */

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
    let outcome;
    try {
      outcome = mintAuctionUrlV3(r);
    } catch (err) {
      // The shared mint THROWS where this script used to accumulate. Translate
      // back into this script's gate counters so the run still reports every
      // problem and exits non-zero at the end, rather than dying on row 1.
      if (!(err instanceof MintGateError)) throw err;
      if (err.code === 'structural-overflow') { overflow += 1; problems.push(`overflow ${r.boeId}`); }
      else if (err.code === 'over-ceiling') { overCeiling += 1; problems.push(err.message); }
      else if (err.code === 'reserved-shadow') { reservedHits.add(err.message); }
      else problems.push(err.message);
      continue;
    }

    if (outcome.status === 'degraded') { degraded += 1; continue; }

    const row = outcome.row;
    if (row.guardSignals) guarded += 1;
    maxLen = Math.max(maxLen, row.url.length);

    // CORPUS-WIDE gate — the one check a single-row caller cannot do. At ingest
    // this same guarantee comes from `UNIQUE(auction_url_v3.url)`.
    const prev = seen.get(row.url);
    if (prev) { dupes += 1; problems.push(`DUPLICATE ${row.url} <- ${prev} + ${r.boeId}`); }
    seen.set(row.url, r.boeId);

    const line = tsv(
      row.auctionId, row.boeId, row.url, row.provinceSlug, row.townSlug, row.townSource,
      row.ine ?? '', row.refTail, row.descriptor, row.descriptorFull, row.truncated,
      row.guardSignals ?? '',
    );
    (outcome.status === 'held' ? held : mint).push(line);
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
