/**
 * _fixture-guard — close the silent path that let a fixture seed the WRONG data
 * and still report green (Forge, 2026-08-13, Ken P2b §2.3).
 *
 * THE DEFECT THIS EXISTS FOR. `AuctionStatus.FINALIZADA` does not exist — the
 * enum has `CONCLUIDA_PORTAL` / `FINALIZADA_AUTORIDAD`. Fixtures run under
 * `tsx`, which does NOT typecheck, so the member evaluated to `undefined`,
 * Prisma dropped the field, and every "concluded" row was seeded with the column
 * DEFAULT (`CELEBRANDOSE` — i.e. ACTIVE). Three committed fixtures carried it.
 * Nothing failed. The e2e suites went green against a corpus that did not
 * contain the thing they were asserting about.
 *
 * ⭐ WHY A RUNTIME GUARD AND NOT JUST A TYPECHECK. `tsconfig.scripts.json` +
 * `npm run typecheck:scripts` is the primary fix and it catches this at the
 * source. But a typecheck only protects scripts someone remembers to check, and
 * the failure mode here is precisely "nobody looked". `undefined` reaching an
 * ORM that treats it as "field absent" is a general trap — a typo'd enum member,
 * a renamed constant, an optional chain that missed — so the last line of
 * defence is at the insert, where the cost of being wrong is a whole
 * verification round.
 */

/**
 * Reject any row carrying an `undefined` value.
 *
 * `undefined` is not "no opinion" to Prisma — it means "omit this column", so it
 * silently becomes the DEFAULT. That is indistinguishable from a deliberate
 * omission at the call site and invisible in the seeded data unless you go
 * looking. A fixture always knows every column it means to set, so `undefined`
 * in a fixture row is always a bug: fail, loudly, naming the field.
 */
export function assertNoUndefinedFields(
  rows: ReadonlyArray<Record<string, unknown>>,
  label = 'fixture',
): void {
  const offenders: string[] = [];
  rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined) offenders.push(`row ${i}: ${k}`);
    }
  });
  if (offenders.length > 0) {
    throw new Error(
      `[${label}] ${offenders.length} field(s) are undefined and would silently ` +
        `take the column DEFAULT. Almost always a non-existent enum member or a ` +
        `renamed constant — check the schema for the exact spelling.\n  ` +
        offenders.slice(0, 10).join('\n  '),
    );
  }
}

/**
 * Assert the seeded rows landed in the states the fixture intended.
 *
 * The complement of the check above: that one catches the undefined BEFORE the
 * insert, this one catches everything else that could put a row in the wrong
 * state (a bad rollup, a partial delete, a default that changed) by reading the
 * distribution back OUT of the database. `expected` is a map of value → count;
 * an unexpected value present at all is a failure, not a warning.
 */
export function assertDistribution(
  actual: ReadonlyArray<{ value: string | null; count: number }>,
  expected: Readonly<Record<string, number>>,
  label: string,
): void {
  const problems: string[] = [];
  const seen = new Map(actual.map((a) => [a.value ?? '<null>', a.count]));
  for (const [value, count] of seen) {
    if (!(value in expected)) problems.push(`unexpected ${label}=${value} (${count} rows)`);
    else if (expected[value] !== count) problems.push(`${label}=${value}: expected ${expected[value]}, got ${count}`);
  }
  for (const value of Object.keys(expected)) {
    if (!seen.has(value)) problems.push(`${label}=${value}: expected ${expected[value]}, got 0`);
  }
  if (problems.length > 0) {
    throw new Error(`[${label}] seeded distribution is wrong:\n  ${problems.join('\n  ')}`);
  }
}
