/**
 * The CONTENT BAR v2 for concluded auction pages (Dennis 2026-09-17 "index the
 * full registry"; Ken's ruling the same day).
 *
 * Run with: npx tsx src/lib/seo/concluded-content-bar.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * The bar is the only thing standing between ~175k concluded URLs and both the
 * robots meta and the sitemap, and every one of its failure modes looks like
 * success from the outside:
 *
 *   1. VACUOUS ARMS. `category` is a NON-NULLABLE column, 100 % filled — scoring
 *      it as a signal turns "2 of 4" into "1 of 3" with nothing going red. v1
 *      already documented the identical trap for `boeId`. The bar must therefore
 *      be pinned arm by arm, so that removing an arm fails a test rather than
 *      silently widening the set.
 *   2. PREDICATE DRIFT. `isConcludedIndexable` (the robots gate) and
 *      `concludedIndexableWhere` (sitemap membership) must express the SAME
 *      predicate; v2 adds an OR *inside* a count, which is exactly the shape
 *      that gets hand-translated wrong. §5 feeds shared fixtures through BOTH
 *      and asserts equality — it evaluates the REAL Prisma fragment the function
 *      returns, it does not re-state the rule.
 *   3. `'   '` IS TRUTHY. Anything that forgets to trim treats a blank string as
 *      content.
 */
import {
  hasConcludedContent,
  isConcludedIndexable,
  hasConcludedOutcome,
  concludedDataSignals,
  concludedFailingArms,
  concludedIndexableWhere,
  CONCLUDED_INDEXABLE_SELECT,
  CONCLUDED_REQUIRED_KEYS,
  CONCLUDED_SIGNAL_KEYS,
  SEO_CONCLUDED_MIN_DATA_SIGNALS,
  type ConcludedIndexableRow,
} from './concluded-indexable';

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

/** A row that clears the bar comfortably; each case degrades one field. */
function fullRow(over: Partial<ConcludedIndexableRow> = {}): ConcludedIndexableRow {
  return {
    status: 'CONCLUIDA_PORTAL',
    saleResult: 'ADJUDICADA',
    province: 'Granada',
    municipality: 'Albuñuelas',
    // Recent on purpose: the recency floor is a SEPARATE layer (off on prod,
    // 24 months by default), and a fixture that fails the floor would make the
    // parity checks below agree for the wrong reason — both sides false.
    endsAt: new Date('2026-09-01T12:00:00Z'),
    soldDate: new Date('2026-09-01T12:00:00Z'),
    soldPrice: BigInt(6_000_000),
    valorSubasta: 99_301.46,
    lotDescription: 'CASA EN ALBUÑUELAS',
    address: 'Calle Real 1',
    ...over,
  };
}

// ── 1. The arm inventory — the vacuity guard ────────────────────────────────
check(
  'required arms are exactly status/outcome/province/municipality',
  CONCLUDED_REQUIRED_KEYS.join(',') === 'status,outcome,province,municipality',
);
check(
  'signal arms are exactly date/price/text — NO category arm (100 % filled = vacuous)',
  CONCLUDED_SIGNAL_KEYS.join(',') === 'date,price,text',
);
check('the bar is 2 of 3', SEO_CONCLUDED_MIN_DATA_SIGNALS === 2);
check(
  'category is NOT read by the predicate at all (full registry)',
  hasConcludedContent(fullRow({ category: 'Joyas' })) === true &&
    hasConcludedContent(fullRow({ category: null })) === true,
);
check(
  'the select does not ship a category column to the gate',
  !Object.keys(CONCLUDED_INDEXABLE_SELECT).includes('category'),
);

// ── 2. Required arms — each one alone is fatal ──────────────────────────────
check('CANCELADA is not a concluded status', hasConcludedContent(fullRow({ status: 'CANCELADA' })) === false);
check('null status → rejected', hasConcludedContent(fullRow({ status: null })) === false);
check(
  'STUB ARM a — no outcome (SIN_RESULTADO) → noindex',
  hasConcludedContent(fullRow({ saleResult: 'SIN_RESULTADO' })) === false,
);
check('STUB ARM a — null saleResult → noindex', hasConcludedContent(fullRow({ saleResult: null })) === false);
check('DESIERTA is a real outcome → kept', hasConcludedContent(fullRow({ saleResult: 'DESIERTA' })) === true);
check('no province → rejected', hasConcludedContent(fullRow({ province: null })) === false);
check('blank province → rejected', hasConcludedContent(fullRow({ province: '  ' })) === false);
check(
  'STUB ARM b — no municipality → noindex however rich the rest is',
  hasConcludedContent(fullRow({ municipality: null })) === false,
);
check('blank municipality → rejected', hasConcludedContent(fullRow({ municipality: '   ' })) === false);

