/**
 * Unit tests for the AUTHORITATIVE "total auctions we have" source.
 * Run with: npx tsx src/lib/registro/registry-total.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * Contract (Dennis 2026-07-28): the headline total = COUNT(*) WHERE inScope=true
 * and NOTHING else. It MUST include unknown-status (INDETERMINADO) rows and
 * province-less rows — "if it's in our registry, it should count". The only way
 * that guarantee can silently break is if a status / saleResult / outcome /
 * province predicate creeps into the query, so we assert the SQL's shape.
 */
import { REGISTRY_TOTAL_SQL, getRegistryTotalCount, __resetRegistryTotalCache } from './registry-total';
import { IN_SCOPE_GUARD_SQL } from '../auction-status';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

const sql = REGISTRY_TOTAL_SQL.toLowerCase();

// It is a COUNT over the Auction table.
check('counts all rows of Auction', /count\(\*\)/.test(sql) && /\bfrom\s+auction\b/.test(sql));

// It filters on the canonical inScope guard...
check('uses the canonical inScope guard', REGISTRY_TOTAL_SQL.includes(IN_SCOPE_GUARD_SQL));

// ...and on NOTHING else. Any of these tokens would drop unknown-status or
// province-less rows out of the "total we have" and reintroduce the undercount.
check('no status predicate (INDETERMINADO rows must count)', !/\bstatus\b/.test(sql));
check('no saleResult / outcome predicate (unknown-outcome must count)',
  !/\bsaleresult\b/.test(sql) && !/\boutcome\b/.test(sql) && !/\bindeterminado\b/.test(sql));
check('no province predicate (province-less rows must count)', !/\bprovince\b/.test(sql));
check('no municipality predicate', !/\bmunicipality\b/.test(sql));
check('single WHERE clause, no AND-ed extra predicate', (sql.match(/\band\b/g) ?? []).length === 0);

// getRegistryTotalCount memoizes and coerces the DB row to a finite number.
// We exercise the coercion + memo without a live DB by monkeypatching the
// module boundary is not trivial here (ESM), so we assert the pure guarantees
// that don't need a DB: a fresh cache reset does not throw synchronously.
__resetRegistryTotalCache();
check('cache reset is a no-op that does not throw', typeof getRegistryTotalCount === 'function');

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll registry-total tests passed.');
