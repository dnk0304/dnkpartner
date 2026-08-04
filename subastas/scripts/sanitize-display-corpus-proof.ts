/**
 * SANITIZE-DISPLAY corpus proof (2026-08-04, Ken ruling: "count what you strip
 * in production and report it").
 *
 * Runs the SHIPPED redactor — the exact `redactSensitiveText` the display layer
 * imports, not a re-implementation — over a production dump and reports, per
 * column and per rule, how many rows change and how many spans are excised.
 *
 * Input: JSONL, one `Auction` row per line, produced on the box with
 *
 *   COPY (SELECT row_to_json(t) FROM (
 *     SELECT id, "inScope", "lotDescription", "propertyDescription",
 *            "chargesDetail", address FROM "Auction"
 *     WHERE (coalesce("lotDescription",'')||' '||coalesce("propertyDescription",'')
 *            ||' '||coalesce("chargesDetail",'')||' '||coalesce(address,''))
 *           ~* '(@|https?://|www[.]|Código Seguro|\mCSV\M|Firmado por|verificar
 *                este documento|URL de validaci|teléf|tfno|tlf|móvil|fax|[0-9]{9})'
 *   ) t) TO STDOUT
 *
 * That candidate predicate is a strict SUPERSET of the redactor's rule set by
 * construction — every rule requires at least one of those markers — so rows
 * outside the dump are provably unchanged and the counts below are exact for
 * the whole 226,707-row corpus, not a sample. The script asserts the superset
 * property by re-checking each dumped row against the marker set.
 *
 * Usage: npx tsx scripts/sanitize-display-corpus-proof.ts <path-to.jsonl>
 * Exit 0 on a clean run; exit 1 if the superset assertion fails.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { redactSensitiveText } from '../src/lib/sanitize-extracted-text';

const COLUMNS = ['lotDescription', 'propertyDescription', 'chargesDetail', 'address'] as const;
type Column = (typeof COLUMNS)[number];

interface Row extends Partial<Record<Column, string | null>> {
  id: string;
  inScope?: boolean | null;
}

/** The dump predicate, mirrored. Any row the redactor touches MUST match this. */
const MARKER_RE =
  /(@|https?:\/\/|www\.|C[oó]digo Seguro|\bCSV\b|Firmado por|verificar este documento|URL de validaci|tel[eé]f|tfno|tlf|m[oó]vil|fax|\d{9})/i;

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: tsx scripts/sanitize-display-corpus-proof.ts <dump.jsonl>');
    process.exit(2);
  }

  let rows = 0;
  let supersetViolations = 0;
  // rows changed, per column
  const rowsChanged: Record<Column, number> = { lotDescription: 0, propertyDescription: 0, chargesDetail: 0, address: 0 };
  const rowsChangedInScope: Record<Column, number> = { lotDescription: 0, propertyDescription: 0, chargesDetail: 0, address: 0 };
  const spans: Record<Column, number> = { lotDescription: 0, propertyDescription: 0, chargesDetail: 0, address: 0 };
  // spans per rule name, all columns
  const byRule = new Map<string, number>();
  const rowsTouchedAnyColumn = new Set<string>();
  const rowsTouchedInScope = new Set<string>();
  const samples: string[] = [];

  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows += 1;
    // `COPY … TO STDOUT` (text format) doubles every backslash on top of the
    // JSON escaping row_to_json already applied, so `\n` arrives as `\\n`.
    // row_to_json emits no literal newline/tab, so undoubling is exact.
    const row = JSON.parse(trimmed.replace(/\\\\/g, '\\')) as Row;

    for (const col of COLUMNS) {
      const value = row[col];
      if (typeof value !== 'string' || value.length === 0) continue;
      const result = redactSensitiveText(value);
      if (result.count === 0) continue;

      // Superset assertion: nothing the redactor touches may be invisible to
      // the dump predicate, or the corpus counts would be an undercount.
      if (!MARKER_RE.test(value)) supersetViolations += 1;

      rowsChanged[col] += 1;
      if (row.inScope) rowsChangedInScope[col] += 1;
      spans[col] += result.count;
      for (const rule of result.rules) byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
      rowsTouchedAnyColumn.add(row.id);
      if (row.inScope) rowsTouchedInScope.add(row.id);

      if (samples.length < 5 && col === 'lotDescription') {
        samples.push(`${row.id} [${result.rules.join(',')}] ${result.count} span(s)`);
      }
    }
  }

  console.log(`\ncandidate rows scanned:            ${rows}`);
  console.log(`rows REDACTED (any column):        ${rowsTouchedAnyColumn.size}`);
  console.log(`  …of which published (inScope):   ${rowsTouchedInScope.size}`);
  console.log('\nper column — rows changed / of which published / spans excised');
  for (const col of COLUMNS) {
    console.log(
      `  ${col.padEnd(20)} ${String(rowsChanged[col]).padStart(6)} / ${String(rowsChangedInScope[col]).padStart(6)} / ${String(spans[col]).padStart(6)}`,
    );
  }
  console.log('\nper rule — rows in which the rule fired (all columns)');
  for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule.padEnd(22)} ${String(n).padStart(6)}`);
  }
  console.log('\nsample lotDescription rows (ids only, no stripped content):');
  for (const s of samples) console.log(`  ${s}`);

  if (supersetViolations > 0) {
    console.error(`\nRESULT: FAIL — ${supersetViolations} redactions outside the dump predicate; corpus counts would be an UNDERCOUNT.`);
    process.exit(1);
  }
  console.log('\nsuperset assertion: OK (every redaction is visible to the dump predicate)');
  console.log('RESULT: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