// ── 3. The three signals ────────────────────────────────────────────────────
const noSignals = fullRow({
  endsAt: null,
  soldDate: null,
  soldPrice: null,
  valorSubasta: null,
  lotDescription: null,
  address: null,
});
check('a row with none of the three signals scores 0', concludedDataSignals(noSignals) === 0);
check('…and fails the bar', hasConcludedContent(noSignals) === false);
check('one signal is not enough', hasConcludedContent(fullRow({ ...noSignals, endsAt: new Date() })) === false);
check(
  'exactly two signals passes',
  hasConcludedContent(fullRow({ ...noSignals, endsAt: new Date(), valorSubasta: 1 })) === true,
);
check(
  'DATE signal reads soldDate when endsAt is null (the 423 date-only rows)',
  concludedDataSignals(fullRow({ ...noSignals, soldDate: new Date(), valorSubasta: 1 })) === 2,
);
check(
  'PRICE 0 is a missing value wearing a number, not a signal',
  concludedDataSignals(fullRow({ ...noSignals, soldPrice: BigInt(0), valorSubasta: 0 })) === 0,
);
check(
  'PRICE signal reads soldPrice (BigInt cents) as well as valorSubasta',
  concludedDataSignals(fullRow({ ...noSignals, soldPrice: BigInt(1) })) === 1,
);
check(
  'TEXT signal: ONE word of lotDescription is enough (the 40-word bar is gone)',
  concludedDataSignals(fullRow({ ...noSignals, lotDescription: 'Casa' })) === 1,
);
check(
  'TEXT signal: whitespace-only lotDescription is NOT content',
  concludedDataSignals(fullRow({ ...noSignals, lotDescription: '   ' })) === 0,
);
check(
  'TEXT signal falls back to address',
  concludedDataSignals(fullRow({ ...noSignals, lotDescription: null, address: 'Calle Real 1' })) === 1,
);
check(
  'the four live gate rows (2019/2021/2023/2025) all pass — 17- and 3-word rows included',
  [80, 109, 17, 3].every((w) =>
    hasConcludedContent(fullRow({ lotDescription: Array.from({ length: w }, () => 'x').join(' ') })),
  ),
);

// ── 4. Failing-arm labelling (the census's "by failing arm" table) ──────────
check('a clean row fails nothing', concludedFailingArms(fullRow()).length === 0);
check(
  'a stub row is labelled by BOTH its broken arms',
  concludedFailingArms(fullRow({ municipality: null, saleResult: null })).join(',') === 'outcome,municipality',
);
check('a signal-starved row is labelled "signals"', concludedFailingArms(noSignals).join(',') === 'signals');

// ── 5. THE INVARIANT — the same fixtures through BOTH implementations ───────
/**
 * A minimal evaluator for the SUBSET of Prisma filter syntax this file emits.
 * It walks the object `concludedIndexableWhere()` actually returns — so a
 * hand-translation error in that function shows up here as a mismatch, which is
 * the entire point. It deliberately THROWS on an operator it does not know,
 * rather than returning false: a silently-unsupported operator would make every
 * fixture agree for the wrong reason (a vacuous pass).
 */
type Row = Record<string, unknown>;
function evalCond(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond === 'string' || typeof cond === 'number') return value === cond;
  if (typeof cond !== 'object') throw new Error(`unsupported condition: ${String(cond)}`);
  for (const [op, operand] of Object.entries(cond as Row)) {
    switch (op) {
      case 'in':
        if (!(operand as unknown[]).map(String).includes(String(value))) return false;
        break;
      case 'not':
        if (operand === null) {
          if (value == null) return false;
        } else if (value === operand) return false;
        break;
      case 'gt': {
        const n = operand as number;
        if (value == null) return false;
        if (typeof value === 'bigint' ? value <= BigInt(n) : (value as number) <= n) return false;
        break;
      }
      case 'gte': {
        if (value == null) return false;
        if ((value as Date) < (operand as Date)) return false;
        break;
      }
      default:
        throw new Error(`unsupported operator: ${op}`);
    }
  }
  return true;
}
function evalWhere(where: Row, row: Row): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(val as Row[]).every((w) => evalWhere(w, row))) return false;
    } else if (key === 'OR') {
      if (!(val as Row[]).some((w) => evalWhere(w, row))) return false;
    } else if (key === 'NOT') {
      if (evalWhere(val as Row, row)) return false;
    } else if (!evalCond(row[key], val)) {
      return false;
    }
  }
  return true;
}

