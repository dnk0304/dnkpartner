/**
 * The CONTENT BAR for concluded auction pages (Dennis 2026-09-17).
 *
 * Run with: npx tsx src/lib/seo/concluded-content-bar.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 *
 * Dennis 2026-09-17: "we should also index finished auctions, those are pages we
 * have filled with all the info about the auctions and redirect links to the
 * official one... Keep noindex only for genuinely empty/placeholder records."
 *
 * That replaced the wave142 gate (a RESOLVED SALE OUTCOME) with a CONTENT bar.
 * This file pins the bar, because it is now the only thing standing between
 * ~200k concluded URLs and the sitemap, and because two of its clauses fail in
 * ways that look like success:
 *
 *   1. `boeId` is non-nullable, so scoring it as the "BOE reference" signal
 *      would make that signal always true and quietly halve the bar.
 *   2. `'   '.split(/\s+/)` has length 2, so a blank description would clear a
 *      2-word bar unless the input is trimmed first.
 *
 * It also pins the DIRECTION of the sitemap invariant (`sitemap ⊆ indexable`),
 * which replaced the old "identical predicate" doctrine when the bar became
 * something SQL cannot express.
 */
import {
  hasConcludedContent,
  isConcludedIndexable,
  concludedDescriptionWords,
  concludedDataSignals,
  concludedIndexableWhere,
  SEO_CONCLUDED_MIN_DESCRIPTION_WORDS,
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

const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ');

/** A row that clears the bar comfortably; each case degrades one field. */
function fullRow(over: Partial<ConcludedIndexableRow> = {}): ConcludedIndexableRow {
  return {
    status: 'CONCLUIDA_PORTAL',
    category: 'Viviendas',
    municipality: 'Granada',
    lotDescription: words(50),
    propertyDescription: null,
    appraisalValue: 120_000,
    valorSubasta: null,
    cadastralRef: '1234567AB1234C0001XY',
    courtName: 'Juzgado de Primera Instancia n.o 3 de Granada',
    courtReference: 'JV-2024-1',
    endsAt: new Date(),
    ...over,
  };
}

// ── 1. The description word count ───────────────────────────────────────────
check(
  'word count spans BOTH prose columns combined',
  concludedDescriptionWords(fullRow({ lotDescription: words(20), propertyDescription: words(25) })) === 45,
);
check(
  'whitespace-only prose counts as 0 words, not 2 (the split-without-trim trap)',
  concludedDescriptionWords(fullRow({ lotDescription: '   ', propertyDescription: null })) === 0,
);
check(
  'a row ONE WORD under the bar is rejected',
  hasConcludedContent(
    fullRow({ lotDescription: words(SEO_CONCLUDED_MIN_DESCRIPTION_WORDS - 1), propertyDescription: null }),
  ) === false,
);
check(
  'a row exactly AT the bar is accepted',
  hasConcludedContent(
    fullRow({ lotDescription: words(SEO_CONCLUDED_MIN_DESCRIPTION_WORDS), propertyDescription: null }),
  ) === true,
);

// ── 2. Data signals ─────────────────────────────────────────────────────────
// THE TRAP: Auction.boeId is `String @unique` — NON-nullable. Every row has one.
// Scoring it as the court/BOE signal would make it unconditionally true and turn
// a 2-of-4 bar into a 1-of-3 bar. A row with no court columns, no price and no
// cadastral ref must score ONLY endsAt.
const noSignals = fullRow({
  appraisalValue: null,
  valorSubasta: null,
  cadastralRef: null,
  courtName: null,
  courtReference: null,
});
check('boeId is NOT scored as a court/BOE reference signal', concludedDataSignals(noSignals) === 1);
check('a row scoring only endsAt fails the bar', hasConcludedContent(noSignals) === false);
check(
  'a scraped 0 price is treated as absent, not as a price',
  concludedDataSignals(
    fullRow({ appraisalValue: 0, valorSubasta: 0, cadastralRef: null, courtName: null, courtReference: null }),
  ) === 1,
);
check(
  'courtName + courtReference together are ONE signal, not two',
  concludedDataSignals(fullRow({ appraisalValue: null, valorSubasta: null, cadastralRef: null })) === 2,
);

// ── 3. Placeholder rejection ────────────────────────────────────────────────
check('no municipality → rejected however rich the rest is', hasConcludedContent(fullRow({ municipality: null })) === false);
check('blank municipality → rejected', hasConcludedContent(fullRow({ municipality: '  ' })) === false);
check('out-of-scope category (Joyas) → rejected', hasConcludedContent(fullRow({ category: 'Joyas' })) === false);
check('CANCELADA is not a concluded-with-content status', hasConcludedContent(fullRow({ status: 'CANCELADA' })) === false);

// ⭐ THE POINT OF THE CHANGE: under wave142 this row was noindex purely because
// our result-check pass never resolved an outcome. It is a complete page.
check(
  'a full page with NO resolved sale outcome now clears the bar',
  hasConcludedContent(fullRow({ saleResult: 'SIN_RESULTADO', resultCheckedAt: null })) === true,
);

// ── 4. The recency floor still layers on top ────────────────────────────────
const ancient = fullRow({ endsAt: new Date('2019-05-01T00:00:00Z') });
check('content-rich but ancient row PASSES the content bar', hasConcludedContent(ancient) === true);
check(
  'content-rich but ancient row FAILS the crawl gate (24mo floor, Ken-owned ramp)',
  isConcludedIndexable(ancient) === false,
);
check('null endsAt fails the crawl gate', isConcludedIndexable(fullRow({ endsAt: null })) === false);

// ── 5. sitemap ⊆ indexable (the invariant, restated as DIRECTION) ───────────
const where = concludedIndexableWhere() as Record<string, unknown>;
check('candidate query no longer filters on resultCheckedAt', where.resultCheckedAt === undefined);
check('candidate query no longer filters on saleResult', where.saleResult === undefined);
check('candidate query still carries the status scope', where.status !== undefined);
check('candidate query still carries the category scope', where.category !== undefined);
check('candidate query still carries the recency floor', where.endsAt !== undefined);
check('candidate query carries the non-empty-municipality clauses', Array.isArray(where.AND));

// A row the in-memory gate ACCEPTS must survive every SQL clause, or the sitemap
// under-publishes for a reason nobody can see.
const good = fullRow();
const w5 = concludedIndexableWhere() as {
  status: { in: string[] };
  category: { in: string[] };
  endsAt: { gte: Date };
};
check('indexable row passes the SQL status clause', w5.status.in.map(String).includes(String(good.status)));
check('indexable row passes the SQL category clause', w5.category.in.map(String).includes(String(good.category)));
check('indexable row passes the SQL recency clause', good.endsAt!.getTime() >= w5.endsAt.gte.getTime());
check('the in-memory gate accepts it', isConcludedIndexable(good) === true);

if (failures > 0) {
  console.error(`\nconcluded-content-bar: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nconcluded-content-bar: all assertions passed');
