/**
 * Hand-verification harness for the CP -> municipality table.
 *
 *   DATABASE_URL=... npx tsx scripts/spot-check-cp-municipality.ts 04700 28001 ...
 *
 * For each postcode it prints the table's verdict next to the RAW corpus rows
 * that produced it — including the quarantined rows, so a reviewer can see
 * exactly what was excluded and confirm the exclusion was the right call.
 * Read-only.
 */

import { Client } from 'pg';
import path from 'path';
import { readFileSync } from 'fs';

const REPO = path.resolve(__dirname, '..');
const table = JSON.parse(readFileSync(path.join(REPO, 'src/data/cp-municipality.json'), 'utf8'));
const report = JSON.parse(
  readFileSync(path.join(REPO, 'src/data/cp-municipality-report.json'), 'utf8'),
);

async function run() {
  const cps = process.argv.slice(2).filter((a) => /^[0-9]{5}$/.test(a));
  if (cps.length === 0) throw new Error('pass one or more 5-digit postcodes');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const cp of cps) {
    const live = await client.query(
      `SELECT a.municipality, a.province, (q.id IS NOT NULL) AS quarantined, count(*)::int AS n
         FROM "Auction" a
         LEFT JOIN geo_quarantine_20260803 q ON q.id = a.id
        WHERE a."postalCode" = $1 AND coalesce(a.municipality,'') <> ''
        GROUP BY 1,2,3 ORDER BY 4 DESC`,
      [cp],
    );

    let verdict = 'ABSENT (postcode not in corpus)';
    if (table.entries[cp]) {
      const e = table.entries[cp];
      verdict = `MAPPED -> ${e.municipality} (${e.province}, INE ${e.ine}) support=${e.support} unanimous=${e.unanimous} discarded=${e.discarded}`;
    } else if (report.conflicts[cp]) {
      verdict = `CONFLICT -> ${report.conflicts[cp].candidates
        .map((c: { municipality: string; support: number }) => `${c.municipality}:${c.support}`)
        .join(' | ')} (discarded ${report.conflicts[cp].discarded})`;
    } else if (report.provinceMismatch[cp]) {
      const e = report.provinceMismatch[cp];
      verdict = `PROVINCE-MISMATCH -> ${e.municipality} (${e.province}, INE ${e.ine}) vs CP prefix ${e.cpProvincePrefix} — withheld`;
    } else if (report.unresolved[cp]) {
      verdict = `UNRESOLVED -> no gazetteer-valid name; discarded ${JSON.stringify(
        report.unresolved[cp].discarded,
      )}`;
    }

    console.log(`\n=== ${cp} ===`);
    console.log(`table:  ${verdict}`);
    console.log('corpus rows:');
    for (const r of live.rows) {
      console.log(
        `  ${String(r.n).padStart(4)}  ${r.quarantined ? '[QUARANTINED] ' : '              '}${r.municipality}  (province col: ${r.province})`,
      );
    }
  }

  await client.end();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