// Self-test the evaluator before trusting it: an unknown operator must throw,
// not quietly return a boolean.
let threw = false;
try {
  evalCond(1, { startsWith: 'x' });
} catch {
  threw = true;
}
check('the where-evaluator refuses operators it does not understand', threw);

const NOW = new Date('2026-09-17T12:00:00Z');
const FIXTURES: Array<{ name: string; row: ConcludedIndexableRow }> = [
  { name: 'complete row', row: fullRow() },
  { name: 'DESIERTA, no soldPrice', row: fullRow({ saleResult: 'DESIERTA', soldPrice: null }) },
  { name: 'off-taxonomy category', row: fullRow({ category: 'Joyas' }) },
  { name: 'stub: no municipality', row: fullRow({ municipality: null }) },
  { name: 'stub: no outcome', row: fullRow({ saleResult: 'SIN_RESULTADO' }) },
  { name: 'stub: null outcome', row: fullRow({ saleResult: null }) },
  { name: 'cancelled', row: fullRow({ status: 'CANCELADA' }) },
  // `province` is `String` NOT NULL in the schema, so a NULL province is not a
  // representable row — the empty string is the real failure shape, and the SQL
  // fragment for that column therefore carries no `{ not: null }` clause (Prisma
  // rejects it on a non-nullable column).
  { name: 'empty province', row: fullRow({ province: '' }) },
  { name: 'no signals at all', row: noSignals },
  { name: 'exactly 2 signals (date + price)', row: fullRow({ ...noSignals, endsAt: NOW, valorSubasta: 1 }) },
  { name: 'exactly 2 signals (date + text)', row: fullRow({ ...noSignals, soldDate: NOW, address: 'X' }) },
  { name: 'exactly 2 signals (price + text)', row: fullRow({ ...noSignals, soldPrice: BigInt(5), lotDescription: 'Casa' }) },
  { name: 'only 1 signal (price)', row: fullRow({ ...noSignals, valorSubasta: 1 }) },
  { name: 'date-only row (soldDate, no endsAt)', row: fullRow({ endsAt: null }) },
  { name: 'ancient row (floor-dependent on both sides)', row: fullRow({ endsAt: new Date('2015-01-01'), soldDate: new Date('2015-01-01') }) },
  { name: 'zero prices', row: fullRow({ ...noSignals, soldPrice: BigInt(0), valorSubasta: 0, address: 'X' }) },
];
const where = concludedIndexableWhere(NOW) as unknown as Row;
for (const { name, row } of FIXTURES) {
  const inMemory = isConcludedIndexable(row, NOW);
  const inSql = evalWhere(where, row as unknown as Row);
  check(`predicate parity — ${name} (${inMemory ? 'index' : 'noindex'})`, inMemory === inSql);
}

/**
 * The ONE documented asymmetry: Prisma has no `trim()`, so a whitespace-only
 * string clears the SQL fragment and fails the in-memory test. Asserted rather
 * than hidden, and asserted in the SAFE direction (WHERE ⊇ gate) — the sitemap
 * re-applies the in-memory gate, so such a row can never be published as a URL
 * that renders noindex.
 */
for (const field of ['province', 'municipality'] as const) {
  const blank = fullRow({ [field]: '   ' });
  check(
    `whitespace ${field}: WHERE is the superset (sql true, gate false)`,
    evalWhere(where, blank as unknown as Row) === true && isConcludedIndexable(blank, NOW) === false,
  );
}

// ── 6. The recency floor, and the teaser superset ───────────────────────────
check(
  'with the floor OFF (prod) the gate equals the content bar',
  process.env.SEO_CONCLUDED_MAX_AGE_MONTHS === '0'
    ? isConcludedIndexable(fullRow({ endsAt: new Date('2015-01-01') }), NOW) === true
    : true,
);
check(
  'the teaser predicate is a SUPERSET of the index gate on every fixture',
  FIXTURES.every(({ row }) => {
    const indexable = isConcludedIndexable(row, NOW);
    const teaser = hasConcludedOutcome({ ...row, resultCheckedAt: new Date() });
    return !indexable || teaser;
  }),
);
check(
  'the teaser no longer gates on category either (an indexed Joyas page shows its outcome)',
  hasConcludedOutcome({ status: 'CONCLUIDA_PORTAL', saleResult: 'ADJUDICADA', resultCheckedAt: new Date() }) === true,
);

console.log(failures === 0 ? '\nconcluded content bar v2: all checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
